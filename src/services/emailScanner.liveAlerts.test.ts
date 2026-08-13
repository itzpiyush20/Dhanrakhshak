// src/services/emailScanner.liveAlerts.test.ts
//
// Recall regression suite built from real inbox mail (see the fixture file for
// what each one broke). Every case runs with `askAI: async () => null`, i.e.
// the AI unavailable — which is not a corner case: the Gemini proxy 429s or
// exhausts its daily quota routinely, and the regex ladder is what runs then.
// A transaction that only survives when the AI answers is not captured
// reliably, so these assert the ladder on its own.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LIVE_BANK_ALERTS, makeLiveAlertGmailMessage } from './__fixtures__/liveBankAlerts'

vi.mock('./googleAuth', () => ({
  getGoogleToken: () => 'fake-access-token',
  clearGoogleToken: () => {},
  tryRefreshGoogleToken: async () => null,
}))

vi.mock('./learningEngine', async () => {
  const actual = await vi.importActual<typeof import('./learningEngine')>('./learningEngine')
  return { ...actual, getMerchantRulesFromDB: async () => [] }
})

function makeTableMock(response: any, capture?: any[]) {
  const handler: any = {
    select: () => handler, eq: () => handler, order: () => handler, limit: () => handler, gte: () => handler,
    update: () => handler,
    single: () => Promise.resolve(response),
    insert: (row: any) => {
      if (capture) {
        if (Array.isArray(row)) capture.push(...row)
        else capture.push(row)
      }
      return {
        select: () => ({
          single: () => Promise.resolve(response),
          then: (r: any) => r({ data: Array.isArray(row) ? row : [row], error: null }),
        }),
        then: (r: any) => r(response),
      }
    },
    then: (r: any) => r(response),
  }
  return handler
}

describe('scanRealGmailInbox — live bank alert recall', () => {
  const inserted: any[] = []
  const rejections: any[] = []
  let db: any

  beforeEach(() => {
    inserted.length = 0
    rejections.length = 0

    db = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        if (table === 'transactions') return makeTableMock({ data: [], error: null }, inserted)
        if (table === 'email_scan_rejections') return makeTableMock({ error: null }, rejections)
        if (table === 'categories') {
          return makeTableMock({
            data: [
              { name: 'Food & Dining', is_permanent: false },
              { name: 'Utilities & Bills', is_permanent: false },
              { name: 'Transport', is_permanent: false },
              { name: 'Other', is_permanent: true },
            ],
            error: null,
          })
        }
        return makeTableMock({ data: [], error: null })
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: LIVE_BANK_ALERTS.map((s) => ({ id: `msg-${s.id}`, threadId: `thread-${s.id}` })) }),
        } as any
      }
      const spec = LIVE_BANK_ALERTS.find((s) => url.includes(`/messages/msg-${s.id}`))
      if (spec) return { ok: true, status: 200, json: async () => makeLiveAlertGmailMessage(spec) } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any
  })

  async function runScan() {
    const { scanRealGmailInbox } = await import('./emailScanner')
    const res = await scanRealGmailInbox({
      db,
      activeYear: new Date().getUTCFullYear(),
      askAI: async () => null,
    })
    expect(res.error).toBeNull()
    return (id: string) => inserted.find((t) => t.email_message_id === `msg-${id}`)
  }

  it('captures every live bank alert on the regex ladder alone', async () => {
    const find = await runScan()
    for (const spec of LIVE_BANK_ALERTS) {
      expect(find(spec.id), `${spec.id} was dropped`).toBeTruthy()
    }
  })

  it('reads "Rs. 2247.97" — an amount with a space after the abbreviation dot', async () => {
    const find = await runScan()
    const hdfc = find('hdfc-card')
    expect(hdfc.amount).toBe(2247.97)
    expect(hdfc.currency).toBe('INR')
    expect(hdfc.type).toBe('debit')
  })

  it('names the merchant from "towards X", not the fraud-helpline phone number', async () => {
    const find = await runScan()
    // The bare-"at" merchant pattern used to capture "1930 3" out of
    // "Call the National Cyber Crime Helpline at 1930".
    expect(find('hdfc-card').merchant).toMatch(/anthropic/i)
  })

  it('survives ICICI\'s "Never share your OTP" advisory footer', async () => {
    const find = await runScan()
    const icici = find('icici-card')
    expect(icici.amount).toBe(286.47)
    expect(rejections.some((r) => r.gate === 'otp_or_security_code')).toBe(false)
  })

  it('takes the transaction amount, not the available or total credit limit', async () => {
    const find = await runScan()
    // The ICICI body carries INR 1,62,411.38 (available) and INR 2,50,000.00
    // (total) alongside the real INR 286.47.
    expect(find('icici-card').amount).toBe(286.47)
  })

  it('does not file a UPI transfer under Transport because the footer says "Toll Free"', async () => {
    const find = await runScan()
    expect(find('axis-upi').category).not.toBe('Transport')
  })

  it('keeps a CRED bill payment despite its List-Unsubscribe footer', async () => {
    const find = await runScan()
    const cred = find('cred-bill')
    expect(cred.amount).toBe(31730)
    expect(cred.category).toBe('Utilities & Bills')
  })

  it('trusts the RBI-restricted bank.in zone the banks migrated to', async () => {
    const find = await runScan()
    // Untrusted senders take a 50-point confidence swing (-15 instead of +35),
    // which is the difference between a clean capture and one flagged
    // low-confidence. hdfcbank.bank.in is not in the explicit whitelist.
    expect(find('hdfc-card').confidence_score).toBeGreaterThanOrEqual(65)
    expect(find('icici-card').confidence_score).toBeGreaterThanOrEqual(65)
  })
})

describe('scanRealGmailInbox — one browser scan at a time', () => {
  it('joins an in-flight scan instead of starting a second one', async () => {
    const inserted: any[] = []
    const db: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        if (table === 'transactions') return makeTableMock({ data: [], error: null }, inserted)
        if (table === 'categories') return makeTableMock({ data: [{ name: 'Other', is_permanent: true }], error: null })
        return makeTableMock({ data: [], error: null })
      },
    }

    let listCalls = 0
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        listCalls++
        // Long enough that the second caller arrives while this is still open.
        await new Promise((r) => setTimeout(r, 50))
        return { ok: true, status: 200, json: async () => ({ messages: [] }) } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const progressFromJoiner: unknown[] = []

    const first = scanRealGmailInbox({ db, activeYear: new Date().getUTCFullYear(), askAI: async () => null })
    const second = scanRealGmailInbox({
      db,
      activeYear: new Date().getUTCFullYear(),
      askAI: async () => null,
      onProgress: (p) => progressFromJoiner.push(p),
    })

    const [a, b] = await Promise.all([first, second])

    // Three entry points (both pages' mount syncs and the manual button) used
    // to run three full scans over the same inbox at once.
    expect(listCalls).toBe(1)
    expect(b).toBe(a)
    // The joiner still sees live progress rather than a dead spinner.
    expect(progressFromJoiner.length).toBeGreaterThan(0)
  })

  it('does not de-duplicate server-side scans, which legitimately run per user', async () => {
    const db: any = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: (table: string) => {
        if (table === 'categories') return makeTableMock({ data: [{ name: 'Other', is_permanent: true }], error: null })
        return makeTableMock({ data: [], error: null })
      },
    }

    let listCalls = 0
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        listCalls++
        await new Promise((r) => setTimeout(r, 20))
        return { ok: true, status: 200, json: async () => ({ messages: [] }) } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    await Promise.all([
      scanRealGmailInbox({ db, userId: 'u1', userEmail: 'a@example.com', accessToken: 'tok', activeYear: new Date().getUTCFullYear(), askAI: async () => null }),
      scanRealGmailInbox({ db, userId: 'u2', userEmail: 'b@example.com', accessToken: 'tok', activeYear: new Date().getUTCFullYear(), askAI: async () => null }),
    ])

    expect(listCalls).toBe(2)
  })
})
