// ============================================================
// googleAuth.ts — Single source of truth for Google OAuth tokens
//
// Google access tokens (provider_token) expire after 3600 seconds.
// Supabase stores the token only during the initial OAuth callback —
// after any session refresh or page reload, session.provider_token is null.
//
// This module persists:
//   - provider_token (access token, 58 min TTL)  → localStorage
//   - provider_refresh_token (long-lived)         → localStorage
//
// When the access token expires, tryRefreshGoogleToken() silently
// exchanges the refresh token via /api/refresh-google-token (server-side,
// keeps the Google client_secret off the browser). The user never needs
// to re-authenticate unless they explicitly revoke access in their Google
// account settings.
// ============================================================

const TOKEN_KEY = 'dhanrakshak_google_token'
const EXPIRY_KEY = 'dhanrakshak_google_token_expiry'
const REFRESH_TOKEN_KEY = 'dhanrakshak_google_refresh_token'

const TOKEN_TTL_MS = 58 * 60 * 1000 // 58 minutes (Google tokens last 60 min)

// ── Access token ─────────────────────────────────────────────

export function saveGoogleToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRY_KEY, (Date.now() + TOKEN_TTL_MS).toString())
}

export function getGoogleToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null

  const expiry = localStorage.getItem(EXPIRY_KEY)
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    clearGoogleToken()
    return null
  }

  return token
}

export function isGoogleConnected(): boolean {
  return getGoogleToken() !== null
}

// Clears only the access token — keeps the refresh token so silent refresh still works.
export function clearGoogleToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

// Clears everything — call only on sign-out or when the refresh token is revoked.
export function clearAllGoogleTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// ── Refresh token ─────────────────────────────────────────────

export function saveGoogleRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function getGoogleRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

// ── Silent refresh ────────────────────────────────────────────

/**
 * Exchange the stored Google refresh token for a new access token via our
 * Vercel API endpoint (which holds the client_secret server-side).
 * Returns the new access token on success, null if refresh is not possible.
 * Clears the refresh token if Google says it's been revoked (410 response).
 */
export async function tryRefreshGoogleToken(supabaseJwt: string): Promise<string | null> {
  const refreshToken = getGoogleRefreshToken()
  if (!refreshToken || !supabaseJwt) return null

  try {
    const res = await fetch('/api/refresh-google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (res.status === 410) {
      // Refresh token revoked by the user in Google account settings
      clearAllGoogleTokens()
      return null
    }

    if (!res.ok) return null

    const { accessToken } = await res.json() as { accessToken: string }
    if (accessToken) {
      saveGoogleToken(accessToken)
      return accessToken
    }
    return null
  } catch (e) {
    console.warn('tryRefreshGoogleToken error:', e)
    return null
  }
}

// ── Validation & migration ────────────────────────────────────

export async function validateGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) {
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

// Remove the very old token key from pre-v2 of the app.
export function purgeOldTokenKey(): void {
  localStorage.removeItem('dhanrakshak_oauth_provider_token')
}
