import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('saveGoogleRefreshTokenServerSide', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('POSTs the refresh token to the save endpoint with the Supabase JWT', async () => {
    const { saveGoogleRefreshTokenServerSide } = await import('./googleAuth')
    await saveGoogleRefreshTokenServerSide('supabase-jwt', 'google-refresh-token')

    expect(fetch).toHaveBeenCalledWith('/api/save-google-refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer supabase-jwt' },
      body: JSON.stringify({ refreshToken: 'google-refresh-token' }),
    })
  })

  it('does not throw when the request fails (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { saveGoogleRefreshTokenServerSide } = await import('./googleAuth')
    await expect(saveGoogleRefreshTokenServerSide('jwt', 'rt')).resolves.toBeUndefined()
  })
})
