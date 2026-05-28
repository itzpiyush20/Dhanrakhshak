// ============================================
// Budget Service — CRUD operations
// All Supabase calls for budgets
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type BudgetRow = Database['public']['Tables']['budgets']['Row']
type BudgetInsert = Database['public']['Tables']['budgets']['Insert']

/** Fetch budgets for current user for a specific month */
export async function getBudgets(month: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id)
    .eq('month', month)
    .order('created_at', { ascending: false })

  return { data: data as BudgetRow[] | null, error }
}

/** Set or update a budget for a category in a month */
export async function upsertBudget(category: string, amount: number, month: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: user.id,
        category,
        amount,
        month,
      },
      { onConflict: 'user_id,category,month' }
    )
    .select()
    .single()

  return { data: data as BudgetRow | null, error }
}

/** Delete a budget limit */
export async function deleteBudget(id: string) {
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)

  return { error }
}
