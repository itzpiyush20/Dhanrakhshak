import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Simple in-memory rate limiter: max 20 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  // Pre-auth abuse shield only — real cost control is the per-user daily quota
  // in Postgres below. Raised from 20 when the scanner moved to batched
  // classification: a legitimate large scan now issues its calls in a short
  // burst rather than spread over minutes of serial waiting, and at 20/min it
  // would 429 itself. A 429 here is invisible to the user (the AI layer
  // degrades to regex), so throttling a real scan silently costs accuracy.
  if (entry.count >= 60) return true
  entry.count++
  return false
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dhanrakshak-five.vercel.app'

// Server-side only — never exposed to the client, unlike a VITE_-prefixed var.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ''
  if (origin && (origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:') || origin === ALLOWED_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI insights are not configured' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const jwt = authHeader.slice(7)
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt)
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Per-user daily quota, tracked in Postgres so it survives cold starts
  // (the in-memory IP limiter above resets per serverless instance and
  // doesn't actually bound cost under any real load).
  //
  // Two independent counters: email-scan classification (one call per
  // scanned email, can be dozens per scan) and AI-insights generation
  // (roughly one call per user action) used to share a single 50/day
  // limit, which meant a normal scan could exhaust the quota the
  // insights feature depends on, or vice versa. `purpose` selects which
  // counter/limit applies; omitting it preserves the original behavior
  // for any caller written before this change.
  const purpose: 'scan' | 'insights' = req.body?.purpose === 'scan' ? 'scan' : 'insights'
  const DAILY_AI_CALL_LIMIT = 50
  const DAILY_AI_SCAN_CALL_LIMIT = 500
  const countColumn = purpose === 'scan' ? 'ai_scan_calls_count' : 'ai_calls_count'
  const resetColumn = purpose === 'scan' ? 'ai_scan_calls_reset_at' : 'ai_calls_reset_at'
  const dailyLimit = purpose === 'scan' ? DAILY_AI_SCAN_CALL_LIMIT : DAILY_AI_CALL_LIMIT

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(`${countColumn}, ${resetColumn}`)
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return res.status(500).json({ error: 'Failed to verify usage quota' })
  }

  const resetAt = new Date((profile as any)[resetColumn]).getTime()
  const needsReset = Date.now() - resetAt > 24 * 60 * 60 * 1000
  const currentCount = needsReset ? 0 : (profile as any)[countColumn]

  if (currentCount >= dailyLimit) {
    const limitMessage = purpose === 'scan' ? 'Daily AI scan limit reached. Try again tomorrow.' : 'Daily AI insights limit reached. Try again tomorrow.'
    return res.status(429).json({ error: limitMessage })
  }

  const { contents, generationConfig, safetySettings } = req.body ?? {}
  if (!Array.isArray(contents)) {
    return res.status(400).json({ error: 'contents array is required' })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig, safetySettings }),
        signal: controller.signal,
      }
    )

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ error: `Gemini API error: ${geminiRes.status}` })
    }

    const data = await geminiRes.json()

    // Deduct quota only after successful call
    await supabaseAdmin
      .from('profiles')
      .update({
        [countColumn]: currentCount + 1,
        ...(needsReset ? { [resetColumn]: new Date().toISOString() } : {}),
      })
      .eq('id', user.id)

    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Gemini proxy error:', error)
    const isTimeout = error?.name === 'AbortError'
    return res.status(isTimeout ? 504 : 500).json({ error: isTimeout ? 'Gemini API request timed out' : (error.message || 'AI request failed') })
  } finally {
    clearTimeout(timeoutId)
  }
}
