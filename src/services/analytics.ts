// ============================================
// Analytics Service — PostHog Integration
// Tracks user journeys, feature usage, funnels
// ============================================

import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || ''
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com'

let initialized = false

/** Initialize PostHog — call once at app startup */
export function initAnalytics() {
  if (!POSTHOG_KEY || initialized) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,        // We'll manually track meaningful views
    capture_pageleave: true,
    autocapture: false,             // Disable noisy autocapture
    disable_session_recording: true, // Enable only when needed
    persistence: 'localStorage',
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        ph.opt_out_capturing()      // Don't track in development
      }
    },
  })

  initialized = true
}

/** Identify a user after login */
export function identifyUser(userId: string, props?: { email?: string; created_at?: string }) {
  if (!initialized) return
  posthog.identify(userId, props)
}

/** Reset identity on logout */
export function resetAnalytics() {
  if (!initialized) return
  posthog.reset()
}

/** Track a specific event */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return
  posthog.capture(event, properties)
}

/** Track a page view with route name */
export function trackPage(page: string) {
  if (!initialized) return
  posthog.capture('$pageview', { page_name: page })
}

// ─── Typed Event Constants ─────────────────────────────────

export const EVENTS = {
  // Auth funnel
  SIGNUP_STARTED:         'signup_started',
  SIGNUP_COMPLETED:       'signup_completed',
  LOGIN_COMPLETED:        'login_completed',
  GOOGLE_OAUTH_STARTED:   'google_oauth_started',
  GMAIL_CONNECTED:        'gmail_connected',

  // Core engagement
  TRANSACTION_ADDED:      'transaction_added',
  TRANSACTION_EDITED:     'transaction_edited',
  TRANSACTION_DELETED:    'transaction_deleted',
  BUDGET_SET:             'budget_set',

  // Email scanning
  GMAIL_SCAN_STARTED:     'gmail_scan_started',
  GMAIL_SCAN_COMPLETED:   'gmail_scan_completed',
  PENDING_APPROVED:       'pending_approved',
  PENDING_REJECTED:       'pending_rejected',
  PENDING_BULK_APPROVED:  'pending_bulk_approved',

  // AI learning
  MERCHANT_RULE_SAVED:    'merchant_rule_saved',
  CATEGORY_CORRECTED:     'category_corrected',

  // Insights
  INSIGHTS_VIEWED:        'insights_viewed',
  SUBSCRIPTIONS_VIEWED:   'subscriptions_viewed',

  // Retention signals
  EXPORT_DATA:            'export_data',
  BACKUP_CREATED:         'backup_created',
  ACCOUNT_DELETED:        'account_deleted',

  // Monetization signals (future)
  UPGRADE_CTA_CLICKED:    'upgrade_cta_clicked',
  PRICING_VIEWED:         'pricing_viewed',
} as const
