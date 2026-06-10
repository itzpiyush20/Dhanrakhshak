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
//
// Storage: sessionStorage (tab-scoped, cleared on tab/browser close).
// This is safer than localStorage — token doesn't persist across sessions.
// ============================================================

const TOKEN_KEY = 'dhanrakshak_google_token'
const EXPIRY_KEY = 'dhanrakshak_google_token_expiry'

const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 minutes

/**
 * Save a fresh Google provider token with an expiry timestamp.
 * Call this whenever onAuthStateChange gives us a session.provider_token.
 */
export function saveGoogleToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(EXPIRY_KEY, (Date.now() + TOKEN_TTL_MS).toString())
}

/**
 * Get the current Google token if valid, or null if expired / missing.
 * Automatically clears stale tokens.
 */
export function getGoogleToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (!token) return null

  const expiry = sessionStorage.getItem(EXPIRY_KEY)
  if (expiry && Date.now() > parseInt(expiry, 10)) {
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
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(EXPIRY_KEY)
}

/**
 * One-time migration: remove any token left over in localStorage from
 * previous versions of the app that used localStorage for token storage.
 * Call this once on app startup. Safe to call multiple times.
 */
export function purgeOldTokenKey(): void {
  localStorage.removeItem('dhanrakshak_oauth_provider_token')
  // Also clear any tokens that were previously stored in localStorage
  localStorage.removeItem('dhanrakshak_google_token')
  localStorage.removeItem('dhanrakshak_google_token_expiry')
}

export async function validateGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) {
      if (token === sessionStorage.getItem(TOKEN_KEY)) {
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
