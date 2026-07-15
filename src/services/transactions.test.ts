import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockQueryResult = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: (...args: any[]) => mockQueryResult(...args),
          }),
        }),
      }),
    }),
  },
}))

import { getLoggingStreak } from './transactions'

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockQueryResult.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('getLoggingStreak', () => {
  it('counts a streak of consecutive days ending today', async () => {
    mockQueryResult.mockResolvedValue({
      data: [
        { created_at: isoDaysAgo(0) },
        { created_at: isoDaysAgo(1) },
        { created_at: isoDaysAgo(2) },
      ],
      error: null,
    })
    const { data } = await getLoggingStreak()
    expect(data).toEqual({ streak: 3, loggedToday: true })
  })

  it('gives grace when nothing logged today yet but yesterday was logged', async () => {
    mockQueryResult.mockResolvedValue({
      data: [{ created_at: isoDaysAgo(1) }, { created_at: isoDaysAgo(2) }],
      error: null,
    })
    const { data } = await getLoggingStreak()
    expect(data).toEqual({ streak: 2, loggedToday: false })
  })

  it('resets to zero after a gap', async () => {
    mockQueryResult.mockResolvedValue({
      data: [{ created_at: isoDaysAgo(3) }, { created_at: isoDaysAgo(4) }],
      error: null,
    })
    const { data } = await getLoggingStreak()
    expect(data).toEqual({ streak: 0, loggedToday: false })
  })

  it('returns zero for a user with no transactions', async () => {
    mockQueryResult.mockResolvedValue({ data: [], error: null })
    const { data } = await getLoggingStreak()
    expect(data).toEqual({ streak: 0, loggedToday: false })
  })
})
