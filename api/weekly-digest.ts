// ============================================================
// weekly-digest.ts — Scheduled weekly spend recap email
//
// Triggered by Vercel Cron (see vercel.json). Sends a short, calm
// "your week in review" email to every user who has
// profiles.weekly_report_enabled = true (the column already exists
// in the schema and defaults to true; there's no Settings UI to
// disable it yet — that's a known follow-up, not this endpoint's job).
//
// Requires two env vars to actually send anything:
//   - RESEND_API_KEY   — a Resend (resend.com) API key. Any transactional
//     email provider would do; Resend was picked for its trivial single-
//     fetch-call API with no SDK dependency. Without this set, the
//     endpoint no-ops (logs and returns 200) rather than failing loudly —
//     the digest is a nice-to-have, not something that should page anyone.
//   - CRON_SECRET      — a random string you set yourself in Vercel's
//     project env vars. Vercel automatically sends
//     `Authorization: Bearer $CRON_SECRET` on scheduled invocations of
//     this endpoint once that env var exists, which is what stops randoms
//     from hitting this URL and spamming your whole user base on demand.
//
// Optional:
//   - DIGEST_FROM_EMAIL — must be a sender address on a domain verified
//     in your Resend account. Falls back to a placeholder that will fail
//     Resend's send (safely, per-user, not the whole batch).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL || 'Dhanrakshak <digest@dhanrakshak.app>'
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch'

/** Where "Turn them off in Settings" points. Same default as every other endpoint here. */
const APP_URL = process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'https://dhanrakshak-five.vercel.app'

/** Unsubscribe replies land here. Must be an address someone actually reads. */
const UNSUBSCRIBE_EMAIL = process.env.SUPPORT_EMAIL || 'support@dhanrakshak.in'

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food & Dining',
  groceries: 'Groceries',
  transport: 'Transport',
  shopping: 'Shopping',
  utilities: 'Utilities & Bills',
  rent: 'Rent',
  health: 'Health',
  entertainment: 'Entertainment',
  education: 'Education',
  travel: 'Travel',
  subscriptions: 'Subscriptions',
  investments: 'Investments',
  salary: 'Salary',
  other: 'Other',
}

interface WeeklyTxn {
  user_id: string
  amount: string | number
  type: 'debit' | 'credit'
  category: string
}

/**
 * Escape text before it is interpolated into the email's HTML.
 *
 * `full_name` is whatever the user typed into their profile. It was being
 * dropped into the markup raw, so a name containing markup became markup in
 * the delivered email — and mail clients that render it would treat it as
 * part of our message. Self-inflicted for the person who typed it, but it also
 * breaks the email outright for an innocent name containing an ampersand.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildDigestHtml(opts: {
  name: string
  totalExpenses: number
  totalIncome: number
  topCategory: { label: string; amount: number } | null
  txnCount: number
  appUrl: string
  unsubscribeMailto: string
}): string {
  const { totalExpenses, totalIncome, topCategory, txnCount, appUrl, unsubscribeMailto } = opts
  const name = escapeHtml(opts.name)
  const net = totalIncome - totalExpenses
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#18181b;">
      <p style="font-size:15px;">Hi ${name || 'there'},</p>
      <p style="font-size:15px;">Here's your week in review:</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#71717a;">Spent this week</p>
        <p style="margin:0 0 16px;font-size:24px;font-weight:700;">${formatINR(totalExpenses)}</p>
        ${
          topCategory
            ? `<p style="margin:0;font-size:13px;color:#3f3f46;">Biggest category: <strong>${topCategory.label}</strong> (${formatINR(topCategory.amount)})</p>`
            : ''
        }
        <p style="margin:8px 0 0;font-size:13px;color:${net >= 0 ? '#059669' : '#dc2626'};">
          Net ${net >= 0 ? 'saved' : 'over'}: ${formatINR(Math.abs(net))}
        </p>
      </div>
      <p style="font-size:13px;color:#71717a;">${txnCount} transaction${txnCount === 1 ? '' : 's'} tracked automatically — zero manual entry.</p>
      <p style="font-size:12px;color:#a1a1aa;margin-top:24px;">
        You're getting this because weekly summaries are switched on for your account.
        <a href="${appUrl}/settings" style="color:#71717a;">Turn them off in Settings</a>
        or <a href="${unsubscribeMailto}" style="color:#71717a;">unsubscribe</a>.
      </p>
    </div>
  `
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!RESEND_API_KEY) {
    console.warn('weekly-digest: RESEND_API_KEY not configured — skipping send.')
    return res.status(200).json({ status: 'skipped', reason: 'no email provider configured' })
  }

  try {
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .eq('weekly_report_enabled', true)

    if (profilesErr) throw profilesErr
    if (!profiles || profiles.length === 0) {
      return res.status(200).json({ status: 'ok', sent: 0 })
    }

    const weekEnd = new Date()
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekEnd.getDate() - 7)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const userIds = profiles.map((p) => p.id)
    const { data: txns, error: txnsErr } = await supabaseAdmin
      .from('transactions')
      .select('user_id, amount, type, category')
      .in('user_id', userIds)
      .eq('approval_status', 'approved')
      .gte('date', weekStartStr)
      .lte('date', weekEndStr)

    if (txnsErr) throw txnsErr

    const byUser = new Map<string, WeeklyTxn[]>()
    ;(txns || []).forEach((t) => {
      const list = byUser.get(t.user_id) || []
      list.push(t)
      byUser.set(t.user_id, list)
    })

    const emails = profiles
      .map((profile) => {
        const userTxns = byUser.get(profile.id) || []
        if (userTxns.length === 0) return null // nothing to report — don't email an empty week

        const debits = userTxns.filter((t) => t.type === 'debit')
        const credits = userTxns.filter((t) => t.type === 'credit')
        const totalExpenses = debits.reduce((sum, t) => sum + Number(t.amount), 0)
        const totalIncome = credits.reduce((sum, t) => sum + Number(t.amount), 0)

        const categoryTotals = new Map<string, number>()
        debits.forEach((t) => categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + Number(t.amount)))
        let topCategory: { label: string; amount: number } | null = null
        if (categoryTotals.size > 0) {
          const [code, amount] = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]
          topCategory = { label: CATEGORY_LABELS[code] || code, amount }
        }

        if (!profile.email) return null

        // One-click unsubscribe, per RFC 8058 / the Gmail and Yahoo bulk-sender
        // requirements. A recurring email with no machine-readable opt-out is a
        // fast route to being filtered as spam, and an opt-out is required of
        // commercial mail in most jurisdictions this ships to.
        //
        // The mailto form rather than the https form on purpose: https one-click
        // needs a public endpoint to POST to, and this project sits on Vercel's
        // 12-function Hobby cap with no room for another route. mailto is fully
        // supported by the same spec and needs no endpoint — it just means an
        // unsubscribe arrives as email to be actioned, so it must be watched.
        const unsubscribeMailto =
          `mailto:${UNSUBSCRIBE_EMAIL}?subject=${encodeURIComponent('Unsubscribe from weekly summary')}` +
          `&body=${encodeURIComponent(`Please stop sending the weekly summary to ${profile.email}.`)}`

        return {
          from: FROM_EMAIL,
          to: profile.email,
          subject: `Your week in review — ${formatINR(totalExpenses)} spent`,
          headers: {
            'List-Unsubscribe': `<${unsubscribeMailto}>, <${APP_URL}/settings>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          html: buildDigestHtml({
            name: profile.full_name || '',
            totalExpenses,
            totalIncome,
            topCategory,
            txnCount: userTxns.length,
            appUrl: APP_URL,
            unsubscribeMailto,
          }),
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    if (emails.length === 0) {
      return res.status(200).json({ status: 'ok', sent: 0 })
    }

    // Resend's batch endpoint accepts up to 100 emails per call.
    let sent = 0
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100)
      const resendRes = await fetch(RESEND_BATCH_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      })
      if (!resendRes.ok) {
        console.error('weekly-digest: Resend batch send failed', resendRes.status, await resendRes.text())
        continue
      }
      sent += batch.length
    }

    return res.status(200).json({ status: 'ok', sent })
  } catch (error: any) {
    console.error('weekly-digest error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
