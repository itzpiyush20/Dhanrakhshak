// ============================================================
// auto-sync-gmail.ts — Automatic daily Gmail sync for eligible users
//
// Triggered by Vercel Cron (see vercel.json). Runs scanRealGmailInbox()
// server-side for every user who has a stored Google refresh token AND
// is eligible: the app owner, or an active/unexpired premium or trial
// subscription. Free-tier users keep manual "Sync Now" only — this
// mirrors the cooldown-bypass eligibility already used in
// src/services/emailScanner.ts.
//
// Requires (all already used elsewhere in this app, no new env vars):
//   - CRON_SECRET, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Google token refresh)
//   - GEMINI_API_KEY (direct Gemini call — no per-user proxy quota
//     applies here, since this path is already gated to eligible users)
//   - VITE_OWNER_EMAILS (optional, comma-separated owner bypass list)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { scanRealGmailInbox } from '../src/services/emailScanner.js'
import { analyzeTransactionEmailWithAI } from '../src/services/aiService.js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const OWNER_EMAILS = (process.env.VITE_OWNER_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

interface Profile {
  id: string
  email: string | null
  subscription_status: string | null
  subscription_expires_at: string | null
}

function isEligible(profile: Profile): boolean {
  const email = profile.email?.toLowerCase().trim() || ''
  if (OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(email)) return true

  const notExpired = !profile.subscription_expires_at || new Date(profile.subscription_expires_at).getTime() > Date.now()
  if (profile.subscription_status === 'active' && notExpired) return true
  if (profile.subscription_status === 'trial' && notExpired) return true
  return false
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string } | { revoked: true } | { error: string }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({})) as Record<string, string>
    if (err.error === 'invalid_grant') return { revoked: true }
    return { error: err.error || 'Token refresh failed' }
  }

  const { access_token } = await tokenRes.json() as { access_token: string }
  return { accessToken: access_token }
}

const MAX_GEMINI_CALLS_PER_RUN = Number(process.env.AUTO_SYNC_MAX_GEMINI_CALLS_PER_RUN) || 500

/** Direct Gemini call for the cron path — never runs in the browser, so it's safe to use GEMINI_API_KEY here. */
function makeCallGeminiDirect() {
  let callCount = 0
  return async function callGeminiDirect(body: Record<string, unknown>): Promise<any> {
    if (callCount >= MAX_GEMINI_CALLS_PER_RUN) {
      throw new Error(`auto-sync-gmail: Gemini call cap (${MAX_GEMINI_CALLS_PER_RUN}) reached for this run`)
    }
    callCount++
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
    return res.json()
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: tokenRows, error: tokensErr } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('user_id, refresh_token')

  if (tokensErr) {
    console.error('auto-sync-gmail: failed to load tokens', tokensErr)
    return res.status(500).json({ error: tokensErr.message })
  }
  if (!tokenRows || tokenRows.length === 0) {
    return res.status(200).json({ usersProcessed: 0, succeeded: 0, failed: 0, transactionsFound: 0 })
  }

  const userIds = tokenRows.map((t) => t.user_id)
  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, subscription_status, subscription_expires_at')
    .in('id', userIds)

  if (profilesErr) {
    console.error('auto-sync-gmail: failed to load profiles', profilesErr)
    return res.status(500).json({ error: profilesErr.message })
  }

  const profileById = new Map<string, Profile>((profiles || []).map((p) => [p.id, p as Profile]))

  const callGeminiDirect = makeCallGeminiDirect()

  let succeeded = 0
  let failed = 0
  let transactionsFound = 0
  let usersProcessed = 0

  for (const row of tokenRows) {
    const profile = profileById.get(row.user_id)
    if (!profile || !isEligible(profile)) continue

    usersProcessed++

    try {
      const refreshResult = await refreshAccessToken(row.refresh_token)

      if ('revoked' in refreshResult) {
        await supabaseAdmin.from('google_oauth_tokens').delete().eq('user_id', row.user_id)
        await supabaseAdmin.from('email_scan_logs').insert({
          user_id: row.user_id,
          emails_processed: 0,
          transactions_found: 0,
          status: 'failed',
          error_message: 'Gmail connection revoked — please reconnect Gmail Inbox.',
        })
        failed++
        continue
      }
      if ('error' in refreshResult) throw new Error(refreshResult.error)

      const { data, error } = await scanRealGmailInbox({
        db: supabaseAdmin,
        userId: row.user_id,
        userEmail: profile.email || undefined,
        accessToken: refreshResult.accessToken,
        askAI: (subject, body, emailDate) => analyzeTransactionEmailWithAI(subject, body, emailDate, callGeminiDirect),
      })

      if (error) {
        // scanRealGmailInbox already logged its own failure row internally — don't log twice.
        console.error(`auto-sync-gmail: scan returned an error for user ${row.user_id}`, error)
        failed++
        continue
      }

      succeeded++
      transactionsFound += data?.transactions?.length || 0
    } catch (err: any) {
      console.error(`auto-sync-gmail: sync failed for user ${row.user_id}`, err)
      await supabaseAdmin.from('email_scan_logs').insert({
        user_id: row.user_id,
        emails_processed: 0,
        transactions_found: 0,
        status: 'failed',
        error_message: err.message || 'Automatic sync failed',
      })
      failed++
    }
  }

  return res.status(200).json({ usersProcessed, succeeded, failed, transactionsFound })
}
