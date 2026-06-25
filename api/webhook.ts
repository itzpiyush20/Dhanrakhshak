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
      // other paths that may also report the same purchase (verify-payment.ts,
      // and Razorpay's own account-wide webhook calling Intrak directly).
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

      console.log(`Successfully updated subscription for user ${userId} via webhook`)

      // Notify Intrak background attribution tracker
      await notifyIntrak(orderEntity);
    }

    return res.status(200).json({ status: 'ok' })
  } catch (error: any) {
    console.error('Razorpay Webhook error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
