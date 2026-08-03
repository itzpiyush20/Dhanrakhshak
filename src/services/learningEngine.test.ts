import { describe, it, expect, vi, beforeEach } from 'vitest'

const defaultMockOrder = vi.fn()
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: defaultMockOrder }) }) }),
  },
}))

import { getMerchantRulesFromDB, applyMerchantRulesFromDB } from './learningEngine'

describe('applyMerchantRulesFromDB', () => {
  it('never returns approval_status "approved", even for a high-confidence, auto_approve, many-times-confirmed exact match', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: 'r1', user_id: 'u1', merchant_key: 'swiggy', canonical_name: 'Swiggy',
        preferred_category: 'food', card_brand: null,
        auto_approve: true, confidence: 100, times_confirmed: 10,
        last_updated: '2026-07-01', created_at: '2026-07-01',
      }],
      error: null,
    })
    const db: any = {
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
    }

    const result = await applyMerchantRulesFromDB('u1', 'swiggy', 'Swiggy order snippet', 'other', db)

    expect(result.approval_status).toBe('pending')
    expect(result.category).toBe('food')
  })
})

describe('getMerchantRulesFromDB', () => {
  beforeEach(() => {
    defaultMockOrder.mockReset()
    defaultMockOrder.mockResolvedValue({ data: [], error: null })
  })

  it('uses the injected db client instead of the default module client', async () => {
    const customOrder = vi.fn().mockResolvedValue({
      data: [{
        id: 'r1', user_id: 'u1', merchant_key: 'swiggy', canonical_name: 'Swiggy',
        preferred_category: 'food', card_brand: null, auto_approve: true,
        confidence: 90, times_confirmed: 3, last_updated: '2026-07-01', created_at: '2026-07-01',
      }],
      error: null,
    })
    const customDb: any = {
      from: () => ({ select: () => ({ eq: () => ({ order: customOrder }) }) }),
    }

    const rules = await getMerchantRulesFromDB('u1', customDb)

    expect(customOrder).toHaveBeenCalledTimes(1)
    expect(defaultMockOrder).not.toHaveBeenCalled()
    expect(rules).toHaveLength(1)
    expect(rules[0].merchant_key).toBe('swiggy')
  })

  it('falls back to the default module client when none is passed', async () => {
    await getMerchantRulesFromDB('u1')
    expect(defaultMockOrder).toHaveBeenCalledTimes(1)
  })
})
