// src/context/DrillDownContext.test.ts
import { describe, it, expect } from 'vitest'
import { filterTransactionsForDrillDown, type DrillDownFilter } from './DrillDownContext'

interface Txn {
  id: string
  category: string
  date: string
}

const txns: Txn[] = [
  { id: '1', category: 'Food & Dining', date: '2026-08-05' },
  { id: '2', category: 'Food & Dining', date: '2026-07-20' },
  { id: '3', category: 'Groceries', date: '2026-08-05' },
  { id: '4', category: 'Food & Dining', date: '2026-08-10' },
]

describe('filterTransactionsForDrillDown', () => {
  it('filters by category and an explicit date range', () => {
    const filter: DrillDownFilter = { category: 'Food & Dining', dateFrom: '2026-08-01', dateTo: '2026-08-31' }
    const result = filterTransactionsForDrillDown(txns, filter)
    expect(result.map((t) => t.id)).toEqual(['1', '4'])
  })

  it('filters by category and a month prefix', () => {
    const filter: DrillDownFilter = { category: 'Food & Dining', month: '2026-07' }
    const result = filterTransactionsForDrillDown(txns, filter)
    expect(result.map((t) => t.id)).toEqual(['2'])
  })

  it('dateFrom/dateTo take precedence over month when both are given', () => {
    const filter: DrillDownFilter = { category: 'Food & Dining', month: '2026-07', dateFrom: '2026-08-01', dateTo: '2026-08-31' }
    const result = filterTransactionsForDrillDown(txns, filter)
    expect(result.map((t) => t.id)).toEqual(['1', '4'])
  })

  it('filters by category alone when no date constraint is given', () => {
    const filter: DrillDownFilter = { category: 'Groceries' }
    const result = filterTransactionsForDrillDown(txns, filter)
    expect(result.map((t) => t.id)).toEqual(['3'])
  })

  it('returns an empty array when nothing matches', () => {
    const filter: DrillDownFilter = { category: 'Travel' }
    expect(filterTransactionsForDrillDown(txns, filter)).toEqual([])
  })
})
