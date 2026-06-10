import type { VercelRequest, VercelResponse } from '@vercel/node'
import Razorpay from 'razorpay'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  if (entry.count >= 10) return true
  entry.count++
  return false
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak.vercel.app'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ''
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const isHosted = process.env.VERCEL === '1'
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''
  if (isHosted && keyId.startsWith('rzp_test_')) {
    console.error('Security alert: Order creation blocked using test keys in hosted environments.')
    return res.status(400).json({ error: 'Test payments are not allowed in hosted environments.' })
  }

  const { planType, userId } = req.body ?? {}

  if (typeof planType !== 'string' || typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'planType and userId are required' })
  }

  let amount = 0
  if (planType === 'monthly') {
    amount = 31 * 100
  } else if (planType === 'annual') {
    amount = 365 * 100
  } else {
    return res.status(400).json({ error: 'Invalid planType. Must be monthly or annual.' })
  }

  try {
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `receipt_${userId.slice(0, 8)}_${Date.now()}`,
      notes: { userId, planType },
    })

    return res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    })
  } catch (error: any) {
    console.error('Error creating Razorpay order:', error)
    const isAuthError = error.statusCode === 401 || /auth|key/i.test(error.message || '')
    return res.status(isAuthError ? 401 : 500).json({ error: error.message || 'Failed to create Razorpay order' })
  }
}
