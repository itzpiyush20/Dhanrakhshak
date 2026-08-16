// ============================================
// Feedback Service — in-app feedback, delivered to the admin inbox
//
// Two things were wrong here and only one was fixed.
//
// 015dc14 created public.feedback on databases that predated it, so the insert
// now has somewhere to land. But this function still reported `success: true`
// unconditionally — a failed insert was downgraded to a console warning and the
// user was thanked anyway. Whatever broke next would have been invisible for
// exactly the same reason the missing table was.
//
// It also kept a parallel copy of every submission in the visitor's own
// localStorage and rendered it back to them as a "tester feedback log". That
// was scaffolding from the testing phase: it is not the owner's inbox, it
// leaks nothing useful to the user, and it survives on shared machines. The
// admin Feedback tab is the one destination now.
// ============================================

import { supabase } from './supabase'

export interface FeedbackInsert {
  rating: number
  category: 'bug' | 'feature_request' | 'ui_ux' | 'other'
  message: string
}

/**
 * Submit feedback. Returns the real outcome — a caller that sees
 * `success: false` must not tell the user their message was received.
 */
export async function submitFeedback(
  feedback: FeedbackInsert
): Promise<{ error: Error | null; success: boolean }> {
  let userEmail = ''
  let userId: string | null = null

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userEmail = user.email || ''
      userId = user.id
    }
  } catch (e) {
    console.warn('Unable to resolve user auth details for feedback:', e)
  }

  // Feedback now requires a signed-in account: migration 032 replaced the
  // anon-writable policy with `auth.uid() = user_id`, because the old one let
  // anyone holding the public key fill this table. Checked here so a signed-out
  // caller gets a sentence they can act on rather than a raw RLS rejection.
  //
  // Nothing is lost by requiring it — the feedback modal is only rendered
  // inside the signed-in profile menu. A signed-out visitor with something to
  // say uses the support form, which stays open to everyone.
  if (!userId) {
    return {
      error: new Error('Please sign in to send feedback, or use the Support page.'),
      success: false,
    }
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    email: userEmail,
    rating: feedback.rating,
    category: feedback.category,
    message: feedback.message,
  })

  if (error) {
    console.error('submitFeedback failed:', error.message)
    // The table is missing. Named explicitly because this exact failure
    // silently swallowed every submission before migration 024 existed, and the
    // generic message sends the owner hunting through application code instead
    // of running the migration.
    //
    // PGRST205 is PostgREST's "not in the schema cache", which is what the
    // browser actually receives; 42P01 is Postgres' own undefined_table. Both
    // mean the same thing here and only the first one reaches the client.
    const code = (error as { code?: string }).code
    if (code === 'PGRST205' || code === '42P01') {
      return {
        error: new Error(
          'Feedback is not available right now. (The feedback table is missing — run supabase/024_feedback_table.sql.)'
        ),
        success: false,
      }
    }
    // 42501 = insufficient_privilege, i.e. the RLS policy refused the row.
    // After migration 032 the usual cause is a session that expired between
    // opening the modal and pressing send.
    if (code === '42501') {
      return {
        error: new Error('Your session expired. Please sign in again and resend.'),
        success: false,
      }
    }
    return {
      error: new Error('Could not send your feedback. Please try again in a moment.'),
      success: false,
    }
  }

  return { error: null, success: true }
}
