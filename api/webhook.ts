import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { verifyHmacSignature, planDurationDays } from './_lib/razorpaySignature.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function getRawBody(readable: any): Promise<string> {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const isHosted = process.env.VERCEL === '1'
  const keyId = [process.env.RAZORPAY_KEY_ID, process.env.VITE_RAZORPAY_KEY_ID]
    .find(k => k && k.startsWith('rzp_')) || process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || ''
  if (isHosted && keyId.startsWith('rzp_test_')) {
    console.error('Security alert: Webhook processing blocked using test keys in hosted environments.')
    return res.status(400).json({ error: 'Test payments are not allowed in hosted environments.' })
  }

  try {
    const rawBody = await getRawBody(req)
    const signature = req.headers['x-razorpay-signature'] as string

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' })
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
    if (!verifyHmacSignature(rawBody, secret, signature)) {
      console.error('Razorpay Webhook signature verification failed')
      return res.status(400).json({ error: 'Invalid webhook signature' })
    }

    const event = JSON.parse(rawBody)

    if (event.event === 'order.paid') {
      const orderEntity = event.payload.order.entity

      // Idempotency: skip if already processed
      const orderId = orderEntity.id as string
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('razorpay_order_id', orderId)
        .maybeSingle()

      if (existing) {
        console.log(`Webhook order.paid already processed for order ${orderId}, skipping`)
        return res.status(200).json({ status: 'already_processed' })
      }

      const { userId, planType } = orderEntity.notes || {}

      if (!userId || !planType) {
        console.warn('Webhook order.paid missing userId or planType in notes')
        return res.status(200).json({ status: 'ignored_missing_notes' })
      }

      const durationDays = planDurationDays(planType)
      const subscription_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_expires_at,
          subscription_plan_type: planType,
          razorpay_order_id: orderId, // Fix idempotency bug
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select('id')

      if (error) throw error
      // Supabase returns success with an empty array (no error) when the filter
      // matches zero rows — without this check a missing/mismatched profile row
      // would silently report success while never awarding the subscription.
      if (!data || data.length === 0) {
        console.error('Webhook subscription update matched no profile row for userId:', userId, 'order:', orderId)
        throw new Error('No matching profile found to update.')
      }

      // Record the receipt. The unique index on razorpay_order_id means the
      // race with verify-payment.ts — both fire for the same order — leaves
      // exactly one row, whichever arrives first.
      await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          razorpay_order_id: orderId,
          razorpay_payment_id: null,
          plan_type: planType,
          // Razorpay reports paise; payments.amount_inr holds rupees.
          amount_inr: typeof orderEntity?.amount === 'number' ? orderEntity.amount / 100 : 0,
          source: 'razorpay',
          status: 'captured',
        })
        .then(({ error: paymentError }: { error: { code?: string; message?: string } | null }) => {
          if (paymentError && paymentError.code !== '23505') {
            console.warn('Webhook failed to record payment for order', orderId, paymentError.message)
          }
        })

      console.log(`Successfully updated subscription for user ${userId} via webhook`)
    }

    return res.status(200).json({ status: 'ok' })
  } catch (error: any) {
    console.error('Razorpay Webhook error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
