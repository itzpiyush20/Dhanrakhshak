import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Razorpay from 'razorpay'
import { verifyHmacSignature, planDurationDays } from './_lib/razorpaySignature.js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const razorpayKeyId = [process.env.RAZORPAY_KEY_ID, process.env.VITE_RAZORPAY_KEY_ID]
  .find(k => k && k.startsWith('rzp_')) || process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

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

  // Verify the caller is an authenticated Supabase user — the userId for this
  // payment is derived from the token, never trusted from the request body.
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
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planType,
  } = req.body ?? {}

  if (
    typeof razorpay_order_id !== 'string' || !razorpay_order_id ||
    typeof razorpay_payment_id !== 'string' || !razorpay_payment_id ||
    typeof razorpay_signature !== 'string' || !razorpay_signature ||
    !['monthly', 'annual', 'lifetime'].includes(planType)
  ) {
    return res.status(400).json({ error: 'Missing or invalid payment parameters' })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET || ''
  const signatureValid = verifyHmacSignature(`${razorpay_order_id}|${razorpay_payment_id}`, keySecret, razorpay_signature)

  if (!signatureValid) {
    console.error('Razorpay signature verification failed for order:', razorpay_order_id)
    return res.status(400).json({ error: 'Signature verification failed. The transaction may be spoofed.' })
  }

  // A valid signature only proves the order/payment pair is genuine — it does not
  // prove the caller is who paid. Cross-check the order's own notes (set server-side
  // at creation time in create-order.ts) against the authenticated caller's id so a
  // payment's order_id/payment_id/signature can't be replayed by a different account.
  let order: any;
  try {
    order = await razorpay.orders.fetch(razorpay_order_id)
    const orderUserId = (order.notes as Record<string, string> | undefined)?.userId
    if (orderUserId !== userId) {
      console.error('Order/user mismatch for order:', razorpay_order_id)
      return res.status(403).json({ error: 'This payment does not belong to the authenticated account.' })
    }
  } catch (error: any) {
    console.error('Error fetching Razorpay order for verification:', error)
    return res.status(400).json({ error: 'Could not verify order ownership.' })
  }

async function notifyIntrak(order: any) {
  const notes = order.notes || {};
  if (!notes.intrak_website_id) return;

  const intrakUrl = process.env.VITE_INTRAK_APP_URL || 'https://intrakv1.vercel.app';
  const amount = order.amount ? order.amount / 100 : 0; // in Rupees
  
  try {
    const payload = {
      website_id: notes.intrak_website_id,
      visitor_id: notes.intrak_visitor_id || 'unknown',
      session_id: notes.intrak_session_id || 'unknown',
      event_type: 'purchase',
      event_name: notes.intrak_event_name || 'purchase',
      path: notes.intrak_path || null,
      referrer: notes.intrak_referrer || null,
      utm_source: notes.intrak_utm_source || null,
      utm_medium: notes.intrak_utm_medium || null,
      utm_campaign: notes.intrak_utm_campaign || null,
      revenue: amount,
      currency: order.currency || 'INR',
      // Keyed by order id so Intrak's /api/collect can dedupe this against the
      // other paths that may also report the same purchase (webhook.ts, and
      // Razorpay's own account-wide webhook calling Intrak directly).
      external_id: `razorpay_${order.id}`,
    };

    console.log('Notifying Intrak of purchase event:', payload);
    const res = await fetch(`${intrakUrl}/api/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      console.error(`Failed to notify Intrak: HTTP ${res.status} - ${await res.text()}`);
    } else {
      console.log('Successfully notified Intrak of purchase event.');
    }
  } catch (err) {
    console.error('Error notifying Intrak:', err);
  }
}

  const durationDays = planDurationDays(planType)
  const subscription_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'active',
        subscription_expires_at,
        subscription_plan_type: planType,
        razorpay_order_id: razorpay_order_id, // Fix idempotency bug
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (error) throw error

    // Notify Intrak background attribution tracker
    await notifyIntrak(order);

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
