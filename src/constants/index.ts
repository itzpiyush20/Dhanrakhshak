// ============================================
// App Constants & Category Configuration
// ============================================

import type { ExpenseCategory } from '../types'

/** Category metadata — label, icon emoji, and color class for charts/badges */
export const CATEGORIES: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  food:           { label: 'Food & Dining',    emoji: '🍔', color: '#f97316' },
  groceries:      { label: 'Groceries',        emoji: '🛒', color: '#84cc16' },
  transport:      { label: 'Transport',         emoji: '🚗', color: '#3b82f6' },
  shopping:       { label: 'Shopping',          emoji: '🛍️', color: '#ec4899' },
  utilities:      { label: 'Utilities & Bills', emoji: '💡', color: '#eab308' },
  rent:           { label: 'Rent',              emoji: '🏠', color: '#8b5cf6' },
  health:         { label: 'Health',            emoji: '🏥', color: '#ef4444' },
  entertainment:  { label: 'Entertainment',     emoji: '🎬', color: '#f43f5e' },
  education:      { label: 'Education',         emoji: '📚', color: '#06b6d4' },
  travel:         { label: 'Travel',            emoji: '✈️', color: '#14b8a6' },
  subscriptions:  { label: 'Subscriptions',     emoji: '🔄', color: '#a855f7' },
  insurance:      { label: 'Insurance',         emoji: '🛡️', color: '#0891b2' },
  credit_card_bill_payment: { label: 'Credit Card Bill Payment', emoji: '💳', color: '#475569' },
  transfers:      { label: 'Transfers',         emoji: '🔁', color: '#6b7280' },
  salary:         { label: 'Salary',            emoji: '💰', color: '#10b981' },
  freelance:      { label: 'Freelance',         emoji: '💻', color: '#0ea5e9' },
  investments:    { label: 'Investments',        emoji: '📈', color: '#22c55e' },
  refund:         { label: 'Refund',            emoji: '↩️', color: '#64748b' },
  cashback:       { label: 'Cashback',          emoji: '🎁', color: '#f59e0b' },
  other:          { label: 'Other',             emoji: '📌', color: '#94a3b8' },
}

/** Neutral style for transactions whose category no longer exists */
export const CATEGORY_STYLE_FALLBACK = { emoji: '📌', color: '#94a3b8' }

/** Curated emoji choices for the category form */
export const CATEGORY_EMOJI_CHOICES = [
  '🍔','🛒','🚗','🛍️','💡','🏠','🏥','🎬','📚','✈️',
  '🔄','🛡️','💳','🔁','💰','💻','📈','↩️','🎁','📌',
  '🎮','🐾','👶','🏋️','🎓','🎵','☕','🍺','💊','🧾',
  '🎂','🌱','🔧','📱','👔','💇','🏦','🙏','🎗️','🚌',
]

/** Curated color swatches for the category form */
export const CATEGORY_COLOR_CHOICES = [
  '#f97316','#84cc16','#3b82f6','#ec4899','#eab308','#8b5cf6',
  '#ef4444','#f43f5e','#06b6d4','#14b8a6','#a855f7','#0891b2',
  '#475569','#6b7280','#10b981','#0ea5e9','#22c55e','#64748b',
  '#f59e0b','#94a3b8','#d946ef','#7c3aed','#059669','#b91c1c',
]

/** Navigation routes */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  DASHBOARD: '/dashboard',
  EXPENSES: '/expenses',
  BUDGETS: '/budgets',
  PENDING: '/pending',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  INSIGHTS: '/insights',
  SUBSCRIPTIONS: '/subscriptions',
  PRICING: '/pricing',
  PRIVACY: '/privacy',
  ABOUT: '/about',
  TERMS: '/terms',
  REFUND: '/refund-policy',
  RESET_PASSWORD: '/reset-password',
} as const

/** App-level config */
export const APP_CONFIG = {
  APP_NAME: 'Dhanrakshak',
  APP_TAGLINE: 'Effortless Tracking. Smart Saving.',
  CURRENCY: 'INR',
  LOCALE: 'en-IN',
  DEFAULT_PAGE_SIZE: 20,
  EMAIL_SCAN_BATCH_SIZE: 50,
  SUPPORT_EMAIL: 'support@dhanrakshak.in',
  SUPPORT_NAME: 'Dhanrakshak Support',
  SUPPORT_DESIGNATION: 'Data Protection Officer & Grievance Officer',
  SUPPORT_ADDRESS: 'Jaipur, Rajasthan, India',
} as const
