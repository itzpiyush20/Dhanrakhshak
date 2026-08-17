/**
 * True when the account already has a plan waiting behind its current one.
 *
 * One pending change at a time: buying again while a plan is queued would take
 * money for time the customer cannot reach for up to a year. Checked before
 * payment in create-order.ts, never after.
 */
export function isPurchaseBlocked(
  profile: { pending_plan_type?: string | null } | null | undefined
): boolean {
  return !!profile?.pending_plan_type
}
