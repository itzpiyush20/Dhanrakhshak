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
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          full_name?: string | null
          avatar_url?: string | null
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
    }
  }
}
