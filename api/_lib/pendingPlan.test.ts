import { describe, it, expect } from 'vitest'
import { isPurchaseBlocked } from './pendingPlan.js'

describe('isPurchaseBlocked', () => {
  it('blocks when a plan is already queued', () => {
    expect(isPurchaseBlocked({ pending_plan_type: 'monthly' })).toBe(true)
    expect(isPurchaseBlocked({ pending_plan_type: 'annual' })).toBe(true)
  })

  it('allows when nothing is queued', () => {
    expect(isPurchaseBlocked({ pending_plan_type: null })).toBe(false)
    expect(isPurchaseBlocked({})).toBe(false)
  })

  it('allows when the profile row is missing', () => {
    // A missing profile is not a queued plan. Checkout proceeds, and
    // apply_plan_purchase returns NULL later — that is where it gets reported,
    // rather than blocking a purchase for a reason that may not be true.
    expect(isPurchaseBlocked(null)).toBe(false)
    expect(isPurchaseBlocked(undefined)).toBe(false)
  })
})
