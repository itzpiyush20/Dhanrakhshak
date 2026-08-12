// ============================================
// Merchant Normalizer — Canonical merchant map
// Maps raw/abbreviated names to canonical display names
// ============================================

interface NormalizedMerchant {
  canonical: string
  category: string
  isKnown: boolean
}

const CANONICAL_MAP: Array<{ patterns: RegExp[]; canonical: string; category: string }> = [
  // Food delivery
  { patterns: [/swiggy/i], canonical: 'Swiggy', category: 'Food & Dining' },
  { patterns: [/zomato/i], canonical: 'Zomato', category: 'Food & Dining' },
  { patterns: [/uber\s*eats/i], canonical: 'Uber Eats', category: 'Food & Dining' },
  { patterns: [/dunzo/i], canonical: 'Dunzo', category: 'Food & Dining' },

  // Quick commerce
  { patterns: [/blinkit|grofers/i], canonical: 'Blinkit', category: 'Groceries' },
  { patterns: [/bigbasket/i], canonical: 'BigBasket', category: 'Groceries' },
  { patterns: [/zepto/i], canonical: 'Zepto', category: 'Groceries' },
  { patterns: [/jiomart/i], canonical: 'JioMart', category: 'Groceries' },
  { patterns: [/\bdmart\b|d-?mart/i], canonical: 'DMart', category: 'Groceries' },

  // E-commerce
  { patterns: [/\bamzn\b|amazon\s*seller|amazon/i], canonical: 'Amazon', category: 'Shopping' },
  { patterns: [/flipkart/i], canonical: 'Flipkart', category: 'Shopping' },
  { patterns: [/myntra/i], canonical: 'Myntra', category: 'Shopping' },
  { patterns: [/meesho/i], canonical: 'Meesho', category: 'Shopping' },
  { patterns: [/\bajio\b/i], canonical: 'AJIO', category: 'Shopping' },
  { patterns: [/nykaa/i], canonical: 'Nykaa', category: 'Shopping' },
  { patterns: [/croma/i], canonical: 'Croma', category: 'Shopping' },
  { patterns: [/reliance\s*digital/i], canonical: 'Reliance Digital', category: 'Shopping' },
  { patterns: [/tata\s*cliq|tatacliq/i], canonical: 'Tata CLiQ', category: 'Shopping' },
  { patterns: [/lenskart/i], canonical: 'Lenskart', category: 'Health' },

  // Transport
  { patterns: [/ola\s*electric|olaev/i], canonical: 'Ola Electric', category: 'Transport' },
  { patterns: [/\bola\b(?!\s*electric)/i], canonical: 'Ola', category: 'Transport' },
  { patterns: [/\buber\b(?!\s*eats)/i], canonical: 'Uber', category: 'Transport' },
  { patterns: [/rapido/i], canonical: 'Rapido', category: 'Transport' },
  { patterns: [/irctc/i], canonical: 'IRCTC', category: 'Transport' },
  { patterns: [/fastag|netc/i], canonical: 'FASTag', category: 'Transport' },
  { patterns: [/swiggy\s*genie/i], canonical: 'Swiggy Genie', category: 'Transport' },

  // Travel
  { patterns: [/makemytrip|\bmmt\b/i], canonical: 'MakeMyTrip', category: 'Travel' },
  { patterns: [/goibibo/i], canonical: 'Goibibo', category: 'Travel' },
  { patterns: [/cleartrip/i], canonical: 'Cleartrip', category: 'Travel' },
  { patterns: [/easemytrip/i], canonical: 'EaseMyTrip', category: 'Travel' },
  { patterns: [/\byatra\.com|\byatra\b/i], canonical: 'Yatra', category: 'Travel' },
  { patterns: [/\boyo\b/i], canonical: 'OYO', category: 'Travel' },

  // Streaming subscriptions
  { patterns: [/netflix/i], canonical: 'Netflix', category: 'Subscriptions' },
  { patterns: [/spotify/i], canonical: 'Spotify', category: 'Subscriptions' },
  { patterns: [/hotstar|disney\+|disneyplus/i], canonical: 'Disney+ Hotstar', category: 'Subscriptions' },
  { patterns: [/amazon\s*prime/i], canonical: 'Amazon Prime', category: 'Subscriptions' },
  { patterns: [/youtube\s*premium/i], canonical: 'YouTube Premium', category: 'Subscriptions' },
  { patterns: [/jiocinema/i], canonical: 'JioCinema', category: 'Subscriptions' },
  { patterns: [/sonyliv/i], canonical: 'SonyLIV', category: 'Subscriptions' },
  { patterns: [/\bzee5\b/i], canonical: 'ZEE5', category: 'Subscriptions' },
  { patterns: [/apple\s*(tv|music|icloud|one)/i], canonical: 'Apple Subscription', category: 'Subscriptions' },
  { patterns: [/google\s*one/i], canonical: 'Google One', category: 'Subscriptions' },

  // Utilities / Telecom
  { patterns: [/airtel/i], canonical: 'Airtel', category: 'Utilities & Bills' },
  { patterns: [/\bjio\b(?!\s*(cinema|mart))/i], canonical: 'Jio', category: 'Utilities & Bills' },
  { patterns: [/vodafone|idea|\bvi\b/i], canonical: 'Vi (Vodafone Idea)', category: 'Utilities & Bills' },
  { patterns: [/\bbsnl\b/i], canonical: 'BSNL', category: 'Utilities & Bills' },
  { patterns: [/bescom|msedcl|tneb|adani\s*electricity|tata\s*power/i], canonical: 'Electricity Provider', category: 'Utilities & Bills' },
  { patterns: [/indane|bharat\s*gas|hp\s*gas/i], canonical: 'Gas Provider', category: 'Utilities & Bills' },

  // Entertainment
  { patterns: [/bookmyshow|\bbms\b/i], canonical: 'BookMyShow', category: 'Entertainment' },
  { patterns: [/pvr|inox/i], canonical: 'PVR INOX', category: 'Entertainment' },

  // Health / Pharma
  { patterns: [/apollo\s*pharmacy/i], canonical: 'Apollo Pharmacy', category: 'Health' },
  { patterns: [/netmeds/i], canonical: 'Netmeds', category: 'Health' },
  { patterns: [/medplus/i], canonical: 'MedPlus', category: 'Health' },
  { patterns: [/\b1mg\b/i], canonical: '1mg', category: 'Health' },
  { patterns: [/apollo\s*(hospital|clinic)/i], canonical: 'Apollo Hospital', category: 'Health' },

  // Investments
  { patterns: [/groww/i], canonical: 'Groww', category: 'Investments' },
  { patterns: [/zerodha/i], canonical: 'Zerodha', category: 'Investments' },
  { patterns: [/upstox/i], canonical: 'Upstox', category: 'Investments' },
  { patterns: [/kuvera/i], canonical: 'Kuvera', category: 'Investments' },

  // Payment platforms
  { patterns: [/paytm/i], canonical: 'Paytm', category: 'Other' },
  { patterns: [/phonepe|phone\s*pe/i], canonical: 'PhonePe', category: 'Other' },
  { patterns: [/\bbharatpe\b/i], canonical: 'BharatPe', category: 'Other' },
  { patterns: [/\bcred\b/i], canonical: 'CRED', category: 'Other' },
  { patterns: [/\bcheq\b/i], canonical: 'CHEQ', category: 'Other' },
]

/** Flat list of canonical brand names, for autocomplete/suggestion UIs. Derived from CANONICAL_MAP so it can never drift out of sync with what normalizeMerchant() actually recognizes. */
export const KNOWN_MERCHANTS: string[] = CANONICAL_MAP.map((entry) => entry.canonical)

/**
 * Normalize a raw merchant name to its canonical form.
 * Applies alias matching first, then applies generic cleanup.
 */
export function normalizeMerchant(raw: string): NormalizedMerchant {
  if (!raw) return { canonical: '', category: 'Other', isKnown: false }

  for (const entry of CANONICAL_MAP) {
    for (const pattern of entry.patterns) {
      if (pattern.test(raw)) {
        return { canonical: entry.canonical, category: entry.category, isKnown: true }
      }
    }
  }

  // Unknown merchant — clean up the raw name (strip legal suffixes, extra spaces)
  const cleaned = raw
    .replace(/\b(pvt|ltd|llp|inc|corp|limited|private|company|co|technologies|tech|services)\b\.?/gi, '')
    .replace(/\b(india|ind|bangalore|mumbai|delhi|chennai|pune|hyderabad)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s&']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  return { canonical: cleaned || raw, category: 'Other', isKnown: false }
}

/**
 * Get a stable DB key for a canonical merchant name.
 * Used as merchant_key in merchant_rules table.
 */
export function getMerchantKey(canonical: string): string {
  return canonical
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}
