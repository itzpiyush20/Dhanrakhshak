// ============================================
// Dhanrakshak — Core Type Definitions
// ============================================

/** Transaction type — debit (expense) or credit (income) */
export type TransactionType = 'debit' | 'credit'

/** Status of an auto-extracted transaction */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

/** Expense categories — extensible list for Indian users */
export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'utilities'
  | 'rent'
  | 'health'
  | 'entertainment'
  | 'education'
  | 'travel'
  | 'subscriptions'
  | 'transfers'
  | 'salary'
  | 'freelance'
  | 'investments'
  | 'refund'
  | 'cashback'
  | 'other'

/** A single expense/income transaction */
export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: TransactionType
  category: ExpenseCategory
  description: string
  notes?: string
  date: string               // ISO date string
  source: 'manual' | 'email' // how the transaction was created
  approval_status: ApprovalStatus
  reference_id?: string      // UPI ref / bank txn ID
  merchant?: string
  created_at: string
  updated_at: string
}

/** Monthly budget for a category */
export interface Budget {
  id: string
  user_id: string
  category: ExpenseCategory
  amount: number
  month: string              // YYYY-MM format
  created_at: string
  updated_at: string
}

/** Log entry for email scan jobs */
export interface EmailScanLog {
  id: string
  user_id: string
  scanned_at: string
  emails_processed: number
  transactions_found: number
  status: 'success' | 'failed' | 'partial'
  error_message?: string
}

/** User profile (extends Supabase auth user) */
export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
}

/** Dashboard summary data */
export interface MonthlySummary {
  total_income: number
  total_expenses: number
  savings: number
  category_breakdown: CategoryBreakdown[]
  daily_trend: DailyTrend[]
}

export interface CategoryBreakdown {
  category: ExpenseCategory
  amount: number
  percentage: number
  count: number
}

export interface DailyTrend {
  date: string
  income: number
  expenses: number
}
