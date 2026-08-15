import { describe, it, expect } from 'vitest'
import { approximateMonthlyRevenue, scanSuccessRate, percentOf } from './adminMetrics'

describe('approximateMonthlyRevenue', () => {
  it('counts a monthly subscriber at the monthly price', () => {
    expect(approximateMonthlyRevenue(10, 0)).toBe(310)
  })

  it('spreads an annual subscription across twelve months', () => {
    // 365 / 12 = 30.4166..., rounded to 30.42 for one subscriber
    expect(approximateMonthlyRevenue(0, 1)).toBe(30.42)
  })

  it('adds both plan types together', () => {
    expect(approximateMonthlyRevenue(2, 3)).toBe(153.25)
  })

  it('returns zero when nobody is paying', () => {
    expect(approximateMonthlyRevenue(0, 0)).toBe(0)
  })
})

describe('scanSuccessRate', () => {
  it('counts partial scans as successful, since transactions were still found', () => {
    expect(scanSuccessRate({ succeeded: 7, partial: 1, failed: 2 })).toBe(80)
  })

  it('returns 100 when nothing failed', () => {
    expect(scanSuccessRate({ succeeded: 5, partial: 0, failed: 0 })).toBe(100)
  })

  // A fresh install has no scans. Zero divided by zero must not reach the UI.
  it('returns null when no scans have run at all', () => {
    expect(scanSuccessRate({ succeeded: 0, partial: 0, failed: 0 })).toBeNull()
  })
})

describe('percentOf', () => {
  it('computes a whole-number percentage', () => {
    expect(percentOf(25, 200)).toBe(13)
  })

  it('returns null rather than dividing by zero', () => {
    expect(percentOf(5, 0)).toBeNull()
  })
})
