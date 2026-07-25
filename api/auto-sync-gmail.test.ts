import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const { mockTokensSelect, mockProfilesSelect, mockScanRealGmailInbox, mockTokenDelete, mockLogInsert, mockRefreshFetch } = vi.hoisted(() => ({
  mockTokensSelect: vi.fn(),
  mockProfilesSelect: vi.fn(),
  mockScanRealGmailInbox: vi.fn(),
  mockTokenDelete: vi.fn(),
  mockLogInsert: vi.fn(),
  mockRefreshFetch: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'google_oauth_tokens') {
        return { select: mockTokensSelect, delete: () => ({ eq: mockTokenDelete }) }
      }
      if (table === 'profiles') {
        return { select: () => ({ in: mockProfilesSelect }) }
      }
      if (table === 'email_scan_logs') {
        return { insert: mockLogInsert }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('../src/services/emailScanner.js', () => ({
  scanRealGmailInbox: mockScanRealGmailInbox,
}))

// auto-sync-gmail.ts statically imports aiService.ts, which itself imports the
// real browser Supabase client (src/services/supabase.ts) — that module throws
// at import time if VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set. Mock it
// out entirely so this test doesn't depend on those env vars being present.
vi.mock('../src/services/aiService.js', () => ({
  analyzeTransactionEmailWithAI: vi.fn(),
}))

vi.stubGlobal('fetch', mockRefreshFetch)

import handler from './auto-sync-gmail.js'

function makeRes() {
  let statusVal = 200
  let jsonVal: any = null
  const res = {
    status: (code: number) => {
      statusVal = code
      return { json: (data: any) => { jsonVal = data } }
    },
  } as unknown as VercelResponse
  return { res, getStatus: () => statusVal, getJson: () => jsonVal }
}

describe('api/auto-sync-gmail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    process.env.GOOGLE_CLIENT_ID = 'gcid'
    process.env.GOOGLE_CLIENT_SECRET = 'gcsecret'
    mockLogInsert.mockResolvedValue({ error: null })
    mockTokenDelete.mockResolvedValue({ error: null })
  })

  it('rejects requests without the correct cron secret', async () => {
    const req = { method: 'POST', headers: {} } as unknown as VercelRequest
    const { res, getStatus } = makeRes()
    await handler(req, res)
    expect(getStatus()).toBe(401)
  })

  it('skips ineligible users and syncs eligible ones', async () => {
    mockTokensSelect.mockResolvedValue({
      data: [
        { user_id: 'eligible-user', refresh_token: 'rt-1' },
        { user_id: 'free-user', refresh_token: 'rt-2' },
      ],
      error: null,
    })
    mockProfilesSelect.mockResolvedValue({
      data: [
        { id: 'eligible-user', email: 'x@y.com', subscription_status: 'active', subscription_expires_at: null },
        { id: 'free-user', email: 'a@b.com', subscription_status: 'free', subscription_expires_at: null },
      ],
      error: null,
    })
    mockRefreshFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-tok', expires_in: 3600 }),
    })
    mockScanRealGmailInbox.mockResolvedValue({
      data: { transactions: [{ id: 't1' }], log: {}, autoApprovedCount: 1 },
      error: null,
    })

    const req = { method: 'POST', headers: { authorization: 'Bearer test-secret' } } as unknown as VercelRequest
    const { res, getStatus, getJson } = makeRes()

    await handler(req, res)

    expect(getStatus()).toBe(200)
    expect(mockScanRealGmailInbox).toHaveBeenCalledTimes(1)
    expect(mockScanRealGmailInbox.mock.calls[0][0]).toMatchObject({ userId: 'eligible-user', accessToken: 'access-tok' })
    expect(getJson()).toMatchObject({ usersProcessed: 1, succeeded: 1, failed: 0 })
  })

  it('deletes the token and logs a failure when the refresh token is revoked', async () => {
    mockTokensSelect.mockResolvedValue({
      data: [{ user_id: 'revoked-user', refresh_token: 'dead-rt' }],
      error: null,
    })
    mockProfilesSelect.mockResolvedValue({
      data: [{ id: 'revoked-user', email: 'z@z.com', subscription_status: 'active', subscription_expires_at: null }],
      error: null,
    })
    mockRefreshFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_grant' }),
    })

    const req = { method: 'POST', headers: { authorization: 'Bearer test-secret' } } as unknown as VercelRequest
    const { res, getJson } = makeRes()

    await handler(req, res)

    expect(mockTokenDelete).toHaveBeenCalledWith('user_id', 'revoked-user')
    expect(mockLogInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'revoked-user', status: 'failed' }))
    expect(mockScanRealGmailInbox).not.toHaveBeenCalled()
    expect(getJson()).toMatchObject({ usersProcessed: 1, succeeded: 0, failed: 1 })
  })

  it('counts a scan error as a failure without logging a duplicate row (scanRealGmailInbox already logged it)', async () => {
    mockTokensSelect.mockResolvedValue({
      data: [{ user_id: 'errored-user', refresh_token: 'rt-3' }],
      error: null,
    })
    mockProfilesSelect.mockResolvedValue({
      data: [{ id: 'errored-user', email: 'e@e.com', subscription_status: 'active', subscription_expires_at: null }],
      error: null,
    })
    mockRefreshFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-tok', expires_in: 3600 }),
    })
    mockScanRealGmailInbox.mockResolvedValue({
      data: null,
      error: new Error('token expired mid-scan'),
    })

    const req = { method: 'POST', headers: { authorization: 'Bearer test-secret' } } as unknown as VercelRequest
    const { res, getJson } = makeRes()

    await handler(req, res)

    expect(mockScanRealGmailInbox).toHaveBeenCalledTimes(1)
    expect(mockLogInsert).not.toHaveBeenCalled()
    expect(getJson()).toMatchObject({ usersProcessed: 1, succeeded: 0, failed: 1 })
  })
})
