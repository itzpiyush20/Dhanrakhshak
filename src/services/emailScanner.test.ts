// src/services/emailScanner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAxisEmiGmailMessage } from './__fixtures__/axisEmiDebit'
import { makeUberTripGmailMessage } from './__fixtures__/uberTripReceipt'
import { makeUnknownVendorGmailMessage } from './__fixtures__/unknownVendorReceipt'
import { makeZomatoOrderGmailMessage } from './__fixtures__/zomatoOrderReceipt'
import { makeBusinessStandardGmailMessage } from './__fixtures__/businessStandardNewsletter'
import { makeBulkProseGmailMessage } from './__fixtures__/bulkMailWithPaymentProse'
import { makeBankMarketingGmailMessage } from './__fixtures__/bankMarketingFromTrustedSender'

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

/** Shared across the "no debit/credit keyword" and "low confidence" test groups below. */
function makeMockDb(insertedTransactions: any[], insertedRejections: any[]): any {
  const makeTableMock = (response: any, opts: { insertCapture?: any[] } = {}) => {
    const handler: any = {
      select: () => handler, eq: () => handler, order: () => handler, limit: () => handler,
      single: () => Promise.resolve(response),
      insert: (row: any) => {
        opts.insertCapture?.push(row)
        return { select: () => ({ single: () => Promise.resolve(response) }), then: (resolve: any) => resolve(response) }
      },
      then: (resolve: any) => resolve(response),
    }
    return handler
  }
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
    from: (table: string) => {
      if (table === 'profiles') return makeTableMock({ data: null, error: null })
      if (table === 'email_scan_logs') return makeTableMock({ data: [], error: null })
      if (table === 'cards') return makeTableMock({ data: [], error: null })
      if (table === 'transactions') return makeTableMock({ data: [], error: null }, { insertCapture: insertedTransactions })
      if (table === 'categories') return makeTableMock({ data: [{ name: 'Transport', is_permanent: false }, { name: 'Food & Dining', is_permanent: false }, { name: 'Other', is_permanent: true }], error: null })
      if (table === 'email_scan_rejections') return makeTableMock({ error: null }, { insertCapture: insertedRejections })
      return makeTableMock({ data: [], error: null })
    },
  }
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
      from: (_table: string) => {
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

describe('scanRealGmailInbox — receipt-shaped emails with no debit/credit keyword', () => {
  it('inserts the Uber trip receipt as pending instead of dropping it, and logs why', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 'thread-uber-trip-1' }] }) } as any
      if (url.includes('/messages/msg-uber-trip-1')) return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    // Regression check: the fixture has both "Total ₹224.76" and a
    // "Payments" section header sitting right above "Suggested fare
    // ₹214.76". Before the txKeywordsRe fix, the literal substring
    // "payment" inside "Payments" false-matched as a transaction keyword,
    // and its proximity to 214.76 made the amount-selection heuristic
    // pick the suggested fare instead of the actual total. This asserts
    // the correct total (224.76) wins, not the false-matched 214.76.
    expect(txn.amount).toBe(224.76)
    expect(txn.type).toBe('debit')
    expect(txn.approval_status).toBe('pending')

    expect(insertedRejections.some((r: any) => r.gate === 'no_debit_credit_signal')).toBe(true)
  })

  it('inserts a receipt from a wholly unrecognized vendor as pending (not list-dependent)', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-unknown-vendor-1', threadId: 'thread-unknown-vendor-1' }] }) } as any
      if (url.includes('/messages/msg-unknown-vendor-1')) return { ok: true, status: 200, json: async () => makeUnknownVendorGmailMessage() } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    expect(txn.amount).toBe(120)
    expect(txn.type).toBe('debit')
    expect(txn.approval_status).toBe('pending')
  })

  it('inserts the Zomato order receipt end-to-end (stripped footer survives the OTP gate, "Total paid" gives a clear debit signal)', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-zomato-order-1', threadId: 'thread-zomato-order-1' }] }) } as any
      if (url.includes('/messages/msg-zomato-order-1')) return { ok: true, status: 200, json: async () => makeZomatoOrderGmailMessage() } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    expect(txn.amount).toBe(286.47)
    expect(txn.type).toBe('debit')
    expect(txn.approval_status).toBe('pending')
    // This email's own debit signal ("Total paid") is clear on its own —
    // it should NOT need the no_debit_credit_signal fallback from this task.
    expect(insertedRejections.some((r: any) => r.gate === 'no_debit_credit_signal')).toBe(false)
  })

  it('still rejects a promotional email even though the fetch query and pending-floor are both wider now', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    function toBase64Url(text: string): string {
      return Buffer.from(text, 'utf-8').toString('base64url')
    }
    const promoBody = 'Get cashback on your next Zomato order! Limited period offer, shop now. Total savings up to ₹200.'
    const promoMessage = {
      id: 'msg-promo-1',
      threadId: 'thread-promo-1',
      snippet: 'Get cashback on your next Zomato order!',
      internalDate: String(Date.UTC(2026, 7, 10, 9, 0, 0)),
      payload: {
        headers: [
          { name: 'Subject', value: 'Exclusive cashback offer just for you' },
          { name: 'From', value: 'Zomato <noreply@zomato.com>' },
        ],
        mimeType: 'text/plain',
        body: { data: toBase64Url(promoBody) },
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-promo-1', threadId: 'thread-promo-1' }] }) } as any
      if (url.includes('/messages/msg-promo-1')) return { ok: true, status: 200, json: async () => promoMessage } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(insertedTransactions).toHaveLength(0)
    // The subject itself ("...offer...") trips the hard_reject_subject
    // gate before evaluateRegexGates (and its promotional_spam check) is
    // ever reached — that's the actual (correct, pre-existing) gate that
    // fires here, not promotional_spam. Either way the email is rejected
    // and logged, which is what this guardrail test cares about.
    expect(insertedRejections.some((r: any) => r.gate === 'hard_reject_subject')).toBe(true)
  })
})

describe('scanRealGmailInbox — low regex confidence inserts pending, not dropped', () => {
  it('inserts the Uber receipt (untrusted sender, no reference id) as pending despite scoring below 65', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 'thread-uber-trip-1' }] }) } as any
      if (url.includes('/messages/msg-uber-trip-1')) return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    expect(txn.approval_status).toBe('pending')
    expect(txn.confidence_score).toBeLessThan(65)
    expect(insertedRejections.some((r: any) => r.gate === 'confidence_below_65')).toBe(true)
    expect(result.data?.lowConfidencePendingCount).toBeGreaterThanOrEqual(1)
  })
})

describe('scanRealGmailInbox — newsletter false positives', () => {
  const insertedTransactions: any[] = []
  const insertedRejections: any[] = []
  let mockDb: any

  beforeEach(() => {
    insertedTransactions.length = 0
    insertedRejections.length = 0
    mockDb = makeMockDb(insertedTransactions, insertedRejections)
  })

  it('rejects a subscription-advertisement newsletter without calling the AI', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bs-newsletter-1', threadId: 'thread-bs-newsletter-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bs-newsletter-1')) {
        return { ok: true, status: 200, json: async () => makeBusinessStandardGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const askAISpy = vi.fn(async () => null)
    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: askAISpy as any })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    // The quota-preservation guarantee: junk must not reach the AI at all.
    expect(askAISpy).not.toHaveBeenCalled()
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_evidence')
  })

  it('rejects bulk mail whose payment language is far from the amount', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bulk-prose-1', threadId: 'thread-bulk-prose-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bulk-prose-1')) {
        return { ok: true, status: 200, json: async () => makeBulkProseGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_near_amount')
  })
})

describe('scanRealGmailInbox — trusted-sender marketing', () => {
  it('rejects marketing from a trusted bank domain (no more exemption)', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bank-marketing-1', threadId: 'thread-bank-marketing-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bank-marketing-1')) {
        return { ok: true, status: 200, json: async () => makeBankMarketingGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_evidence')
  })
})

describe('scanRealGmailInbox — genuine receipts still detected (regression)', () => {
  const cases = [
    { name: 'Uber trip receipt', id: 'msg-uber-trip-1', make: makeUberTripGmailMessage },
    { name: 'Zomato order receipt', id: 'msg-zomato-order-1', make: makeZomatoOrderGmailMessage },
    { name: 'unknown vendor receipt', id: 'msg-unknown-vendor-1', make: makeUnknownVendorGmailMessage },
  ]

  for (const c of cases) {
    it(`still inserts a pending transaction for the ${c.name}`, async () => {
      const insertedTransactions: any[] = []
      const insertedRejections: any[] = []
      const mockDb = makeMockDb(insertedTransactions, insertedRejections)

      global.fetch = vi.fn(async (url: string) => {
        if (url.includes('/messages?')) {
          return { ok: true, status: 200, json: async () => ({ messages: [{ id: c.id, threadId: `thread-${c.id}` }] }) } as any
        }
        if (url.includes(`/messages/${c.id}`)) {
          return { ok: true, status: 200, json: async () => c.make() } as any
        }
        throw new Error(`Unexpected fetch URL in test: ${url}`)
      }) as any

      const { scanRealGmailInbox } = await import('./emailScanner')
      const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

      expect(result.error).toBeNull()
      expect(insertedTransactions).toHaveLength(1)
      expect(insertedTransactions[0][0].approval_status).toBe('pending')
    })
  }
})

describe('scanRealGmailInbox — transient fetch failure handling', () => {
  it('retries a message fetch that returns 429 and succeeds on a later attempt', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    let messageFetchAttempts = 0
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }) } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        messageFetchAttempts++
        if (messageFetchAttempts < 3) {
          return { ok: false, status: 429, json: async () => ({}) } as any
        }
        return { ok: true, status: 200, json: async () => makeAxisEmiGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(messageFetchAttempts).toBe(3)
    expect(insertedTransactions).toHaveLength(1)
  })

  it('logs a fetch_failed rejection and drops the message when retries exhaust', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }) } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        return { ok: false, status: 429, json: async () => ({}) } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('fetch_failed')
  }, 15000)
})

describe('scanRealGmailInbox — batch insert fault isolation', () => {
  it('falls back to per-row insert when the batch hits a unique-constraint conflict, keeping the non-conflicting rows', async () => {
    const insertedRejections: any[] = []
    let batchInsertAttempted = false
    const perRowInserted: any[] = []

    const mockDb: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        const baseHandler: any = {
          select: () => baseHandler,
          eq: () => baseHandler,
          order: () => baseHandler,
          limit: () => baseHandler,
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        if (table === 'profiles') return baseHandler
        if (table === 'email_scan_logs') {
          return {
            ...baseHandler,
            insert: (row: any) => ({ select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
          }
        }
        if (table === 'cards') return baseHandler
        if (table === 'categories') return { ...baseHandler, then: (resolve: any) => resolve({ data: [{ name: 'Food & Dining', is_permanent: false }, { name: 'Other', is_permanent: true }], error: null }) }
        if (table === 'email_scan_rejections') {
          return { ...baseHandler, insert: (row: any) => { insertedRejections.push(row); return Promise.resolve({ error: null }) } }
        }
        if (table === 'transactions') {
          return {
            ...baseHandler,
            insert: (rows: any) => {
              const rowArray = Array.isArray(rows) ? rows : [rows]
              if (rowArray.length > 1) {
                batchInsertAttempted = true
                return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }
              }
              // Per-row fallback: second row (the one "already inserted by another scan") conflicts, first succeeds.
              const row = rowArray[0]
              if (perRowInserted.length === 1) {
                return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }
              }
              perRowInserted.push(row)
              return { select: () => Promise.resolve({ data: [row], error: null }) }
            },
          }
        }
        return baseHandler
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 't1' }, { id: 'msg-zomato-order-1', threadId: 't2' }] }) } as any
      }
      if (url.includes('/messages/msg-uber-trip-1')) {
        return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      }
      if (url.includes('/messages/msg-zomato-order-1')) {
        return { ok: true, status: 200, json: async () => makeZomatoOrderGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(batchInsertAttempted).toBe(true)
    expect(result.error).toBeNull()
    // One of the two rows conflicted and was skipped; the other succeeded —
    // the scan must not throw and must not lose the non-conflicting row.
    expect(perRowInserted).toHaveLength(1)
  })

  it('still throws on a non-conflict database error', async () => {
    const mockDb: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        const baseHandler: any = {
          select: () => baseHandler, eq: () => baseHandler, order: () => baseHandler, limit: () => baseHandler,
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        if (table === 'profiles') return baseHandler
        if (table === 'cards') return baseHandler
        if (table === 'categories') return { ...baseHandler, then: (resolve: any) => resolve({ data: [{ name: 'Transport', is_permanent: false }, { name: 'Other', is_permanent: true }], error: null }) }
        if (table === 'email_scan_rejections') return { ...baseHandler, insert: () => Promise.resolve({ error: null }) }
        if (table === 'email_scan_logs') return { ...baseHandler, insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }
        if (table === 'transactions') {
          return { ...baseHandler, insert: () => ({ select: () => Promise.resolve({ data: null, error: { code: '500', message: 'connection reset' } }) }) }
        }
        return baseHandler
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 't1' }] }) } as any
      }
      if (url.includes('/messages/msg-uber-trip-1')) {
        return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).not.toBeNull()
  })
})
