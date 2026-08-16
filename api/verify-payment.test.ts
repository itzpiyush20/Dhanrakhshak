// ============================================================
// verify-payment — the order's notes are the source of truth.
//
// A Razorpay signature covers `order_id|payment_id` and nothing else. It proves
// the pair is genuine; it does NOT say who paid, or which plan they paid for.
// Both of those live in the order's notes, written server-side by
// create-order.ts, and both must be re-read here.
//
// The plan half of that was missing: `planType` came straight from the request
// body and set the subscription length, while the AMOUNT had already been fixed
// when the order was created. So a real ₹31 monthly payment could be verified a
// second time with planType:'annual' and buy 365 days. The signature stays valid
// throughout, because nothing in it binds the plan.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const KEY_SECRET = 'test_key_secret'

const { mockFetch, mockPaymentFetch, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPaymentFetch: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('razorpay', () => ({
  default: class MockRazorpay {
    orders = { fetch: mockFetch }
    payments = { fetch: mockPaymentFetch }
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import handler from './verify-payment.js'

/** A genuine signature for this order/payment pair — the attacker has one of these. */
function sign(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
}

function makeReq(planType: string): VercelRequest {
  return {
    method: 'POST',
    headers: {
      origin: 'https://dhanrakshak-five.vercel.app',
      authorization: 'Bearer mock-valid-jwt',
      // Distinct per test so the module-level IP rate limiter (5/min) cannot
      // leak between cases and turn a real assertion into a 429.
      'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: {
      razorpay_order_id: 'order_monthly_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: sign('order_monthly_1', 'pay_1'),
      planType,
    },
  } as unknown as VercelRequest
}

function makeRes() {
  const out = { status: 0, body: null as any }
  const res = {
    setHeader: vi.fn(),
    status: (code: number) => {
      out.status = code
      return { json: (data: any) => { out.body = data }, end: () => {} }
    },
  } as unknown as VercelResponse
  return { res, out }
}

/** Captures what was written to `profiles`, so the granted duration is inspectable. */
function captureProfileUpdate() {
  const captured: { update: any | null } = { update: null }
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        update: (payload: any) => {
          captured.update = payload
          return {
            eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'user-1' }], error: null }) }),
          }
        },
      }
    }
    // payments — fire-and-forget bookkeeping, resolves to a thenable
    return { insert: () => Promise.resolve({ error: null }) }
  })
  return captured
}

describe('api/verify-payment — plan binding', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.ALLOWED_ORIGIN = 'https://dhanrakshak-five.vercel.app'
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    // The order as Razorpay holds it: a PAID MONTHLY order for user-1.
    mockFetch.mockResolvedValue({
      id: 'order_monthly_1',
      amount: 3100,
      status: 'paid',
      notes: { userId: 'user-1', planType: 'monthly' },
    })
  })

  it('refuses a monthly order re-submitted as annual, even with a valid signature', async () => {
    const captured = captureProfileUpdate()
    const { res, out } = makeRes()

    await handler(makeReq('annual'), res)

    expect(out.status).toBe(400)
    expect(out.body.error).toMatch(/different plan/i)
    // The decisive assertion: no subscription was granted at all.
    expect(captured.update).toBeNull()
  })

  it('accepts the plan the order was actually created for, and grants 30 days', async () => {
    const captured = captureProfileUpdate()
    const { res, out } = makeRes()

    await handler(makeReq('monthly'), res)

    expect(out.status).toBe(200)
    expect(captured.update?.subscription_plan_type).toBe('monthly')

    const days = Math.round(
      (new Date(captured.update.subscription_expires_at).getTime() - Date.now()) / 86_400_000
    )
    expect(days).toBe(30)
  })

  it('refuses when neither the order nor the payment shows money moving', async () => {
    mockFetch.mockResolvedValue({
      id: 'order_monthly_1',
      amount: 3100,
      status: 'created',
      notes: { userId: 'user-1', planType: 'monthly' },
    })
    mockPaymentFetch.mockResolvedValue({ id: 'pay_1', status: 'failed' })
    const captured = captureProfileUpdate()
    const { res, out } = makeRes()

    await handler(makeReq('monthly'), res)

    expect(out.status).toBe(400)
    expect(out.body.error).toMatch(/not completed/i)
    expect(captured.update).toBeNull()
  })

  // A Razorpay account set to MANUAL capture leaves a genuine payment
  // `authorized` and the order `attempted`. A strict order.status === 'paid'
  // check would reject that real customer after their money had already left.
  it('accepts a manual-capture payment where the order is not yet marked paid', async () => {
    mockFetch.mockResolvedValue({
      id: 'order_monthly_1',
      amount: 3100,
      status: 'attempted',
      notes: { userId: 'user-1', planType: 'monthly' },
    })
    mockPaymentFetch.mockResolvedValue({ id: 'pay_1', status: 'authorized' })
    const captured = captureProfileUpdate()
    const { res, out } = makeRes()

    await handler(makeReq('monthly'), res)

    expect(out.status).toBe(200)
    expect(captured.update?.subscription_plan_type).toBe('monthly')
  })

  it('still refuses an order belonging to a different account', async () => {
    mockFetch.mockResolvedValue({
      id: 'order_monthly_1',
      amount: 3100,
      status: 'paid',
      notes: { userId: 'someone-else', planType: 'monthly' },
    })
    const captured = captureProfileUpdate()
    const { res, out } = makeRes()

    await handler(makeReq('monthly'), res)

    expect(out.status).toBe(403)
    expect(captured.update).toBeNull()
  })
})
