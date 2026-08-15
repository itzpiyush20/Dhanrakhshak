import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { normalisePromoCode, validateNewPromoCode } from './_lib/promo.js'

// ============================================
// Admin coupon management: list, create, deactivate.
//
// The admin panel is otherwise read-only. This is the one place it writes, so
// the admin check is done HERE, against the database, using the account id
// taken from the caller's token. The browser saying "I am an admin" means
// nothing — profiles.is_admin is the only thing consulted.
//
// Codes are never deleted, only deactivated: a deleted code would take its
// redemption history with it.
// ============================================

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak-five.vercel.app'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ''
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (userError || !user) return res.status(401).json({ error: 'Unauthorized' })

  // The gate. Everything below this line assumes a verified admin.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' })
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .select('code, plan_type, duration_days, active, max_uses, used_count, note, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return res.status(200).json({ codes: data ?? [] })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { action } = req.body ?? {}

    if (action === 'create') {
      const { code: rawCode, durationDays, maxUses, planType, note } = req.body ?? {}

      if (typeof rawCode !== 'string') return res.status(400).json({ error: 'Code is required.' })

      const days = Number(durationDays)
      const uses = maxUses === null || maxUses === undefined || maxUses === '' ? null : Number(maxUses)

      const problem = validateNewPromoCode({ code: rawCode, durationDays: days, maxUses: uses })
      if (problem) return res.status(400).json({ error: problem })

      if (planType !== undefined && planType !== 'monthly' && planType !== 'annual') {
        return res.status(400).json({ error: 'Plan must be monthly or annual.' })
      }

      const { error } = await supabaseAdmin.from('promo_codes').insert({
        code: normalisePromoCode(rawCode),
        plan_type: planType || 'monthly',
        duration_days: days,
        max_uses: uses,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      })

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'That code already exists.' })
        throw error
      }

      return res.status(200).json({ success: true, code: normalisePromoCode(rawCode) })
    }

    if (action === 'set_active') {
      const { code: rawCode, active } = req.body ?? {}
      if (typeof rawCode !== 'string' || typeof active !== 'boolean') {
        return res.status(400).json({ error: 'Code and active flag are required.' })
      }

      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .update({ active })
        .eq('code', normalisePromoCode(rawCode))
        .select('code')

      if (error) throw error
      if (!data || data.length === 0) return res.status(404).json({ error: 'No such code.' })

      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('Admin promo operation failed:', error)
    return res.status(500).json({ error: 'Operation failed. Please try again.' })
  }
}
