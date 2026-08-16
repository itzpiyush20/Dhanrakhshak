// ============================================
// Support Service — support tickets that actually arrive
//
// The /support form used to be a simulator: it wrote the ticket to the
// visitor's own localStorage, printed "Ticket Logged Successfully" and told
// nobody. The Privacy Policy names that page as the grievance channel, so the
// documented route for a complaint discarded it.
//
// This reports the truth. A failed write returns the error and the page says
// so, because a support form that lies about delivery is worse than no form at
// all — the user believes they have been heard and stops trying.
// ============================================

import { supabase } from './supabase'

export interface SupportTicketInput {
  name: string
  email: string
  subject: string
  message: string
}

/** Matches the CHECK constraints in supabase/031_support_tickets.sql. */
const LIMITS = {
  name: 120,
  email: 320,
  subject: 200,
  message: 5000,
} as const

/**
 * File a support ticket.
 *
 * Works signed out — someone locked out of their account is exactly who needs
 * support — in which case `user_id` is null and only the typed email
 * identifies them.
 */
export async function submitSupportTicket(
  input: SupportTicketInput
): Promise<{ error: Error | null }> {
  let userId: string | null = null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    // Signed out, or the auth call failed. Neither is a reason to refuse a
    // ticket; it just arrives without an account attached.
  }

  // Trimmed and clamped here so an over-long field comes back as a clear
  // message rather than as a Postgres constraint violation the user cannot act
  // on. The database CHECKs remain the real ceiling.
  const row = {
    user_id: userId,
    name: input.name.trim().slice(0, LIMITS.name),
    email: input.email.trim().slice(0, LIMITS.email),
    subject: input.subject.trim().slice(0, LIMITS.subject),
    message: input.message.trim().slice(0, LIMITS.message),
  }

  const { error } = await supabase.from('support_tickets').insert(row)

  if (error) {
    console.error('submitSupportTicket failed:', error.message)
    // Migration 031 has not been applied to this database yet.
    //
    // BOTH codes are checked because PostgREST answers this in two different
    // ways: PGRST205 when the table is absent from its schema cache (what the
    // browser actually receives, verified against a database without 031), and
    // 42P01 — Postgres' own undefined_table — when the query does reach the
    // server. Matching only 42P01 meant the useful message never appeared in
    // the case that actually happens.
    const code = (error as { code?: string }).code
    if (code === 'PGRST205' || code === '42P01') {
      return {
        error: new Error(
          'Support is not available right now. (The support_tickets table is missing — run supabase/031_support_tickets.sql.)'
        ),
      }
    }
    return { error: new Error('Could not send your ticket. Please try again, or email us directly.') }
  }

  return { error: null }
}
