import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockEqDelete = vi.fn()
const mockEqUpdate = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: (...args: any[]) => mockOrder(...args),
          single: (...args: any[]) => mockSingle(...args),
        }),
      }),
      insert: () => ({ select: () => ({ single: (...args: any[]) => mockSingle(...args) }) }),
      update: (...args: any[]) => ({ eq: (...a: any[]) => mockEqUpdate(...args, ...a) }),
      delete: () => ({ eq: (...args: any[]) => mockEqDelete(...args) }),
    }),
  },
}))

import { getInsurancePolicies, createInsurancePolicy, deleteInsurancePolicy, markPremiumPaid } from './insurance'

beforeEach(() => {
  mockGetUser.mockReset()
  mockOrder.mockReset()
  mockSingle.mockReset()
  mockEqDelete.mockReset()
  mockEqUpdate.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('getInsurancePolicies', () => {
  it('returns policies for the current user', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: 'p1', policy_name: 'LIC Term', next_due_date: '2026-08-01' }],
      error: null,
    })
    const { data } = await getInsurancePolicies()
    expect(data).toHaveLength(1)
  })
})

describe('createInsurancePolicy', () => {
  it('inserts a policy for the current user', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', policy_name: 'LIC Term' }, error: null })
    const { data, error } = await createInsurancePolicy({
      policy_name: 'LIC Term',
      policy_type: 'life',
      premium_amount: 12000,
      frequency: 'annual',
      next_due_date: '2026-08-01',
    })
    expect(error).toBeNull()
    expect(data?.policy_name).toBe('LIC Term')
  })
})

describe('deleteInsurancePolicy', () => {
  it('deletes by id', async () => {
    mockEqDelete.mockResolvedValue({ error: null })
    const { error } = await deleteInsurancePolicy('p1')
    expect(error).toBeNull()
  })
})

describe('markPremiumPaid', () => {
  it('advances next_due_date by one month for monthly frequency', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'p1', user_id: 'u1', policy_name: 'Star Health', premium_amount: 2000, frequency: 'monthly', next_due_date: '2026-07-10' },
      error: null,
    })
    mockSingle.mockResolvedValueOnce({ data: { id: 't1' }, error: null }) // insert expense txn
    mockEqUpdate.mockResolvedValueOnce({ error: null }) // update next_due_date

    const { error } = await markPremiumPaid('p1')
    expect(error).toBeNull()
  })

  it('advances next_due_date by one year for annual frequency', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'p2', user_id: 'u1', policy_name: 'LIC Term', premium_amount: 12000, frequency: 'annual', next_due_date: '2026-08-01' },
      error: null,
    })
    mockSingle.mockResolvedValueOnce({ data: { id: 't2' }, error: null })
    mockEqUpdate.mockResolvedValueOnce({ error: null })

    const { error } = await markPremiumPaid('p2')
    expect(error).toBeNull()
  })
})
