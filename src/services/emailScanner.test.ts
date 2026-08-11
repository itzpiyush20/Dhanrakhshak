// src/services/emailScanner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAxisEmiGmailMessage } from './__fixtures__/axisEmiDebit'

vi.mock('./googleAuth', () => ({
  getGoogleToken: () => 'fake-access-token',
  clearGoogleToken: () => {},
  tryRefreshGoogleToken: async () => null,
}))

vi.mock('./learningEngine', () => ({
  applyMerchantRulesFromDB: async () => {
    throw new Error('no DB rule — force fallback to local applyMerchantRules')
  },
}))

function makeTableMock(response: any, opts: { insertCapture?: any[] } = {}) {
  const handler: any = {
    select: () => handler,
    eq: () => handler,
    order: () => handler,
    limit: () => handler,
    single: () => Promise.resolve(response),
    insert: (row: any) => {
      opts.insertCapture?.push(row)
      return {
        select: () => ({ single: () => Promise.resolve(response) }),
        then: (resolve: any) => resolve(response),
      }
    },
    then: (resolve: any) => resolve(response),
  }
  return handler
}

describe('scanRealGmailInbox — Axis EMI debit regression', () => {
  const insertedTransactions: any[] = []
  const insertedRejections: any[] = []

  let mockDb: any

  beforeEach(() => {
    insertedTransactions.length = 0
    insertedRejections.length = 0

    mockDb = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } },
        }),
      },
      from: (table: string) => {
        if (table === 'profiles') return makeTableMock({ data: null, error: null })
        if (table === 'email_scan_logs') return makeTableMock({ data: [], error: null })
        if (table === 'cards') return makeTableMock({ data: [], error: null })
        if (table === 'transactions') {
          return makeTableMock({ data: [], error: null }, { insertCapture: insertedTransactions })
        }
        if (table === 'categories') {
          return makeTableMock({
            data: [
              { name: 'Food & Dining', is_permanent: false },
              { name: 'Groceries', is_permanent: false },
              { name: 'Other', is_permanent: true },
            ],
            error: null,
          })
        }
        if (table === 'email_scan_rejections') {
          return makeTableMock({ error: null }, { insertCapture: insertedRejections })
        }
        return makeTableMock({ data: [], error: null })
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }),
        } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        return { ok: true, status: 200, json: async () => makeAxisEmiGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any
  })

  it('captures the Axis EMI debit email as a transaction (amount, direction, event type)', async () => {
    const { scanRealGmailInbox } = await import('./emailScanner')

    const result = await scanRealGmailInbox({
      db: mockDb,
      activeYear: 2026,
      // Force the AI path to fail so this test exercises the regex
      // fallback path — the one that was silently dropping this email.
      askAI: async () => null,
    })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    expect(txn.amount).toBe(42293)
    expect(txn.type).toBe('debit')
    expect(txn.event_type).toBe('emi')
  })
})

describe('scanRealGmailInbox — fetch query includes receipt-shaped keywords', () => {
  it('builds a Gmail query that matches both bank-alert and generic receipt language', async () => {
    let capturedUrl = ''
    const mockDb: any = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } },
        }),
      },
      from: (table: string) => {
        const handler: any = {
          select: () => handler, eq: () => handler, order: () => handler, limit: () => handler,
          single: () => Promise.resolve({ data: null, error: null }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }), then: (r: any) => r({ data: [], error: null }) }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        return handler
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        capturedUrl = url
        return { ok: true, status: 200, json: async () => ({ messages: [] }) } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    const decodedQuery = decodeURIComponent(capturedUrl.match(/[?&]q=([^&]+)/)?.[1] || '')
    expect(decodedQuery).toMatch(/debited OR credited/i)
    expect(decodedQuery).toMatch(/receipt OR invoice OR order OR booking OR trip OR fare OR ride OR subscription OR renewal OR total/i)
  })
})
