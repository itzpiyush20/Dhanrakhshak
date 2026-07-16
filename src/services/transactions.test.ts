import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockQueryResult = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockEqUpdate = vi.fn()

// A reusable chainable query-builder mock. Every intermediate method
// (.select()/.eq()/.order()) returns the SAME chain object, so any number
// of chained .eq() calls works — real code chains a different number of
// .eq()s per query (getLoggingStreak: 2, getActiveReceivables: 3,
// settleReceivable's fetch-by-id: 1) and hand-nesting to a fixed depth
// breaks whichever query doesn't match that exact depth. Only the
// terminal methods (.gte/.lte/.single/.order) resolve to a value.
function makeChain(table: string) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: (...args: any[]) => mockQueryResult(...args),
    lte: (...args: any[]) => mockQueryResult(...args),
    single: (...args: any[]) => mockSingle(...args),
  }
  return chain
}

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: (table: string) => ({
      select: () => makeChain(table),
      insert: (...args: any[]) => {
        mockInsert(table, ...args)
        return { select: () => ({ single: (...a: any[]) => mockSingle(...a) }) }
      },
      update: (...args: any[]) => ({
        eq: (...a: any[]) => mockEqUpdate(table, ...args, ...a),
      }),
    }),
  },
}))

import { getLoggingStreak, getActiveReceivables, settleReceivable } from './transactions'

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockQueryResult.mockReset()
  mockSingle.mockReset()
  mockInsert.mockReset()
  mockEqUpdate.mockReset()
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

describe('getActiveReceivables', () => {
  it('includes a receivable due this month', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQueryResult.mockResolvedValue({
      data: [{ id: 't1', counterparty: 'Rahul', amount: 500, expected_return_date: '2026-07-20', notes: 'lunch split' }],
      error: null,
    })
    const { data } = await getActiveReceivables()
    expect(data).toHaveLength(1)
    expect(data![0].counterparty).toBe('Rahul')
  })

  it('returns empty when nothing is pending', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQueryResult.mockResolvedValue({ data: [], error: null })
    const { data } = await getActiveReceivables()
    expect(data).toEqual([])
  })
})

describe('settleReceivable', () => {
  it('creates a credit transaction and marks the receivable received', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const original = {
      id: 't1',
      user_id: 'u1',
      amount: 500,
      category: 'food',
      counterparty: 'Rahul',
    }
    mockSingle.mockResolvedValueOnce({ data: original, error: null }) // fetch original
    mockSingle.mockResolvedValueOnce({ data: { id: 't2' }, error: null }) // insert credit
    mockEqUpdate.mockResolvedValueOnce({ error: null }) // update original

    const { error } = await settleReceivable('t1')
    expect(error).toBeNull()
  })

  it('returns an error if the original transaction is not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    const { error } = await settleReceivable('missing')
    expect(error).not.toBeNull()
  })

  it('propagates the error if creating the credit transaction fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const original = {
      id: 't1',
      user_id: 'u1',
      amount: 500,
      category: 'food',
      counterparty: 'Rahul',
    }
    const insertError = { message: 'insert failed' }
    mockSingle.mockResolvedValueOnce({ data: original, error: null }) // fetch original
    mockSingle.mockResolvedValueOnce({ data: null, error: insertError }) // insert credit fails

    const { data, error } = await settleReceivable('t1')
    expect(data).toBeNull()
    expect(error).toBe(insertError)
  })

  it('propagates the error if marking the original as received fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const original = {
      id: 't1',
      user_id: 'u1',
      amount: 500,
      category: 'food',
      counterparty: 'Rahul',
    }
    const updateError = { message: 'update failed' }
    mockSingle.mockResolvedValueOnce({ data: original, error: null }) // fetch original
    mockSingle.mockResolvedValueOnce({ data: { id: 't2' }, error: null }) // insert credit
    mockEqUpdate.mockResolvedValueOnce({ error: updateError }) // update original fails

    const { data, error } = await settleReceivable('t1')
    expect(data).toBeNull()
    expect(error).toBe(updateError)
  })
})
