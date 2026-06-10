import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase admin client with service role key to bypass RLS policies
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Enforce that only real payments are processed in hosted (Vercel) environments
  const isHosted = process.env.VERCEL === '1'
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''
  if (isHosted && keyId.startsWith('rzp_test_')) {
    console.error('Security alert: Test payment keys are blocked in hosted environments.')
    return res.status(400).json({ error: 'Test payments are not allowed in hosted environments.' })
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    userId,
    planType,
  } = req.body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !planType) {
    return res.status(400).json({ error: 'Missing required payment parameters' })
  }

  // 1. Verify Razorpay cryptographic signature
  const keySecret = process.env.RAZORPAY_KEY_SECRET || ''
  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (generatedSignature !== razorpay_signature) {
    console.error('Razorpay signature verification failed')
    return res.status(400).json({ error: 'Signature verification failed. The transaction may be spoofed.' })
  }

  // 2. Calculate subscription expiration date
  let durationDays = 30
  if (planType === 'annual') {
    durationDays = 365
  } else if (planType === 'lifetime') {
    durationDays = 36500 // 100 years
  }

  const subscription_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    // 3. Update public.profiles via Supabase Admin Client
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'active',
        subscription_expires_at,
        subscription_plan_type: planType,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (error) {
      throw error
    }

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
