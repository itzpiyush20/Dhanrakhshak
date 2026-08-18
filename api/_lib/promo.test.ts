import { describe, it, expect } from 'vitest'
import {
  normalisePromoCode,
  checkRedeemable,
  canDeletePromoCode,
  grantExpiryFrom,
  validateNewPromoCode,
  checkCouponEligibility,
  type PromoCodeRow,
} from './promo.js'

const code = (over: Partial<PromoCodeRow> = {}): PromoCodeRow => ({
  code: 'WELCOME',
  plan_type: 'monthly',
  duration_days: 30,
  active: true,
  max_uses: null,
  used_count: 0,
  ...over,
})

describe('normalisePromoCode', () => {
  it('uppercases and trims, so a pasted code still matches', () => {
    expect(normalisePromoCode('  welcome2026 ')).toBe('WELCOME2026')
  })
})

describe('checkRedeemable', () => {
  it('allows an active code with no usage limit', () => {
    expect(checkRedeemable(code(), false)).toBeNull()
  })

  it('refuses a code that does not exist', () => {
    expect(checkRedeemable(null, false)).toBe('not_found')
  })

  it('refuses a deactivated code', () => {
    expect(checkRedeemable(code({ active: false }), false)).toBe('inactive')
  })

  it('refuses a second redemption by the same account', () => {
    expect(checkRedeemable(code(), true)).toBe('already_redeemed')
  })

  it('refuses once the usage limit is reached', () => {
    expect(checkRedeemable(code({ max_uses: 5, used_count: 5 }), false)).toBe('exhausted')
  })

  it('still allows the final use before the limit', () => {
    expect(checkRedeemable(code({ max_uses: 5, used_count: 4 }), false)).toBeNull()
  })

  it('treats a null usage limit as unlimited however many times it has been used', () => {
    expect(checkRedeemable(code({ max_uses: null, used_count: 9999 }), false)).toBeNull()
  })

  // Order matters: an inactive code should say so rather than blaming the user
  // for a redemption they never made.
  it('reports inactive before already-redeemed', () => {
    expect(checkRedeemable(code({ active: false }), true)).toBe('inactive')
  })

  const NOW = Date.parse('2026-08-15T12:00:00.000Z')

  it('allows a code whose own expiry is still ahead', () => {
    expect(checkRedeemable(code({ expires_at: '2026-09-01T00:00:00.000Z' }), false, NOW)).toBeNull()
  })

  it('refuses a code past its own expiry, even though the list hides it', () => {
    expect(checkRedeemable(code({ expires_at: '2026-08-01T00:00:00.000Z' }), false, NOW)).toBe('expired')
  })

  it('treats the expiry moment itself as expired', () => {
    expect(checkRedeemable(code({ expires_at: '2026-08-15T12:00:00.000Z' }), false, NOW)).toBe('expired')
  })

  it('treats a null expiry as never expiring', () => {
    expect(checkRedeemable(code({ expires_at: null }), false, NOW)).toBeNull()
  })
})

describe('canDeletePromoCode', () => {
  it('allows deleting a code nobody has redeemed', () => {
    expect(canDeletePromoCode({ used_count: 0 })).toBe(true)
  })

  // Deleting would discard the record of who was granted free access.
  it('refuses to delete a code that has been used', () => {
    expect(canDeletePromoCode({ used_count: 1 })).toBe(false)
  })
})

describe('grantExpiryFrom', () => {
  it('adds the requested number of days', () => {
    const start = Date.parse('2026-08-15T00:00:00.000Z')
    expect(grantExpiryFrom(30, start)).toBe('2026-09-14T00:00:00.000Z')
  })

  it('handles a one-year grant', () => {
    const start = Date.parse('2026-08-15T00:00:00.000Z')
    expect(grantExpiryFrom(365, start)).toBe('2027-08-15T00:00:00.000Z')
  })
})

describe('validateNewPromoCode', () => {
  const valid = { code: 'LAUNCH50', durationDays: 30, maxUses: null }

  it('accepts a sensible code', () => {
    expect(validateNewPromoCode(valid)).toBeNull()
  })

  it('accepts hyphens and underscores', () => {
    expect(validateNewPromoCode({ ...valid, code: 'NEW_YEAR-2027' })).toBeNull()
  })

  it('rejects spaces, which are painful to type and to support', () => {
    expect(validateNewPromoCode({ ...valid, code: 'FREE MONTH' })).toMatch(/only contain/)
  })

  it('rejects a code that is too short', () => {
    expect(validateNewPromoCode({ ...valid, code: 'AB' })).toMatch(/at least 3/)
  })

  it('rejects zero or negative validity', () => {
    expect(validateNewPromoCode({ ...valid, durationDays: 0 })).toMatch(/at least 1/)
    expect(validateNewPromoCode({ ...valid, durationDays: -5 })).toMatch(/at least 1/)
  })

  it('rejects a fractional number of days', () => {
    expect(validateNewPromoCode({ ...valid, durationDays: 1.5 })).toMatch(/whole number/)
  })

  it('rejects an absurd validity', () => {
    expect(validateNewPromoCode({ ...valid, durationDays: 40000 })).toMatch(/3650/)
  })

  it('rejects a usage limit below one, but allows empty for unlimited', () => {
    expect(validateNewPromoCode({ ...valid, maxUses: 0 })).toMatch(/at least 1/)
    expect(validateNewPromoCode({ ...valid, maxUses: null })).toBeNull()
  })

  it('validates the normalised form, so lowercase input is accepted', () => {
    expect(validateNewPromoCode({ ...valid, code: 'launch50' })).toBeNull()
  })
})

describe('checkCouponEligibility', () => {
  const account = (over: Partial<Parameters<typeof checkCouponEligibility>[0]> = {}) => ({
    hasPaidBefore: false,
    hasRedeemedAnyCoupon: false,
    ...over,
  })

  it('allows a brand new account', () => {
    expect(checkCouponEligibility(account())).toBeNull()
  })

  it('refuses anyone who has ever paid, even if that plan has long lapsed', () => {
    // "First time user" means never a paying customer — not "not paying right
    // now". A lapsed ex-customer coming back is a win-back, not an acquisition.
    expect(checkCouponEligibility(account({ hasPaidBefore: true }))).toBe('not_new_customer')
  })

  it('refuses a second coupon even when it is a different code', () => {
    // The UNIQUE (code, user_id) constraint only stops re-using the SAME code,
    // so without this an account could work through every code in circulation.
    expect(checkCouponEligibility(account({ hasRedeemedAnyCoupon: true }))).toBe('coupon_already_used')
  })

  it('reports having paid before ahead of having used a coupon', () => {
    // Both true: say the one that is permanent. "You have already used a
    // coupon" would imply trying again later might work.
    expect(
      checkCouponEligibility(account({ hasPaidBefore: true, hasRedeemedAnyCoupon: true }))
    ).toBe('not_new_customer')
  })

  it('does not care about a trial — only about money and prior coupons', () => {
    // A trial user has never paid, so they stay eligible. They are the most
    // likely person to be handed a coupon.
    expect(checkCouponEligibility(account())).toBeNull()
  })
})
