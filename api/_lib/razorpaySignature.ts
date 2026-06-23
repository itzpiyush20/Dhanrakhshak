import crypto from 'crypto'

/** Verifies an HMAC-SHA256 signature using a timing-safe comparison. */
export function verifyHmacSignature(payload: string, secret: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const signatureBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== signatureBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}

export type PlanType = 'monthly' | 'annual' | 'lifetime'

/** Subscription length in days for each plan type. */
export function planDurationDays(planType: PlanType): number {
  if (planType === 'annual') return 365
  if (planType === 'lifetime') return 36500
  return 30
}
