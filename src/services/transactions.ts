// ============================================
// Transaction Service — CRUD operations
// All Supabase calls for transactions
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
type TransactionUpdate = Database['public']['Tables']['transactions']['Update']

/** Fetch transactions for current user with filters */
export async function getTransactions(options?: {
  month?: string        // YYYY-MM
  type?: 'debit' | 'credit'
  category?: string
  status?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })

  if (options?.status) {
    query = query.eq('approval_status', options.status)
  } else {
    query = query.eq('approval_status', 'approved')
  }

  query = query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (options?.month) {
    const startDate = `${options.month}-01`
    const [year, mon] = options.month.split('-').map(Number)
    const endDate = new Date(year, mon, 0).toISOString().split('T')[0]
    query = query.gte('date', startDate).lte('date', endDate)
  }

  if (options?.type) {
    query = query.eq('type', options.type)
  }

  if (options?.category) {
    query = query.eq('category', options.category)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
  }

  const { data, error, count } = await query

  return { data: data as TransactionRow[] | null, error, count }
}

/** Create a new transaction */
export async function createTransaction(transaction: TransactionInsert) {
  const { data, error } = await supabase
    .from('transactions')
    .insert(transaction)
    .select()
    .single()

  return { data: data as TransactionRow | null, error }
}

/** Update an existing transaction */
export async function updateTransaction(id: string, updates: TransactionUpdate) {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  return { data: data as TransactionRow | null, error }
}

/** Delete a transaction */
export async function deleteTransaction(id: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)

  return { error }
}

/** Get monthly summary (income, expenses, savings) */
export async function getMonthlySummary(month: string) {
  const startDate = `${month}-01`
  const [year, mon] = month.split('-').map(Number)
  const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('approval_status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate)

  if (error || !data) return { data: null, error }

  const total_income = data
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const total_expenses = data
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  // Category breakdown for debits
  const categoryMap = new Map<string, { amount: number; count: number }>()
  data
    .filter((t) => t.type === 'debit')
    .forEach((t) => {
      const existing = categoryMap.get(t.category) || { amount: 0, count: 0 }
      categoryMap.set(t.category, {
        amount: existing.amount + Number(t.amount),
        count: existing.count + 1,
      })
    })

  const category_breakdown = Array.from(categoryMap.entries())
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      percentage: total_expenses > 0 ? (amount / total_expenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    data: {
      total_income,
      total_expenses,
      savings: total_income - total_expenses,
      category_breakdown,
    },
    error: null,
  }
}

/** Get historical monthly comparison for the last N months */
export async function getHistoricalAnalytics(monthsCount = 6) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // Generate target months list (e.g. ["2026-05", "2026-04", ...])
  const rawMonths: string[] = []
  const now = new Date()
  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    rawMonths.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const months = rawMonths

  // Get start date of the oldest month in the window
  const startDate = `${months[0]}-01`

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, date')
    .eq('user_id', user.id)
    .eq('approval_status', 'approved')
    .gte('date', startDate)

  if (error || !data) return { data: null, error }

  // Aggregate stats per month
  const monthlyData = months.map((m) => {
    const [year, mon] = m.split('-').map(Number)
    const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('en-IN', {
      month: 'short',
    })

    const monthTxns = data.filter((t) => t.date.startsWith(m))
    
    const income = monthTxns
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const expenses = monthTxns
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    return {
      month: m,
      label: `${monthLabel} ${String(year).substring(2)}`,
      income,
      expenses,
      savings: income - expenses,
    }
  })

  return { data: monthlyData, error: null }
}

/** Bulk delete transactions */
export async function bulkDeleteTransactions(ids: string[]) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .in('id', ids)

  return { error }
}

/** Bulk update transactions category */
export async function bulkUpdateTransactionsCategory(ids: string[], category: string) {
  const { error } = await supabase
    .from('transactions')
    .update({ category })
    .in('id', ids)

  return { error }
}

