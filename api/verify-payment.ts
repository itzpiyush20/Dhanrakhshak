import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Simple in-memory rate limiter: max 5 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  if (entry.count >= 5) return true
  entry.count++
  return false
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak-five.vercel.app'

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

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    userId,
    planType,
  } = req.body ?? {}

  if (
    typeof razorpay_order_id !== 'string' || !razorpay_order_id ||
    typeof razorpay_payment_id !== 'string' || !razorpay_payment_id ||
    typeof razorpay_signature !== 'string' || !razorpay_signature ||
    typeof userId !== 'string' || !userId ||
    !['monthly', 'annual', 'lifetime'].includes(planType)
  ) {
    return res.status(400).json({ error: 'Missing or invalid payment parameters' })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET || ''
  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (generatedSignature !== razorpay_signature) {
    console.error('Razorpay signature verification failed for order:', razorpay_order_id)
    return res.status(400).json({ error: 'Signature verification failed. The transaction may be spoofed.' })
  }

  let durationDays = 30
  if (planType === 'annual') durationDays = 365
  else if (planType === 'lifetime') durationDays = 36500

  const subscription_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'active',
        subscription_expires_at,
        subscription_plan_type: planType,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (error) throw error

    return res.status(200).json({
      success: true,
      message: 'Subscription activated successfully.',
      expiresAt: subscription_expires_at,
    })
  } catch (error: any) {
    console.error('Error updating profile in Supabase:', error)
    return res.status(500).json({ error: error.message || 'Database update failed' })
  }
}
