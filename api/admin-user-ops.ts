import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { grantExpiryFrom } from './_lib/promo.js'

// ============================================
// Admin subscription operations: grant access, end access.
//
// The most dangerous endpoint in the app — it hands out paid access — so the
// rules are deliberately narrow:
//
//   * the caller's identity comes from their token, never the request body
//   * profiles.is_admin is re-read from the database on every call
//   * an admin cannot grant themselves anything (see SELF_GRANT check)
//   * grants are capped at 365 days, so a typo cannot create another
//     hundred-year subscription like the lifetime tier did
//   * every grant is written to payments, so free access is auditable
//
// It cannot set is_admin. Admin rights remain a manual SQL step by design.
// ============================================

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak-five.vercel.app'

const MAX_GRANT_DAYS = 365

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ''
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (userError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: caller, error: callerError } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (callerError || !caller?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' })
  }

  const { action, userId, days, planType } = req.body ?? {}

  if (typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'A target account is required.' })
  }

  // An admin granting themselves access is how a small favour becomes a habit,
  // and it makes the audit trail meaningless. Do it in SQL if you must.
  if (userId === user.id) {
    return res.status(400).json({ error: 'You cannot change your own subscription here.' })
  }

  try {
    if (action === 'grant') {
      const grantDays = Number(days)
      if (!Number.isInteger(grantDays) || grantDays < 1 || grantDays > MAX_GRANT_DAYS) {
        return res.status(400).json({ error: `Days must be a whole number between 1 and ${MAX_GRANT_DAYS}.` })
      }
      if (planType !== 'monthly' && planType !== 'annual') {
        return res.status(400).json({ error: 'Plan must be monthly or annual.' })
      }

      const expiresAt = grantExpiryFrom(grantDays)

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          subscription_plan_type: planType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id, email')

      if (error) throw error
      if (!data || data.length === 0) return res.status(404).json({ error: 'No such account.' })

      // Auditable: who got free access, when, and for how long.
      await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          plan_type: planType,
          amount_inr: 0,
          source: 'admin',
          status: 'captured',
        })
        .then(({ error: paymentError }: { error: { message?: string } | null }) => {
          if (paymentError) console.warn('Failed to record admin grant in payments:', paymentError.message)
        })

      return res.status(200).json({ success: true, email: data[0].email, expiresAt })
    }

    if (action === 'expire') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'expired',
          subscription_expires_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id, email')

      if (error) throw error
      if (!data || data.length === 0) return res.status(404).json({ error: 'No such account.' })

      return res.status(200).json({ success: true, email: data[0].email })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('Admin user operation failed:', error)
    return res.status(500).json({ error: 'Operation failed. Please try again.' })
  }
}
