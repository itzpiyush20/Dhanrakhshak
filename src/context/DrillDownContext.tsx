// src/context/DrillDownContext.tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface DrillDownFilter {
  category?: string
  type?: 'debit' | 'credit'
  /** YYYY-MM-DD. Takes precedence over `month` when both are set — matches getTransactions()'s own precedence in src/services/transactions.ts. */
  dateFrom?: string
  /** YYYY-MM-DD */
  dateTo?: string
  /** YYYY-MM — ignored if dateFrom/dateTo are given */
  month?: string
}

/** Pure filter matcher, shared by any drill-down-capable chart. Matches on category (if given), then either an explicit date range or a month prefix (if given) — never both. */
export function filterTransactionsForDrillDown<T extends { category: string; date: string }>(
  transactions: T[],
  filter: DrillDownFilter
): T[] {
  return transactions.filter((t) => {
    if (filter.category && t.category !== filter.category) return false
    if (filter.dateFrom || filter.dateTo) {
      if (filter.dateFrom && t.date < filter.dateFrom) return false
      if (filter.dateTo && t.date > filter.dateTo) return false
    } else if (filter.month) {
      if (t.date.substring(0, 7) !== filter.month) return false
    }
    return true
  })
}

interface DrillDownState {
  isOpen: boolean
  filter: DrillDownFilter | null
  label: string
}

interface DrillDownContextValue extends DrillDownState {
  openDrillDown: (filter: DrillDownFilter, label: string) => void
  closeDrillDown: (dirty: boolean) => void
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null)

interface DrillDownProviderProps {
  children: ReactNode
  /** Called once when the overlay closes after at least one edit was saved inside it — the page should re-fetch its chart data. */
  onDirtyClose: () => void
}

export function DrillDownProvider({ children, onDirtyClose }: DrillDownProviderProps) {
  const [state, setState] = useState<DrillDownState>({ isOpen: false, filter: null, label: '' })

  const openDrillDown = useCallback((filter: DrillDownFilter, label: string) => {
    setState({ isOpen: true, filter, label })
  }, [])

  const closeDrillDown = useCallback((dirty: boolean) => {
    setState((prev) => ({ ...prev, isOpen: false }))
    if (dirty) onDirtyClose()
  }, [onDirtyClose])

  return (
    <DrillDownContext.Provider value={{ ...state, openDrillDown, closeDrillDown }}>
      {children}
    </DrillDownContext.Provider>
  )
}

export function useDrillDown(): DrillDownContextValue {
  const ctx = useContext(DrillDownContext)
  if (!ctx) throw new Error('useDrillDown must be used within a DrillDownProvider')
  return ctx
}
