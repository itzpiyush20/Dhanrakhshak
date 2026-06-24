import type { VercelRequest, VercelResponse } from '@vercel/node'
import Razorpay from 'razorpay'
import { createClient } from '@supabase/supabase-js'

const razorpayKeyId = [process.env.RAZORPAY_KEY_ID, process.env.VITE_RAZORPAY_KEY_ID]
  .find(k => k && k.startsWith('rzp_')) || process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

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

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak-five.vercel.app'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ''
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

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

  // The order's notes.userId is later trusted by verify-payment.ts to attribute a
  // payment to an account, so it must be derived from the caller's own token here,
  // not from the request body.
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const jwt = authHeader.slice(7)
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt)
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const userId = user.id

  const {
    planType,
    intrak_website_id,
    intrak_visitor_id,
    intrak_session_id,
    intrak_utm_source,
    intrak_utm_medium,
    intrak_utm_campaign,
    intrak_referrer,
    intrak_path,
  } = req.body ?? {}

  if (typeof planType !== 'string') {
    return res.status(400).json({ error: 'planType is required' })
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
    const notes: Record<string, string> = {
      userId,
      planType,
      intrak_event_name: 'purchase',
    }

    if (intrak_website_id) notes.intrak_website_id = String(intrak_website_id).slice(0, 256)
    if (intrak_visitor_id) notes.intrak_visitor_id = String(intrak_visitor_id).slice(0, 256)
    if (intrak_session_id) notes.intrak_session_id = String(intrak_session_id).slice(0, 256)
    if (intrak_utm_source) notes.intrak_utm_source = String(intrak_utm_source).slice(0, 256)
    if (intrak_utm_medium) notes.intrak_utm_medium = String(intrak_utm_medium).slice(0, 256)
    if (intrak_utm_campaign) notes.intrak_utm_campaign = String(intrak_utm_campaign).slice(0, 256)
    if (intrak_referrer) notes.intrak_referrer = String(intrak_referrer).slice(0, 256)
    if (intrak_path) notes.intrak_path = String(intrak_path).slice(0, 256)

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `receipt_${userId.slice(0, 8)}_${Date.now()}`,
      notes,
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
