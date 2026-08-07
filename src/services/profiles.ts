// ============================================
// Profile Service — User & Account Configuration
// Handles user profile updates and account data purges
// ============================================

import { supabase } from './supabase'
import { disconnectGmail } from './googleAuth'
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
  const { error: authErr } = await supabase.auth.updateUser({
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

/** 
 * Irreversibly deletes the authenticated user's account and all connected records.
 * Uses high-privilege delete_user RPC cascade when available; falls back to an
 * explicit complete table wipe + profiles deletion if the database function is missing.
 */
export async function deleteAccount(): Promise<{ error: Error | null; success: boolean; method: 'rpc' | 'purge' }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Error('User not authenticated'), success: false, method: 'purge' }

  // 0. Revoke the Google grant before the account goes away. Deleting the row
  // alone would leave a live grant sitting in the user's Google account with
  // nothing left here to revoke it from. Best-effort: a revoke failure must
  // never block erasure, which is the user's actual right.
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const { error: revokeError } = await disconnectGmail(session.access_token)
    if (revokeError) {
      console.warn('deleteAccount: Gmail revoke failed, continuing with deletion:', revokeError)
    }
  }

  // 1. Try to invoke the postgres superuser-level RPC cascade
  try {
    const { error: rpcErr } = await supabase.rpc('delete_user')
    if (!rpcErr) {
      // Deletion succeeded completely! DB triggers handles cleanup cascade.
      return { error: null, success: true, method: 'rpc' }
    }
    console.warn('Supabase delete_user RPC failed, running fallback purge:', rpcErr)
  } catch (e: any) {
    console.warn('Supabase delete_user RPC call triggered error, running fallback purge:', e)
  }

  // 2. Fallback Purge Action
  // Purge all transactions, budgets, and email logs
  const wipeErr = await resetAccountData()
  if (wipeErr) {
    const errorMsg = 'message' in wipeErr 
      ? (wipeErr as any).message 
      : 'error' in wipeErr && (wipeErr as any).error instanceof Error
        ? (wipeErr as any).error.message 
        : 'Failed to purge account logs during fallback wipe.'
    return { error: new Error(errorMsg), success: false, method: 'purge' }
  }

  // Try to delete their public profile row
  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id)

  if (profileErr) {
    // Report this as a failure. Returning success here told the user their
    // account was gone while their profile row (and auth login) survived —
    // the one outcome an erasure request must never report as done.
    return {
      error: new Error(
        'Your transaction data was erased, but the account itself could not be deleted. ' +
        'Please contact support so we can complete the deletion.'
      ),
      success: false,
      method: 'purge',
    }
  }

  return { error: null, success: true, method: 'purge' }
}

