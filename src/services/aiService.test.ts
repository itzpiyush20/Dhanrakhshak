import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import { analyzeTransactionEmailWithAI } from './aiService'

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

  it.each(requiredRules)('keeps the rule for %s', async (_label, pattern) => {
    expect(await capturePrompt()).toMatch(pattern)
  })

  it('still requires past-tense money movement for is_transaction=true', async () => {
    const prompt = await capturePrompt()
    expect(prompt).toMatch(/ONLY set is_transaction to TRUE when money has ALREADY moved/i)
  })
})
