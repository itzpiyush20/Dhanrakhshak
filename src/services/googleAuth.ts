// ============================================================
// googleAuth.ts — Single source of truth for Google OAuth tokens
//
// Google access tokens (provider_token) expire after 3600 seconds.
// Supabase stores the token only during the initial OAuth callback —
// after any session refresh or page reload, session.provider_token is null.
//
// This module persists the token + an expiry timestamp so we can:
//   1. Know client-side if the token is expired (no network round-trip)
//   2. Have one consistent token source for both UI and scanner
//   3. React to token expiry by clearing state and re-showing connect UI
// ============================================================

const TOKEN_KEY = 'dhanrakshak_google_token'
const EXPIRY_KEY = 'dhanrakshak_google_token_expiry'

// Google tokens are valid for 3600s; we treat them as expired 5 min early
const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 minutes

/**
 * Save a fresh Google provider token with an expiry timestamp.
 * Call this whenever onAuthStateChange gives us a session.provider_token.
 */
export function saveGoogleToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRY_KEY, (Date.now() + TOKEN_TTL_MS).toString())
}

/**
 * Get the current Google token if valid, or null if expired / missing.
 * Automatically clears stale tokens.
 */
export function getGoogleToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null

  const expiry = localStorage.getItem(EXPIRY_KEY)
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    // Token has passed our 55-minute threshold — clear and return null
    clearGoogleToken()
    return null
  }

  return token
}

/**
 * Returns true if a non-expired Google token is stored.
 * Cheap synchronous check — safe to call in render paths.
 */
export function isGoogleConnected(): boolean {
  return getGoogleToken() !== null
}

/**
 * Clear the stored token and expiry (e.g. after a 401, sign-out, or manual disconnect).
 */
export function clearGoogleToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

/**
 * One-time migration: remove the OLD token key used by previous versions
 * of the app (before googleAuth.ts was introduced).
 * Call this once on app startup (in main.tsx or AuthContext).
 * It is safe to call multiple times — it is a no-op after the first run.
 */
export function purgeOldTokenKey(): void {
  // The old key had no expiry tracking and was read inconsistently.
  // Remove it unconditionally — any valid token is now under TOKEN_KEY.
  localStorage.removeItem('dhanrakshak_oauth_provider_token')
}

export async function validateGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) {
      // Only clear if the invalid token is the one currently in localStorage
      if (token === localStorage.getItem(TOKEN_KEY)) {
        clearGoogleToken()
      }
      return false
    }
    return res.ok
  } catch (e) {
    console.warn('validateGoogleToken error:', e)
    return false
  }
}

