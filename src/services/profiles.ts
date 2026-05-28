// ============================================
// Profile Service — User & Account Configuration
// Handles user profile updates and account data purges
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

/** Fetch active user profile from profiles table */
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { data: data as ProfileRow | null, error }
}

/** Update profile row and auth user metadata synchronously */
export async function updateProfile(updates: { fullName: string; avatarUrl?: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // 1. Update public.profiles row
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      full_name: updates.fullName,
      avatar_url: updates.avatarUrl || null,
    })
    .eq('id', user.id)

  if (profileErr) return { data: null, error: profileErr }

  // 2. Update auth metadata so useAuth() context gets instant refresh
  const { data: authUser, error: authErr } = await supabase.auth.updateUser({
    data: {
      full_name: updates.fullName,
      avatar_url: updates.avatarUrl || null,
    },
  })

  if (authErr) return { data: null, error: authErr }

  const { data: updatedProfile, error: getErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { data: updatedProfile as ProfileRow | null, error: getErr }
}

/** Cleanly purges all user transactions, budgets, and email scan logs (Dangerous Zone) */
export async function resetAccountData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Error('User not authenticated') }

  // 1. Delete all transactions
  const { error: txnErr } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', user.id)

  if (txnErr) return txnErr

  // 2. Delete all budgets
  const { error: budgetErr } = await supabase
    .from('budgets')
    .delete()
    .eq('user_id', user.id)

  if (budgetErr) return budgetErr

  // 3. Delete all email scan logs
  const { error: logErr } = await supabase
    .from('email_scan_logs')
    .delete()
    .eq('user_id', user.id)

  return logErr
}
