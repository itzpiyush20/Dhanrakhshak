// ============================================
// Sandbox Seeder Service — Demo Data Generator
// Seeds cohesive financial records for evaluation
// ============================================

import { supabase } from './supabase'
import { getCurrentMonth } from '@/utils'
import type { Database } from '@/types/database'

type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
type BudgetInsert = Database['public']['Tables']['budgets']['Insert']
type EmailScanLogInsert = Database['public']['Tables']['email_scan_logs']['Insert']

/** Seeds high-fidelity financial datasets for the authenticated user */
export async function seedSandboxData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Error('User not authenticated') }

  // 1. Get dates context
  const curMonth = getCurrentMonth() // YYYY-MM
  const [year, mon] = curMonth.split('-').map(Number)
  
  // Calculate previous month YYYY-MM
  const prevDate = new Date(year, mon - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const todayStr = new Date().toISOString().split('T')[0]
  const prevMonthDateStr = new Date(year, mon - 2, 15).toISOString().split('T')[0]

  // ==========================================
  // A. PREPARE BUDGETS
  // ==========================================
  const budgets: BudgetInsert[] = [
    { user_id: user.id, category: 'food', amount: 8000, month: curMonth },
    { user_id: user.id, category: 'shopping', amount: 5000, month: curMonth },
    { user_id: user.id, category: 'utilities', amount: 4000, month: curMonth },
  ]

  // ==========================================
  // B. PREPARE TRANSACTIONS (APPROVED)
  // ==========================================
  const transactions: TransactionInsert[] = [
    // Current Month — Credits
    {
      user_id: user.id,
      amount: 75000,
      type: 'credit',
      category: 'salary',
      description: 'Monthly Corporate Salary',
      date: `${curMonth}-01`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 12500,
      type: 'credit',
      category: 'freelance',
      description: 'UI Design Freelance Milestone',
      date: `${curMonth}-15`,
      source: 'manual',
      approval_status: 'approved',
    },
    // Current Month — Debits (Discretionary & Fixed)
    {
      user_id: user.id,
      amount: 18000,
      type: 'debit',
      category: 'rent',
      description: 'House Rent Outflow',
      date: `${curMonth}-02`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 3450,
      type: 'debit',
      category: 'food',
      description: 'Swiggy Gourmet Dinner & Catering',
      date: `${curMonth}-05`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 2100,
      type: 'debit',
      category: 'groceries',
      description: 'Weekly Organic Groceries Buy',
      date: `${curMonth}-08`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 4999,
      type: 'debit',
      category: 'shopping',
      description: 'Winter Jacket Checkout',
      date: `${curMonth}-12`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 3150,
      type: 'debit',
      category: 'utilities',
      description: 'Electricity & Gas Broadband Bill',
      date: `${curMonth}-18`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 980,
      type: 'debit',
      category: 'transport',
      description: 'Uber Premium Airport Outflow',
      date: `${curMonth}-20`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 1200,
      type: 'debit',
      category: 'entertainment',
      description: 'Cinema Premium Tickets & Lounge',
      date: `${curMonth}-22`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 399,
      type: 'debit',
      category: 'subscriptions',
      description: 'Netflix Premium Auto-Debit',
      date: `${curMonth}-25`,
      source: 'manual',
      approval_status: 'approved',
    },

    // Previous Month — Baseline (MoM comparison)
    {
      user_id: user.id,
      amount: 75000,
      type: 'credit',
      category: 'salary',
      description: 'Monthly Corporate Salary',
      date: `${prevMonth}-01`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 18000,
      type: 'debit',
      category: 'rent',
      description: 'House Rent Outflow',
      date: `${prevMonth}-02`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 4200,
      type: 'debit',
      category: 'food',
      description: 'Restaurant Dinings Out',
      date: `${prevMonth}-10`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 1950,
      type: 'debit',
      category: 'groceries',
      description: 'Groceries Store Buy',
      date: `${prevMonth}-15`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 2500,
      type: 'debit',
      category: 'shopping',
      description: 'Casual Wear Outflow',
      date: `${prevMonth}-20`,
      source: 'manual',
      approval_status: 'approved',
    },
    {
      user_id: user.id,
      amount: 3050,
      type: 'debit',
      category: 'utilities',
      description: 'Electricity & Broadband Bill',
      date: `${prevMonth}-25`,
      source: 'manual',
      approval_status: 'approved',
    },
  ]

  // ==========================================
  // C. PREPARE PENDING ALERTS
  // ==========================================
  const pendingTxns: TransactionInsert[] = [
    {
      user_id: user.id,
      amount: 450,
      type: 'debit',
      category: 'food',
      merchant: 'Zomato Outflow',
      description: 'UPI: Zomato Order Checkout',
      notes: 'Dear Customer, your Account xx4321 was debited for Rs 450.00 on 29-May-2026 by UPI Ref 91028304 to ZOMATO.',
      date: todayStr,
      source: 'email',
      approval_status: 'pending',
    },
    {
      user_id: user.id,
      amount: 120,
      type: 'debit',
      category: 'transport',
      merchant: 'Uber Rides',
      description: 'UPI: Uber ride payment',
      notes: 'Transaction Alert: Your Account xx4321 was debited with INR 120.00 on 29-May-2026 for a UPI txn to UBER RIDES. Ref 60192837.',
      date: todayStr,
      source: 'email',
      approval_status: 'pending',
    },
  ]

  // ==========================================
  // D. PREPARE EMAIL SCAN LOGS
  // ==========================================
  const scanLogs: EmailScanLogInsert[] = [
    {
      user_id: user.id,
      emails_processed: 24,
      transactions_found: 2,
      status: 'success',
    },
  ]

  // ==========================================
  // EXECUTE SEEDING IN TRANSACTION SEQUENCES
  // ==========================================
  try {
    // 1. Insert budgets (clean up any previous to avoid constraint errors)
    await supabase.from('budgets').delete().eq('user_id', user.id)
    const { error: bErr } = await supabase.from('budgets').insert(budgets)
    if (bErr) throw bErr

    // 2. Insert approved & pending transactions (clean up previous)
    await supabase.from('transactions').delete().eq('user_id', user.id)
    const { error: tErr } = await supabase.from('transactions').insert([...transactions, ...pendingTxns])
    if (tErr) throw tErr

    // 3. Insert scan logs (clean up previous)
    await supabase.from('email_scan_logs').delete().eq('user_id', user.id)
    const { error: lErr } = await supabase.from('email_scan_logs').insert(scanLogs)
    if (lErr) throw lErr

    return { error: null }
  } catch (err: any) {
    console.error('Error seeding sandbox data:', err)
    return { error: err }
  }
}
