import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Define hoisted mocks
const { mockCreate, mockGetUser } = vi.hoisted(() => {
  return {
    mockCreate: vi.fn(),
    mockGetUser: vi.fn()
  }
})

// Mock Razorpay
vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: mockCreate
      }
    }
  }
})

// Mock Supabase
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      auth: {
        getUser: mockGetUser
      }
    })
  }
})

// Now import handler after mocks are set up
import handler from './create-order.js'

describe('api/create-order', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.ALLOWED_ORIGIN = 'https://dhanrakshak-five.vercel.app'
  })

  it('successfully creates an order with intrak tracking parameters', async () => {
    // 1. Mock Supabase Auth returning a valid user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-id-12345' } },
      error: null
    })

    // 2. Mock Razorpay order creation success
    mockCreate.mockResolvedValue({
      id: 'order_test_98765',
      amount: 3100,
      currency: 'INR'
    })

    // 3. Prepare mock request and response
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://dhanrakshak-five.vercel.app',
        authorization: 'Bearer mock-valid-jwt'
      },
      body: {
        planType: 'monthly',
        intrak_website_id: 'web-123',
        intrak_visitor_id: 'visitor-456',
        intrak_session_id: 'session-789',
        intrak_utm_source: 'google',
        intrak_utm_medium: 'cpc',
        intrak_utm_campaign: 'summer-sale',
        intrak_referrer: 'https://google.com',
        intrak_path: '/pricing'
      }
    } as unknown as VercelRequest

    let statusVal = 200
    let jsonVal: any = null
    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusVal = code
        return {
          json: (data: any) => {
            jsonVal = data
          }
        }
      }
    } as unknown as VercelResponse

    // 4. Invoke the handler
    await handler(req, res)

    // 5. Assertions
    expect(statusVal).toBe(200)
    expect(jsonVal).toEqual({
      id: 'order_test_98765',
      amount: 3100,
      currency: 'INR'
    })

    // Verify Razorpay was called with correct notes including intrak properties
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.amount).toBe(3100)
    expect(callArgs.currency).toBe('INR')
    expect(callArgs.notes).toEqual({
      userId: 'test-user-id-12345',
      planType: 'monthly',
      intrak_event_name: 'purchase',
      intrak_website_id: 'web-123',
      intrak_visitor_id: 'visitor-456',
      intrak_session_id: 'session-789',
      intrak_utm_source: 'google',
      intrak_utm_medium: 'cpc',
      intrak_utm_campaign: 'summer-sale',
      intrak_referrer: 'https://google.com',
      intrak_path: '/pricing'
    })
  })
})
