// ============================================
// Scanner Gate — Premium access enforcement
// Called at the start of every scan operation.
// Service-layer enforcement — not bypassable via UI.
// ============================================

import { supabase } from './supabase'
import { getLastScheduledRefreshTime, getNextRefreshTime } from './emailScanner'

const OWNER_EMAILS = (import.meta.env.VITE_OWNER_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean)

export type ScanDeniedReason = 'not_authenticated' | 'not_premium' | 'cooldown' | 'year_ended'

export interface ScannerAccessResult {
  allowed: boolean
  reason?: ScanDeniedReason
  hoursLeft?: number
  nextScanTime?: Date
  message?: string
}

/**
 * Gate check for Gmail scan access.
 * Owner emails bypass premium and cooldown checks.
 * All other users must have an active subscription and
 * must wait 24 hours between scans.
 */
export async function checkScannerAccess(): Promise<ScannerAccessResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    return {
      allowed: false,
      reason: 'not_authenticated',
      message: 'Please sign in to use the email scanner.',
    }
  }

  const cleanEmail = user.email?.toLowerCase().trim() || ''
  const isOwner = OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(cleanEmail)

  if (isOwner) {
    return { allowed: true }
  }

  // Premium subscription check
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_expires_at')
    .eq('id', user.id)
    .single()

  const isPremium = (() => {
    if (!profile) return false
    if (profile.subscription_status === 'active') {
      if (!profile.subscription_expires_at) return true
      return new Date(profile.subscription_expires_at).getTime() > Date.now()
    }
    if (profile.subscription_status === 'trial') {
      return new Date(profile.subscription_expires_at).getTime() > Date.now()
    }
    return false
  })()

  if (!isPremium) {
    return {
      allowed: false,
      reason: 'not_premium',
      message: 'Email scanning is a Premium feature. Upgrade to automatically capture transactions from your inbox.',
    }
  }

  // Daily reset cooldown check
  if (!isPremium) {
    const { data: recentScan } = await supabase
      .from('email_scan_logs')
      .select('scanned_at')
      .eq('user_id', user.id)
      .eq('status', 'success')
      .order('scanned_at', { ascending: false })
      .limit(1)

    if (recentScan && recentScan.length > 0) {
      const lastScanMs = new Date(recentScan[0].scanned_at).getTime()
      const lastScheduledTime = getLastScheduledRefreshTime()

      if (lastScanMs >= lastScheduledTime.getTime()) {
        const nextScanTime = getNextRefreshTime()
        const hoursLeft = Math.max(1, Math.ceil((nextScanTime.getTime() - Date.now()) / (60 * 60 * 1000)))
        return {
          allowed: false,
          reason: 'cooldown',
          hoursLeft,
          nextScanTime,
          message: `Next scan available in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} (after daily reset at 06:00 AM). All transactions from your last scan have been captured.`,
        }
      }
    }
  }

  return { allowed: true }
}
