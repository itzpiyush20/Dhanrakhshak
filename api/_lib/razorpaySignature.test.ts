import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyHmacSignature, planDurationDays } from './razorpaySignature.js'

describe('verifyHmacSignature', () => {
  const secret = 'test_secret'
  const payload = 'order_abc123|pay_xyz789'
  const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  it('accepts a correctly computed signature', () => {
    expect(verifyHmacSignature(payload, secret, validSignature)).toBe(true)
  })

  it('rejects a signature computed with the wrong secret', () => {
    const wrongSignature = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex')
    expect(verifyHmacSignature(payload, secret, wrongSignature)).toBe(false)
  })

  it('rejects a signature for a tampered payload', () => {
    const tamperedPayload = 'order_abc123|pay_DIFFERENT'
    expect(verifyHmacSignature(tamperedPayload, secret, validSignature)).toBe(false)
  })

  it('rejects garbage/non-hex input without throwing', () => {
    expect(verifyHmacSignature(payload, secret, 'not-a-real-signature')).toBe(false)
  })

  it('rejects an empty signature', () => {
    expect(verifyHmacSignature(payload, secret, '')).toBe(false)
  })
})

describe('planDurationDays', () => {
  it('returns 30 days for monthly', () => {
    expect(planDurationDays('monthly')).toBe(30)
  })

  it('returns 365 days for annual', () => {
    expect(planDurationDays('annual')).toBe(365)
  })

  it('returns 100 years for lifetime', () => {
    expect(planDurationDays('lifetime')).toBe(36500)
  })
})
