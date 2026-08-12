import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import { analyzeTransactionEmailWithAI, analyzeTransactionEmailBatchWithAI, type EmailForAI } from './aiService'

describe('analyzeTransactionEmailWithAI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the injected callGemini function instead of the default proxy call', async () => {
    const fakeCallGemini = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        is_transaction: true,
        transaction_type: 'debit',
        amount: 450,
        merchant: 'Swiggy',
        category: 'food',
        description: 'Swiggy order',
        payment_mode: 'upi',
        card_issuer: null,
        card_brand: null,
        transaction_time: null,
        reference_id: null,
        date: '2026-07-20',
        confidence_score: 90,
      }) }] } }],
    })

    const result = await analyzeTransactionEmailWithAI(
      'Debited Rs.450',
      'You spent Rs.450 at Swiggy',
      '2026-07-20',
      fakeCallGemini
    )

    expect(fakeCallGemini).toHaveBeenCalledTimes(1)
    expect(result?.merchant).toBe('Swiggy')
    expect(result?.amount).toBe(450)
  })

  it('passes purpose: "scan" through to the Gemini proxy call', async () => {
    const fakeCallGemini = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ is_transaction: false, transaction_type: null, amount: null, merchant: null, category: null, description: null, payment_mode: null, card_issuer: null, card_brand: null, transaction_time: null, reference_id: null, date: null, confidence_score: 0 }) }] } }],
    })

    await analyzeTransactionEmailWithAI('subj', 'body', '2026-08-10', fakeCallGemini)

    expect(fakeCallGemini).toHaveBeenCalledTimes(1)
    const callArg = fakeCallGemini.mock.calls[0][0]
    expect(callArg.purpose).toBe('scan')
  })
})

describe('analyzeTransactionEmailWithAI — marketing rejection rule', () => {
  it('includes a rule rejecting subscription/pricing-table marketing', async () => {
    let capturedPrompt = ''
    const fakeCallGemini = async (body: any) => {
      capturedPrompt = body?.contents?.[0]?.parts?.[0]?.text || ''
      return { candidates: [{ content: { parts: [{ text: '{"is_transaction":false,"confidence_score":0}' }] } }] }
    }

    await analyzeTransactionEmailWithAI('Subject', 'Body', '2026-08-10', fakeCallGemini)

    expect(capturedPrompt).toMatch(/pricing tiers/i)
    expect(capturedPrompt).toMatch(/subscribe now/i)
  })
})

// Owner-specified false-positive classes (requirements R1/R13). The regex
// ladder is guarded in emailScanGates.test.ts; these lock the AI half of the
// same defence so a future prompt edit cannot silently drop a rule.
describe('analyzeTransactionEmailWithAI — false-positive rules stay in the prompt', () => {
  async function capturePrompt(): Promise<string> {
    let captured = ''
    await analyzeTransactionEmailWithAI('Subject', 'Body', '2026-08-10', async (body: any) => {
      captured = body?.contents?.[0]?.parts?.[0]?.text || ''
      return { candidates: [{ content: { parts: [{ text: '{"is_transaction":false,"confidence_score":0}' }] } }] }
    })
    return captured
  }

  const requiredRules: Array<[string, RegExp]> = [
    ['OTPs and verification codes', /OTPs?, login alerts, verification codes/i],
    ['coupons and discount codes', /discount codes, coupons/i],
    ['cashback offers as distinct from credits', /cashback OFFERS \(not credits\)/i],
    ['pre-approved loan offers', /pre-approved loan offers/i],
    ['credit limit increase offers', /Credit limit increase offers/i],
    ['reward point notifications', /Reward point NOTIFICATIONS/i],
    ['future-tense money movement', /FUTURE tense/i],
    ['declined or reversed transactions', /Declined, failed, cancelled, or reversed/i],
  ]

  it('no longer discards merchant payment receipts (R10)', async () => {
    // This rule rejected "we received your payment" receipts as a crude guard
    // against double-counting against the bank's own alert. Real merging now
    // handles that, and the rule had become actively harmful: it discarded the
    // ONLY record of any payment the bank never alerted on.
    const prompt = await capturePrompt()
    expect(prompt).not.toMatch(/We received your payment/i)
  })

  it('scopes the savings/investment rule to advertisements only (R2)', async () => {
    // The rule used to read "Any email about savings, investments, ...", broad
    // enough for the model to reject a genuine SIP debit or dividend credit —
    // both of which R2 puts in scope. It must stay narrowed to marketing.
    const prompt = await capturePrompt()
    expect(prompt).toMatch(/Marketing for savings products, investment products/i)
    expect(prompt).toMatch(/an actual SIP debit, mutual-fund purchase, dividend credit, interest credit or insurance premium payment IS a completed transaction/i)
    expect(prompt).not.toMatch(/Any email about savings, investments/i)
  })

  it.each(requiredRules)('keeps the rule for %s', async (_label, pattern) => {
    expect(await capturePrompt()).toMatch(pattern)
  })

  it('still requires past-tense money movement for is_transaction=true', async () => {
    const prompt = await capturePrompt()
    expect(prompt).toMatch(/ONLY set is_transaction to TRUE when money has ALREADY moved/i)
  })
})

// ============================================================
// Batch classification. The scanner sends up to AI_BATCH_SIZE emails per
// Gemini call; a null verdict means "no AI opinion", which makes the caller
// fall through to the regex ladder. This function must never throw and must
// never lose an email — every input index appears in the returned Map.
// ============================================================

function makeEmails(n: number): EmailForAI[] {
  return Array.from({ length: n }, (_, i) => ({
    index: 100 + i, // deliberately NOT 0-based, to catch index-mapping bugs
    subject: `Subject ${i}`,
    body: `Body ${i}`,
    emailDate: '2026-08-10',
  }))
}

function geminiArrayResponse(entries: unknown[]) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(entries) }] } }] }
}

describe('analyzeTransactionEmailBatchWithAI', () => {
  it('returns one verdict per email in a single Gemini call', async () => {
    const emails = makeEmails(3)
    const call = vi.fn().mockResolvedValue(
      geminiArrayResponse([
        { email_index: 0, is_transaction: true, amount: 450, merchant: 'Swiggy', confidence_score: 95 },
        { email_index: 1, is_transaction: false, amount: null, confidence_score: 0 },
        { email_index: 2, is_transaction: true, amount: 120, merchant: 'Uber', confidence_score: 88 },
      ])
    )

    const out = await analyzeTransactionEmailBatchWithAI(emails, call)

    expect(call).toHaveBeenCalledTimes(1)
    expect(out.size).toBe(3)
    // Maps back to the CALLER's indices, not the prompt's 0-based positions.
    expect(out.get(100)?.merchant).toBe('Swiggy')
    expect(out.get(101)?.is_transaction).toBe(false)
    expect(out.get(102)?.amount).toBe(120)
  })

  it('strips the email_index helper field from returned results', async () => {
    const call = vi.fn().mockResolvedValue(
      geminiArrayResponse([{ email_index: 0, is_transaction: true, amount: 10, confidence_score: 70 }])
    )
    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(1), call)
    expect(out.get(100)).not.toHaveProperty('email_index')
  })

  it('maps an email the model omitted to null rather than dropping it', async () => {
    const call = vi.fn().mockResolvedValue(
      geminiArrayResponse([
        { email_index: 0, is_transaction: true, amount: 450, confidence_score: 95 },
        // index 1 missing entirely
        { email_index: 2, is_transaction: true, amount: 120, confidence_score: 88 },
      ])
    )

    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(3), call)

    expect(out.size).toBe(3)
    expect(out.get(101)).toBeNull()
    expect(out.get(100)?.amount).toBe(450)
  })

  it('ignores entries with an out-of-range or malformed index', async () => {
    const call = vi.fn().mockResolvedValue(
      geminiArrayResponse([
        { email_index: 99, is_transaction: true, amount: 1 },
        { email_index: 'nope', is_transaction: true, amount: 2 },
        { email_index: 0, is_transaction: true, amount: 3, confidence_score: 50 },
      ])
    )

    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(2), call)

    expect(out.get(100)?.amount).toBe(3)
    expect(out.get(101)).toBeNull()
  })

  it('ignores an entry missing the is_transaction boolean', async () => {
    const call = vi.fn().mockResolvedValue(
      geminiArrayResponse([{ email_index: 0, amount: 450 }])
    )
    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(1), call)
    expect(out.get(100)).toBeNull()
  })

  it('falls back to per-email calls when the batch response is unparseable', async () => {
    let callCount = 0
    const call = vi.fn().mockImplementation(async () => {
      callCount++
      // First call is the batch (garbage); later calls are the single-email retries.
      if (callCount === 1) {
        return { candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] }
      }
      return {
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          is_transaction: true, amount: 77, merchant: 'Fallback', confidence_score: 80,
        }) }] } }],
      }
    })

    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(2), call)

    expect(call).toHaveBeenCalledTimes(3) // 1 batch + 2 singles
    expect(out.get(100)?.merchant).toBe('Fallback')
    expect(out.get(101)?.merchant).toBe('Fallback')
  })

  it('falls back to per-email calls when the batch call throws', async () => {
    let callCount = 0
    const call = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('429 rate limited')
      return {
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          is_transaction: false, amount: null, confidence_score: 0,
        }) }] } }],
      }
    })

    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(1), call)

    expect(out.get(100)?.is_transaction).toBe(false)
  })

  it('maps every email to null when both the batch and the single retries fail', async () => {
    const call = vi.fn().mockRejectedValue(new Error('gemini down'))

    const out = await analyzeTransactionEmailBatchWithAI(makeEmails(2), call)

    expect(out.size).toBe(2)
    expect(out.get(100)).toBeNull()
    expect(out.get(101)).toBeNull()
  })

  it('never throws, whatever the transport does', async () => {
    const call = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(analyzeTransactionEmailBatchWithAI(makeEmails(3), call)).resolves.toBeInstanceOf(Map)
  })

  it('returns an empty map for an empty input without calling Gemini', async () => {
    const call = vi.fn()
    const out = await analyzeTransactionEmailBatchWithAI([], call)
    expect(out.size).toBe(0)
    expect(call).not.toHaveBeenCalled()
  })

  it('sends purpose "scan" and the shared STRICT RULES in the batch prompt', async () => {
    let captured: any = null
    await analyzeTransactionEmailBatchWithAI(makeEmails(2), async (body: any) => {
      captured = body
      return geminiArrayResponse([])
    })

    expect(captured.purpose).toBe('scan')
    const prompt = captured.contents[0].parts[0].text
    expect(prompt).toMatch(/STRICT RULES/)
    expect(prompt).toMatch(/pre-approved loan offers/i)
    expect(prompt).toMatch(/EMAIL 0:/)
    expect(prompt).toMatch(/EMAIL 1:/)
    expect(captured.generationConfig.maxOutputTokens).toBe(2000)
  })
})
