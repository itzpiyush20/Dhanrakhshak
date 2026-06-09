import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Disable Vercel's default body parser so we can read the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
}

// Helper to buffer raw request body stream
async function getRawBody(readable: any): Promise<string> {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Enforce that only real payments are processed in production environments
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''
  if (isProduction && keyId.startsWith('rzp_test_')) {
    console.error('Security alert: Webhook processing blocked using test keys in production.')
    return res.status(400).json({ error: 'Test payments are not allowed in the production environment.' })
  }

  try {
    const rawBody = await getRawBody(req)
    const signature = req.headers['x-razorpay-signature'] as string

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' })
    }

    // Verify webhook signature
    // The secret is set up by the user in the Razorpay Webhooks Dashboard
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    if (generatedSignature !== signature) {
      console.error('Razorpay Webhook signature verification failed')
      return res.status(400).json({ error: 'Invalid webhook signature' })
    }

    // Parse the verified payload
    const event = JSON.parse(rawBody)
    console.log(`Received Razorpay webhook event: ${event.event}`)

    // Only process order.paid (or payment.captured) events
    if (event.event === 'order.paid') {
      const orderEntity = event.payload.order.entity
      const { userId, planType } = orderEntity.notes || {}

      if (!userId || !planType) {
        console.warn('Webhook order.paid missing userId or planType in notes')
        return res.status(200).json({ status: 'ignored_missing_notes' })
      }

      // Calculate expiry date
      let durationDays = 30
      if (planType === 'annual') {
        durationDays = 365
      } else if (planType === 'lifetime') {
        durationDays = 36500
      }

      const subscription_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

      // Update the user's subscription status
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

      console.log(`Successfully updated subscription to active for user ${userId} via webhook`)
    }

    return res.status(200).json({ status: 'ok' })
  } catch (error: any) {
    console.error('Razorpay Webhook error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
