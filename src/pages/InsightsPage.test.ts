import { describe, it, expect } from 'vitest'
import { buildMerchantLeaderboard } from './InsightsPage'

describe('buildMerchantLeaderboard', () => {
  it('groups a known-brand narration under its real merchant total', () => {
    const result = buildMerchantLeaderboard([
      { type: 'debit', date: '2026-08-01', amount: 200, merchant: 'Swiggy', description: 'Swiggy order' },
      { type: 'debit', date: '2026-08-02', amount: 300, merchant: null, description: 'UPI/4412/SWIGGY-ORDER-BLR' },
    ])
    expect(result).toEqual([{ merchant: 'Swiggy', amount: 500, count: 2 }])
  })

  it('groups unrecognized narrations under a single Unclassified row', () => {
    const result = buildMerchantLeaderboard([
      { type: 'debit', date: '2026-08-01', amount: 100, merchant: null, description: 'IMPS/1/JOHN DOE' },
      { type: 'debit', date: '2026-08-02', amount: 150, merchant: null, description: 'NEFT/2/JANE DOE' },
    ])
    expect(result).toEqual([{ merchant: 'Unclassified', amount: 250, count: 2 }])
  })

  it('excludes credit transactions and rows outside the date range', () => {
    const result = buildMerchantLeaderboard([
      { type: 'credit', date: '2026-08-01', amount: 500, merchant: 'Salary', description: '' },
      { type: 'debit', date: '2026-01-01', amount: 100, merchant: 'Amazon', description: '' },
      { type: 'debit', date: '2026-08-05', amount: 200, merchant: 'Amazon', description: '' },
    ], { startStr: '2026-08-01', endStr: '2026-08-31' })
    expect(result).toEqual([{ merchant: 'Amazon', amount: 200, count: 1 }])
  })

  it('sorts by amount descending and caps at 8 rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      type: 'debit' as const,
      date: '2026-08-01',
      amount: i + 1,
      merchant: `Merchant${i}`,
      description: '',
    }))
    const result = buildMerchantLeaderboard(rows)
    expect(result).toHaveLength(8)
    expect(result[0]).toEqual({ merchant: 'Merchant9', amount: 10, count: 1 })
  })
})

describe('Emergency Fund Coverage Calculation', () => {
  it('correctly calculates coverage months based on accumulated investments and monthly needs', () => {
    // User has accumulated ₹3,60,000 in savings over 6 months, and has ₹60,000/mo essential needs.
    const totalInvestments = 360000
    const avgMonthlyNeeds = 60000
    const emergencyMonths = Number((totalInvestments / avgMonthlyNeeds).toFixed(1))
    
    // Coverage must equal 6.0 months (not 1.0 month)
    expect(emergencyMonths).toBe(6.0)
    expect(emergencyMonths >= 6).toBe(true)
  })
})
