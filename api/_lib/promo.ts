// ============================================
// Promo code rules — pure, so they can be tested.
//
// The endpoints around these functions deal with HTTP and the database; every
// decision about whether a code may be redeemed lives here.
// ============================================

/** A promo_codes row, as far as these rules care. */
export interface PromoCodeRow {
  code: string
  plan_type: 'monthly' | 'annual'
  duration_days: number
  active: boolean
  max_uses: number | null
  used_count: number
  /**
   * When the CODE stops working — not to be confused with duration_days, which
   * is how long the access it grants lasts. Null means the code never expires.
   */
  expires_at?: string | null
}

export type RedeemRefusal =
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'already_redeemed'

/**
 * Codes are matched case-insensitively and ignoring surrounding whitespace,
 * because users type them by hand and paste them out of messages.
 */
export function normalisePromoCode(input: string): string {
  return input.trim().toUpperCase()
}

/**
 * May this account redeem this code right now?
 *
 * Returns null when redemption is allowed, or the reason it is refused. The
 * caller turns that into a message; deliberately no user-facing wording here.
 */
export function checkRedeemable(
  row: PromoCodeRow | null | undefined,
  alreadyRedeemed: boolean,
  now: number = Date.now()
): RedeemRefusal | null {
  if (!row) return 'not_found'
  if (!row.active) return 'inactive'
  // An expired code is refused even though the admin list hides it, because
  // someone may still be holding the code from a poster or an old message.
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired'
  if (alreadyRedeemed) return 'already_redeemed'
  // max_uses null means unlimited.
  if (row.max_uses !== null && row.used_count >= row.max_uses) return 'exhausted'
  return null
}

export type CouponEligibilityRefusal = 'not_new_customer' | 'coupon_already_used'

/**
 * May this ACCOUNT use a coupon at all?
 *
 * Separate from checkRedeemable, which asks whether the CODE is usable. This
 * asks whether the person is who coupons are for.
 *
 * Owner's rule (2026-08-18): a free-time coupon is a new-customer acquisition
 * tool. It works only for someone who has never subscribed to any plan, and
 * only once — once per ACCOUNT, across every code, not once per code.
 *
 * `hasPaidBefore` means a real payment, ever: a captured `payments` row with
 * source 'razorpay'. Deliberately not derived from subscription_status or
 * subscription_plan_type, which say what is true now rather than what has ever
 * been true, and would let a lapsed ex-customer read as new. Two sources are
 * deliberately excluded from that test:
 *
 *   * 'admin' — a plan the owner granted by hand. No money changed hands, and
 *     the owner decided that must not burn the recipient's coupon eligibility.
 *   * 'promo' — redeeming a coupon writes its own zero-amount payments row, so
 *     counting those would make every coupon self-disqualifying. Prior coupons
 *     are covered by hasRedeemedAnyCoupon instead.
 *
 * A TRIAL does not disqualify anyone: a trial is not a subscription and nobody
 * has paid for it. Someone mid-trial is the most likely coupon recipient.
 */
export function checkCouponEligibility(account: {
  hasPaidBefore: boolean
  hasRedeemedAnyCoupon: boolean
}): CouponEligibilityRefusal | null {
  // Order matters for the message the user sees. Having paid is permanent, so
  // it is reported first; leading with "you have already used a coupon" would
  // suggest that trying again another time might work.
  if (account.hasPaidBefore) return 'not_new_customer'
  if (account.hasRedeemedAnyCoupon) return 'coupon_already_used'
  return null
}

/**
 * May this code be deleted outright?
 *
 * Only when nobody has redeemed it — a typo or an unused test code. Once
 * someone has used it, deleting would discard the record of who was given free
 * access, so those are disabled instead.
 */
export function canDeletePromoCode(row: Pick<PromoCodeRow, 'used_count'>): boolean {
  return row.used_count === 0
}

/** The moment a grant of this length ends, as an ISO timestamp. */
export function grantExpiryFrom(durationDays: number, now: number = Date.now()): string {
  return new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Validation for a code an admin is creating. Returns null when the input is
 * acceptable, otherwise the reason it is not.
 */
export function validateNewPromoCode(input: {
  code: string
  durationDays: number
  maxUses: number | null
}): string | null {
  const code = normalisePromoCode(input.code)
  if (code.length < 3) return 'Code must be at least 3 characters.'
  if (code.length > 40) return 'Code must be 40 characters or fewer.'
  // Spaces and punctuation make codes painful to type and to support.
  if (!/^[A-Z0-9_-]+$/.test(code)) return 'Code may only contain letters, numbers, hyphens and underscores.'
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) return 'Validity must be a whole number of days, at least 1.'
  if (input.durationDays > 3650) return 'Validity cannot exceed 3650 days.'
  if (input.maxUses !== null && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) {
    return 'Usage limit must be a whole number of at least 1, or left empty for unlimited.'
  }
  return null
}
