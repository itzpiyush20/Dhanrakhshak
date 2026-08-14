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
//
// Optional tuning (both have safe defaults, no action needed to deploy):
//   - AUTO_SYNC_MAX_GEMINI_CALLS_PER_RUN (default 500) — global cap on
//     Gemini calls per cron invocation, bounding worst-case AI cost as
//     the eligible user base grows.
//   - AUTO_SYNC_INTER_USER_DELAY_MS (default 500) — delay between users
//     to stay under Gmail API rate limits during a run with many users.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { scanRealGmailInbox } from '../src/services/emailScanner.js'
import { isPremiumProfile } from '../src/services/subscription.js'
import { analyzeTransactionEmailWithAI, analyzeTransactionEmailBatchWithAI } from '../src/services/aiService.js'
import {
  callGeminiWithFallback,
  isModelNotFoundStatus,
  modelNotFoundMessage,
  resolveGeminiModel,
} from './_lib/geminiModel.js'

/**
 * This cron scans every eligible user sequentially in one invocation. Without
 * an explicit duration it ran under Vercel's 10s default, which a single
 * user's scan can exceed on its own — so the run was being killed partway
 * through, silently, with later users never scanned at all.
 *
 * 60s is the Hobby-plan ceiling without Fluid Compute. If the eligible user
 * base outgrows one 60s window, the fix is Fluid Compute (maxDuration up to
 * 300) — not a larger number here, which would fail the build on Hobby.
 * Until then BUDGET_MS below stops the loop cleanly instead of letting the
 * platform hard-kill it mid-await.
 */
export const maxDuration = 60

/**
 * Wall-clock the loop may consume before it stops starting new users.
 *
 * The 15s reserve is for the user already in flight when the budget runs out:
 * a hard platform kill lands mid-`await`, so that user gets no email_scan_logs
 * row at all — not even a `failed` one — and every user behind them is skipped
 * with no record either. Stopping early instead leaves each user either fully
 * scanned-and-logged or untouched.
 */
const BUDGET_MS = maxDuration * 1000 - 15_000

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

/**
 * Whether this user gets the daily automatic scan.
 *
 * Delegates to the canonical `isPremiumProfile` rather than re-deriving it.
 * The local copy this replaced computed `notExpired` as
 * `!subscription_expires_at || <date> > now`, so a trial carrying NO expiry
 * date short-circuited to eligible — while the canonical check deliberately
 * requires a trial to have an unexpired end date. That segment was receiving a
 * daily automatic scan the free tier is not entitled to, contradicting R6.
 */
export function isEligible(profile: Profile): boolean {
  const email = profile.email?.toLowerCase().trim() || ''
  if (OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(email)) return true
  return isPremiumProfile(profile)
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
    // Bounded like the proxy's call. An unbounded fetch here could consume the
    // whole cron window on one hung request and starve every remaining user.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)
    let res: Response
    try {
      // Shares the proxy's candidate-model walk, so the cron cannot be left
      // running a retired id while the browser path quietly recovered.
      ;({ response: res } = await callGeminiWithFallback(GEMINI_API_KEY, body, {
        signal: controller.signal,
      }))
    } finally {
      clearTimeout(timeoutId)
    }
    if (!res.ok) {
      // Same reasoning as the proxy: a retired model id is a configuration
      // fault that must be shouted about, not folded into the generic
      // "AI unavailable, use regex" path that hides it indefinitely.
      if (isModelNotFoundStatus(res.status)) {
        console.error(
          `[auto-sync-gmail] FATAL CONFIG ERROR: no candidate model resolved. ${modelNotFoundMessage(resolveGeminiModel())}`
        )
      }
      throw new Error(`Gemini API error: ${res.status}`)
    }
    return res.json()
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now()
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
    return res.status(200).json({ usersProcessed: 0, succeeded: 0, failed: 0, transactionsFound: 0, skippedForBudget: 0 })
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

  // Fair ordering: oldest successful scan first, never-scanned users first of
  // all. Without it the token query's physical row order decides who runs, so
  // the users the budget stop cuts off are the same ones every single day and
  // their scheduled scan silently never happens.
  //
  // Deliberately ONE query for every user, not one per user — a per-user query
  // would spend the very budget this ordering exists to protect.
  const { data: scanLogRows, error: scanLogsErr } = await supabaseAdmin
    .from('email_scan_logs')
    .select('user_id, scanned_at')
    .in('user_id', userIds)
    .eq('status', 'success')
    .order('scanned_at', { ascending: false })

  if (scanLogsErr) {
    // Not fatal: a missing ordering hint costs fairness, not correctness, and
    // is no reason to skip everyone's scheduled scan for the day.
    console.error('auto-sync-gmail: failed to preload scan logs, falling back to token order', scanLogsErr)
  }

  // Rows arrive newest-first, so the first one seen per user is their latest.
  const lastSuccessByUser = new Map<string, number>()
  for (const log of scanLogRows || []) {
    if (lastSuccessByUser.has(log.user_id)) continue
    const at = log.scanned_at ? new Date(log.scanned_at).getTime() : NaN
    lastSuccessByUser.set(log.user_id, Number.isNaN(at) ? -Infinity : at)
  }

  // Compared, not subtracted: two never-scanned users would both be -Infinity
  // and `-Infinity - -Infinity` is NaN, which makes the sort order arbitrary.
  const orderedTokenRows = [...tokenRows].sort((a, b) => {
    const aAt = lastSuccessByUser.get(a.user_id) ?? -Infinity
    const bAt = lastSuccessByUser.get(b.user_id) ?? -Infinity
    if (aAt === bAt) return 0
    return aAt < bAt ? -1 : 1
  })

  const callGeminiDirect = makeCallGeminiDirect()

  let succeeded = 0
  let failed = 0
  let transactionsFound = 0
  let usersProcessed = 0
  let skippedForBudget = 0

  const INTER_USER_DELAY_MS = Number(process.env.AUTO_SYNC_INTER_USER_DELAY_MS) || 500

  for (const row of orderedTokenRows) {
    const profile = profileById.get(row.user_id)
    if (!profile || !isEligible(profile)) continue

    if (Date.now() - startedAt > BUDGET_MS) {
      skippedForBudget += 1
      continue
    }

    if (usersProcessed > 0) {
      await new Promise((resolve) => setTimeout(resolve, INTER_USER_DELAY_MS))
    }
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
          scan_mode: 'scheduled',
          error_message: 'Gmail connection revoked — please reconnect Gmail Inbox.',
        })
        failed++
        continue
      }
      if ('error' in refreshResult) throw new Error(refreshResult.error)

      const { data, error } = await scanRealGmailInbox({
        db: supabaseAdmin,
        // Scheduled, so it is exempt from the manual quota — a user's daily
        // automatic scan must never consume their manual allowance (R7).
        scanMode: 'scheduled' as const,
        userId: row.user_id,
        userEmail: profile.email || undefined,
        accessToken: refreshResult.accessToken,
        // Batch is the primary path (one Gemini call per 5 emails); askAI stays
        // as the per-email fallback the batch helper degrades to. Because the
        // run-wide cap below counts CALLS, batching stretches the same cap
        // roughly 5x further in emails processed.
        askAI: (subject, body, emailDate) => analyzeTransactionEmailWithAI(subject, body, emailDate, callGeminiDirect),
        askAIBatch: (emails, categoryNames) => analyzeTransactionEmailBatchWithAI(emails, callGeminiDirect, categoryNames),
      })

      if (error) {
        await supabaseAdmin.from('email_scan_logs').insert({
          user_id: row.user_id,
          emails_processed: 0,
          transactions_found: 0,
          status: 'failed',
          scan_mode: 'scheduled',
          error_message: error.message || 'Automatic sync failed',
        })
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
        scan_mode: 'scheduled',
        error_message: err.message || 'Automatic sync failed',
      })
      failed++
    }
  }

  if (skippedForBudget > 0) {
    console.warn(
      `auto-sync-gmail: ran out of time budget after ${usersProcessed} user(s); ${skippedForBudget} deferred to the next run`
    )
  }

  return res.status(200).json({ usersProcessed, succeeded, failed, transactionsFound, skippedForBudget })
}
