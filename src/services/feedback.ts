// ============================================
// Feedback Service — Tester Suggestions Registry
// Stores feedback to local storage and transmits to Supabase
// ============================================

import { supabase } from './supabase'

export interface FeedbackInsert {
  rating: number
  category: 'bug' | 'feature_request' | 'ui_ux' | 'other'
  message: string
}

export interface TesterFeedbackLog extends FeedbackInsert {
  id: string
  email: string
  created_at: string
}

/** Submit a new tester feedback log entry */
export async function submitFeedback(feedback: FeedbackInsert): Promise<{ error: Error | null; success: boolean }> {
  let userEmail = 'Anonymous Tester'
  let userId: string | null = null

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userEmail = user.email || 'Anonymous Tester'
      userId = user.id
    }
  } catch (e) {
    console.warn('Unable to resolve user auth details for feedback:', e)
  }

  const newLog: TesterFeedbackLog = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
    email: userEmail,
    rating: feedback.rating,
    category: feedback.category,
    message: feedback.message,
    created_at: new Date().toISOString(),
  }

  // 1. Save to Local Registry (localStorage) for instant developer review
  try {
    const existing = getTesterFeedbackLogs()
    existing.unshift(newLog) // Add to top
    localStorage.setItem('dhanrakshak_tester_feedback', JSON.stringify(existing))
  } catch (e) {
    console.error('Error saving feedback to local registry:', e)
  }

  // 2. Attempt to transmit to Supabase database
  try {
    const { error: dbErr } = await supabase
      .from('feedback')
      .insert({
        user_id: userId,
        email: userEmail,
        rating: feedback.rating,
        category: feedback.category,
        message: feedback.message,
      })

    if (dbErr) {
      console.warn('Supabase feedback database insert failed (saving locally only):', dbErr)
      // We still return success: true because the local registry saved it!
      // This ensures testers get a smooth experience even if database is offline.
    }
  } catch (e: any) {
    console.warn('Supabase feedback transmission triggered error:', e)
  }

  return { error: null, success: true }
}

/** Retrieve all locally cached tester feedback logs */
export function getTesterFeedbackLogs(): TesterFeedbackLog[] {
  try {
    const data = localStorage.getItem('dhanrakshak_tester_feedback')
    return data ? JSON.parse(data) : []
  } catch (e) {
    return []
  }
}
