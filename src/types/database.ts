// ============================================
// Supabase Database Types
// Mirrors the schema.sql structure for type-safe queries
// ============================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          email_notifications_enabled: boolean
          budget_alerts_enabled: boolean
          weekly_report_enabled: boolean
          subscription_reminders_enabled: boolean
          currency: 'INR' | 'USD' | null
          active_financial_year: number | null
          promo_code: string | null
          subscription_status: string | null
          subscription_expires_at: string | null
          subscription_plan_type: string | null
          daily_scan_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          email_notifications_enabled?: boolean
          budget_alerts_enabled?: boolean
          weekly_report_enabled?: boolean
          subscription_reminders_enabled?: boolean
          currency?: 'INR' | 'USD' | null
          active_financial_year?: number | null
          promo_code?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          subscription_plan_type?: string | null
          daily_scan_time?: string | null
        }
        Update: {
          full_name?: string | null
          avatar_url?: string | null
          email_notifications_enabled?: boolean
          budget_alerts_enabled?: boolean
          weekly_report_enabled?: boolean
          subscription_reminders_enabled?: boolean
          currency?: 'INR' | 'USD' | null
          active_financial_year?: number | null
          promo_code?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          subscription_plan_type?: string | null
          daily_scan_time?: string | null
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          type: 'debit' | 'credit'
          category: string
          description: string
          notes: string | null
          date: string
          source: 'manual' | 'email'
          approval_status: 'pending' | 'approved' | 'rejected'
          reference_id: string | null
          merchant: string | null
          // V2 columns
          payment_mode: 'upi' | 'credit_card' | 'debit_card' | 'neft' | 'rtgs' | 'imps' | 'atm' | 'net_banking' | 'nach' | 'wallet' | 'cheque' | 'unknown' | null
          card_last4: string | null
          card_issuer: string | null
          confidence_score: number | null
          event_type: 'debit' | 'credit' | 'refund' | 'emi' | 'sip' | 'salary' | 'chargeback' | 'subscription' | 'transfer' | 'insurance' | 'loan_repayment' | 'atm_withdrawal' | null
          email_message_id: string | null
          tags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          amount: number
          type: 'debit' | 'credit'
          category: string
          description: string
          notes?: string | null
          date: string
          source?: 'manual' | 'email'
          approval_status?: 'pending' | 'approved' | 'rejected'
          reference_id?: string | null
          merchant?: string | null
          // V2 columns
          payment_mode?: 'upi' | 'credit_card' | 'debit_card' | 'neft' | 'rtgs' | 'imps' | 'atm' | 'net_banking' | 'nach' | 'wallet' | 'cheque' | 'unknown' | null
          card_last4?: string | null
          card_issuer?: string | null
          confidence_score?: number | null
          event_type?: 'debit' | 'credit' | 'refund' | 'emi' | 'sip' | 'salary' | 'chargeback' | 'subscription' | 'transfer' | 'insurance' | 'loan_repayment' | 'atm_withdrawal' | null
          email_message_id?: string | null
          tags?: string[] | null
        }
        Update: {
          amount?: number
          type?: 'debit' | 'credit'
          category?: string
          description?: string
          notes?: string | null
          date?: string
          approval_status?: 'pending' | 'approved' | 'rejected'
          merchant?: string | null
          payment_mode?: string | null
          card_last4?: string | null
          card_issuer?: string | null
          confidence_score?: number | null
          event_type?: string | null
          tags?: string[] | null
        }
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category: string
          amount: number
          month: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          category: string
          amount: number
          month: string
        }
        Update: {
          amount?: number
          category?: string
        }
      }
      email_scan_logs: {
        Row: {
          id: string
          user_id: string
          scanned_at: string
          emails_processed: number
          transactions_found: number
          status: 'success' | 'failed' | 'partial'
          error_message: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
        Update: {
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
      }
      merchant_rules: {
        Row: {
          id: string
          user_id: string
          merchant_key: string
          preferred_category: string
          auto_approve: boolean
          confidence: number
          times_confirmed: number
          last_updated: string
          created_at: string
        }
        Insert: {
          user_id: string
          merchant_key: string
          preferred_category: string
          auto_approve?: boolean
          confidence?: number
          times_confirmed?: number
        }
        Update: {
          preferred_category?: string
          auto_approve?: boolean
          confidence?: number
          times_confirmed?: number
          last_updated?: string
        }
      }
      cards: {
        Row: {
          id: string
          user_id: string
          last4: string
          issuer: string
          card_type: 'credit' | 'debit'
          card_name: string | null
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          last4: string
          issuer: string
          card_type: 'credit' | 'debit'
          card_name?: string | null
          is_primary?: boolean
        }
        Update: {
          card_name?: string | null
          is_primary?: boolean
        }
      }
    }
  }
}
