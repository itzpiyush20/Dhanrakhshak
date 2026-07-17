// ============================================
// Insurance Policy Service — CRUD + due-date logic
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type PolicyRow = Database['public']['Tables']['insurance_policies']['Row']
type PolicyInsert = Database['public']['Tables']['insurance_policies']['Insert']

/** Fetch all insurance policies for the current user, soonest due first */
export async function getInsurancePolicies() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('user_id', user.id)
    .order('next_due_date', { ascending: true })

  return { data: data as PolicyRow[] | null, error }
}

/** Create a new insurance policy */
export async function createInsurancePolicy(policy: Omit<PolicyInsert, 'user_id'>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('insurance_policies')
    .insert({ ...policy, user_id: user.id })
    .select()
    .single()

  return { data: data as PolicyRow | null, error }
}

/** Delete an insurance policy */
export async function deleteInsurancePolicy(id: string) {
  const { error } = await supabase
    .from('insurance_policies')
    .delete()
    .eq('id', id)

  return { error }
}

function advanceDueDate(dueDate: string, frequency: PolicyRow['frequency']): string {
  const d = new Date(dueDate)
  switch (frequency) {
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'quarterly':
      d.setMonth(d.getMonth() + 3)
      break
    case 'half_yearly':
      d.setMonth(d.getMonth() + 6)
      break
    case 'annual':
      d.setFullYear(d.getFullYear() + 1)
      break
  }
  return d.toISOString().split('T')[0]
}

/** Marks a premium paid: logs the expense and advances the policy's next due date */
export async function markPremiumPaid(policyId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data: policy, error: fetchError } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('id', policyId)
    .single()

  if (fetchError || !policy) {
    return { data: null, error: fetchError || new Error('Policy not found') }
  }

  const { data: txn, error: insertError } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      type: 'debit',
      amount: policy.premium_amount,
      category: 'insurance',
      description: `${policy.policy_name} premium`,
      date: new Date().toISOString().split('T')[0],
      source: 'manual',
      approval_status: 'approved',
    })
    .select()
    .single()

  if (insertError || !txn) {
    return { data: null, error: insertError || new Error('Failed to log premium payment') }
  }

  const nextDueDate = advanceDueDate(policy.next_due_date, policy.frequency)
  const { error: updateError } = await supabase
    .from('insurance_policies')
    .update({ next_due_date: nextDueDate })
    .eq('id', policyId)

  return { data: { nextDueDate }, error: updateError || null }
}
