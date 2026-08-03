// ============================================
// App Constants & Category Configuration
// ============================================

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
