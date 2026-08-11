import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const { mockProfileSelect, mockProfileUpdate, mockGetUser, mockGeminiFetch } = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'fake-key'
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role'
  return {
    mockProfileSelect: vi.fn(),
    mockProfileUpdate: vi.fn(),
    mockGetUser: vi.fn(),
    mockGeminiFetch: vi.fn(),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: mockProfileSelect }) }),
          update: (payload: any) => ({ eq: (_col: string, _val: string) => { mockProfileUpdate(payload); return Promise.resolve({ error: null }) } }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.stubGlobal('fetch', mockGeminiFetch)

import handler from './gemini-proxy'

function makeReqRes(body: any) {
  const req = {
    method: 'POST',
    headers: { origin: 'https://dhanrakshak-five.vercel.app', authorization: 'Bearer fake-jwt' },
    body,
  } as unknown as VercelRequest

  let statusVal = 200
  let jsonVal: any = null
  const res = {
    setHeader: () => {},
    status: (code: number) => { statusVal = code; return { json: (data: any) => { jsonVal = data }, end: () => {} } },
  } as unknown as VercelResponse

  return { req, res, getStatus: () => statusVal, getJson: () => jsonVal }
}

describe('api/gemini-proxy — purpose-aware quota split', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockGeminiFetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) })
  })

  it('increments ai_scan_calls_count for purpose: "scan", leaving ai_calls_count untouched', async () => {
    mockProfileSelect.mockResolvedValue({
      data: { ai_calls_count: 10, ai_calls_reset_at: new Date().toISOString(), ai_scan_calls_count: 3, ai_scan_calls_reset_at: new Date().toISOString() },
      error: null,
    })

    const { req, res, getStatus } = makeReqRes({ contents: [{ parts: [{ text: 'x' }] }], purpose: 'scan' })
    await handler(req, res)

    expect(getStatus()).toBe(200)
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = mockProfileUpdate.mock.calls[0][0]
    expect(updatePayload.ai_scan_calls_count).toBe(4)
    expect(updatePayload.ai_calls_count).toBeUndefined()
  })

  it('increments ai_calls_count for purpose: "insights" (or omitted), leaving ai_scan_calls_count untouched', async () => {
    mockProfileSelect.mockResolvedValue({
      data: { ai_calls_count: 10, ai_calls_reset_at: new Date().toISOString(), ai_scan_calls_count: 3, ai_scan_calls_reset_at: new Date().toISOString() },
      error: null,
    })

    const { req, res, getStatus } = makeReqRes({ contents: [{ parts: [{ text: 'x' }] }] })
    await handler(req, res)

    expect(getStatus()).toBe(200)
    const updatePayload = mockProfileUpdate.mock.calls[0][0]
    expect(updatePayload.ai_calls_count).toBe(11)
    expect(updatePayload.ai_scan_calls_count).toBeUndefined()
  })

  it('rejects a scan request at its own 500-call limit even when insights quota has headroom', async () => {
    mockProfileSelect.mockResolvedValue({
      data: { ai_calls_count: 0, ai_calls_reset_at: new Date().toISOString(), ai_scan_calls_count: 500, ai_scan_calls_reset_at: new Date().toISOString() },
      error: null,
    })

    const { req, res, getStatus } = makeReqRes({ contents: [{ parts: [{ text: 'x' }] }], purpose: 'scan' })
    await handler(req, res)

    expect(getStatus()).toBe(429)
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })
})
