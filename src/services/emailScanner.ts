// ============================================
// Email Scanner Service — Inbox Simulator
// Simulates bank alert email scanning & UPI parsing
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

const SIMULATED_ALERTS = [
  {
    amount: 180,
    type: 'debit' as const,
    category: 'food',
    merchant: 'Zomato / Swiggy',
    description: 'UPI: Swiggy order payment',
    notes: 'Dear Customer, your Account xx4321 was debited for Rs 180.00 on 29-May-2026 by UPI Ref 61829038 to SWIGGY.',
  },
  {
    amount: 999,
    type: 'debit' as const,
    category: 'utilities',
    merchant: 'Airtel Broadband',
    description: 'UPI: Monthly broadband bill',
    notes: 'Transaction Alert: Your Account xx4321 was debited with INR 999.00 on 29-May-2026 for a UPI txn to AIRTEL BILLS. Ref 71829304.',
  },
  {
    amount: 3500,
    type: 'debit' as const,
    category: 'shopping',
    merchant: 'Myntra Fashion',
    description: 'UPI: Shopping checkout',
    notes: 'ALERT: HDFC Bank A/c xx4321 has been debited for Rs 3500.00 on 29-May-2026 by UPI Ref 80192837 to MYNTRA.',
  },
]

/** Fetch recent scan logs */
export async function getScanLogs() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('email_scan_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false })
    .limit(5)

  return { data: data as EmailScanLog[] | null, error }
}

/** Simulate scanning gmail inbox for UPI alert emails */
export async function simulateInboxScan() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // Simulate parsing logic:
  // Randomly pick 1 to 3 items from our alerts list to simulate real inbox variance
  const countToImport = Math.floor(Math.random() * 3) + 1 // 1, 2 or 3
  const selectedAlerts = SIMULATED_ALERTS.slice(0, countToImport)

  const transactionsToInsert: TransactionInsert[] = selectedAlerts.map((alert) => ({
    user_id: user.id,
    amount: alert.amount,
    type: alert.type,
    category: alert.category,
    merchant: alert.merchant,
    description: alert.description,
    notes: alert.notes,
    date: new Date().toISOString().split('T')[0],
    source: 'email',
    approval_status: 'pending',
  }))

  // 1. Insert simulated pending transactions
  const { data: insertedTxns, error: txnError } = await supabase
    .from('transactions')
    .insert(transactionsToInsert)
    .select()

  if (txnError) return { data: null, error: txnError }

  // 2. Create the email scan log record
  const { data: scanLog, error: logError } = await supabase
    .from('email_scan_logs')
    .insert({
      user_id: user.id,
      emails_processed: Math.floor(Math.random() * 20) + 10, // 10 to 30 emails scanned
      transactions_found: countToImport,
      status: 'success',
    })
    .select()
    .single()

  if (logError) return { data: null, error: logError }

  return {
    data: {
      transactions: insertedTxns,
      log: scanLog as EmailScanLog,
    },
    error: null,
  }
}
