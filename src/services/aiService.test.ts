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
})
