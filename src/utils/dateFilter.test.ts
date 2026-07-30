import { describe, it, expect } from 'vitest'
import { resolveDateFilter, getMonthsInRange, formatDateFilterLabel } from './dateFilter'

describe('resolveDateFilter', () => {
  it('resolves a month filter to that month\'s first and last day', () => {
    expect(resolveDateFilter({ mode: 'month', month: '2026-07' }))
      .toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })
  })

  it('handles a 30-day month', () => {
    expect(resolveDateFilter({ mode: 'month', month: '2026-04' }))
      .toEqual({ dateFrom: '2026-04-01', dateTo: '2026-04-30' })
  })

  it('handles a non-leap February', () => {
    expect(resolveDateFilter({ mode: 'month', month: '2026-02' }))
      .toEqual({ dateFrom: '2026-02-01', dateTo: '2026-02-28' })
  })

  it('handles a leap-year February', () => {
    expect(resolveDateFilter({ mode: 'month', month: '2028-02' }))
      .toEqual({ dateFrom: '2028-02-01', dateTo: '2028-02-29' })
  })

  it('handles December without rolling into next year', () => {
    expect(resolveDateFilter({ mode: 'month', month: '2025-12' }))
      .toEqual({ dateFrom: '2025-12-01', dateTo: '2025-12-31' })
  })

  it('passes a custom range straight through', () => {
    expect(resolveDateFilter({ mode: 'custom', from: '2026-06-15', to: '2026-07-02' }))
      .toEqual({ dateFrom: '2026-06-15', dateTo: '2026-07-02' })
  })
})

describe('getMonthsInRange', () => {
  it('returns a single month when the range stays within it', () => {
    expect(getMonthsInRange('2026-07-05', '2026-07-20')).toEqual(['2026-07'])
  })

  it('returns every month touched, including both endpoints', () => {
    expect(getMonthsInRange('2026-06-20', '2026-08-05')).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('handles a range spanning a year boundary', () => {
    expect(getMonthsInRange('2025-11-20', '2026-02-05')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('formatDateFilterLabel', () => {
  it('formats a month filter as a full month name and year', () => {
    expect(formatDateFilterLabel({ mode: 'month', month: '2026-07' })).toBe('July 2026')
  })

  it('formats a custom range as short from/to dates', () => {
    expect(formatDateFilterLabel({ mode: 'custom', from: '2026-07-01', to: '2026-07-20' }))
      .toBe('1 Jul 2026 – 20 Jul 2026')
  })
})
