// ============================================
// Supabase Client — Typed with database schema
// ============================================

import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
  )
}

// NOTE: persistSession / autoRefreshToken / detectSessionInUrl are all the library
// defaults — they are spelled out here only for clarity. The storageKey is left at
// the default (`sb-<ref>-auth-token`) on purpose so existing logged-in sessions keep
// working after deploy. readStoredSession() below relies on that default format.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Read the persisted Supabase session directly from localStorage, WITHOUT going
 * through `supabase.auth.getSession()`.
 *
 * Why this exists: `@supabase/auth-js` gates getSession() behind the browser Web
 * Locks API. That lock is known to hang on tab re-focus after idle and under
 * contention, which would otherwise leave the app stuck on its loading spinner —
 * and our bootstrap timeout would then falsely treat the user as logged out.
 * This synchronous read lets us recover the real session instead of nulling it.
 *
 * Returns the stored Session if one exists with a refresh token, otherwise null.
 */
export function readStoredSession(): Session | null {
  try {
    if (typeof localStorage === 'undefined') return null

    // Default storage key is `sb-<project-ref>-auth-token`. Scan for it rather
    // than reconstructing the ref, so this is resilient to URL formatting.
    let raw: string | null = null
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && /^sb-.*-auth-token$/.test(key)) {
        raw = localStorage.getItem(key)
        if (raw) break
      }
    }
    if (!raw) return null

    const parsed = JSON.parse(raw)
    // supabase-js has stored this as the bare Session object, and (in older
    // versions) wrapped under `currentSession`. Handle both shapes.
    const session: Session | null =
      parsed?.access_token ? parsed : parsed?.currentSession ?? null

    if (!session || !session.refresh_token || !session.user) return null
    return session
  } catch {
    return null
  }
}
