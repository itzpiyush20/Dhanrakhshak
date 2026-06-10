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
  { patterns: [/swiggy/i], canonical: 'Swiggy', category: 'food' },
  { patterns: [/zomato/i], canonical: 'Zomato', category: 'food' },
  { patterns: [/uber\s*eats/i], canonical: 'Uber Eats', category: 'food' },
  { patterns: [/dunzo/i], canonical: 'Dunzo', category: 'food' },

  // Quick commerce
  { patterns: [/blinkit|grofers/i], canonical: 'Blinkit', category: 'groceries' },
  { patterns: [/bigbasket/i], canonical: 'BigBasket', category: 'groceries' },
  { patterns: [/zepto/i], canonical: 'Zepto', category: 'groceries' },
  { patterns: [/jiomart/i], canonical: 'JioMart', category: 'groceries' },
  { patterns: [/\bdmart\b|d-?mart/i], canonical: 'DMart', category: 'groceries' },

  // E-commerce
  { patterns: [/\bamzn\b|amazon\s*seller|amazon/i], canonical: 'Amazon', category: 'shopping' },
  { patterns: [/flipkart/i], canonical: 'Flipkart', category: 'shopping' },
  { patterns: [/myntra/i], canonical: 'Myntra', category: 'shopping' },
  { patterns: [/meesho/i], canonical: 'Meesho', category: 'shopping' },
  { patterns: [/\bajio\b/i], canonical: 'AJIO', category: 'shopping' },
  { patterns: [/nykaa/i], canonical: 'Nykaa', category: 'shopping' },
  { patterns: [/croma/i], canonical: 'Croma', category: 'shopping' },
  { patterns: [/reliance\s*digital/i], canonical: 'Reliance Digital', category: 'shopping' },
  { patterns: [/tata\s*cliq|tatacliq/i], canonical: 'Tata CLiQ', category: 'shopping' },
  { patterns: [/lenskart/i], canonical: 'Lenskart', category: 'health' },

  // Transport
  { patterns: [/ola\s*electric|olaev/i], canonical: 'Ola Electric', category: 'transport' },
  { patterns: [/\bola\b(?!\s*electric)/i], canonical: 'Ola', category: 'transport' },
  { patterns: [/\buber\b(?!\s*eats)/i], canonical: 'Uber', category: 'transport' },
  { patterns: [/rapido/i], canonical: 'Rapido', category: 'transport' },
  { patterns: [/irctc/i], canonical: 'IRCTC', category: 'transport' },
  { patterns: [/fastag|netc/i], canonical: 'FASTag', category: 'transport' },
  { patterns: [/swiggy\s*genie/i], canonical: 'Swiggy Genie', category: 'transport' },

  // Travel
  { patterns: [/makemytrip|\bmmt\b/i], canonical: 'MakeMyTrip', category: 'travel' },
  { patterns: [/goibibo/i], canonical: 'Goibibo', category: 'travel' },
  { patterns: [/cleartrip/i], canonical: 'Cleartrip', category: 'travel' },
  { patterns: [/easemytrip/i], canonical: 'EaseMyTrip', category: 'travel' },
  { patterns: [/\byatra\.com|\byatra\b/i], canonical: 'Yatra', category: 'travel' },
  { patterns: [/\boyo\b/i], canonical: 'OYO', category: 'travel' },

  // Streaming subscriptions
  { patterns: [/netflix/i], canonical: 'Netflix', category: 'subscriptions' },
  { patterns: [/spotify/i], canonical: 'Spotify', category: 'subscriptions' },
  { patterns: [/hotstar|disney\+|disneyplus/i], canonical: 'Disney+ Hotstar', category: 'subscriptions' },
  { patterns: [/amazon\s*prime/i], canonical: 'Amazon Prime', category: 'subscriptions' },
  { patterns: [/youtube\s*premium/i], canonical: 'YouTube Premium', category: 'subscriptions' },
  { patterns: [/jiocinema/i], canonical: 'JioCinema', category: 'subscriptions' },
  { patterns: [/sonyliv/i], canonical: 'SonyLIV', category: 'subscriptions' },
  { patterns: [/\bzee5\b/i], canonical: 'ZEE5', category: 'subscriptions' },
  { patterns: [/apple\s*(tv|music|icloud|one)/i], canonical: 'Apple Subscription', category: 'subscriptions' },
  { patterns: [/google\s*one/i], canonical: 'Google One', category: 'subscriptions' },

  // Utilities / Telecom
  { patterns: [/airtel/i], canonical: 'Airtel', category: 'utilities' },
  { patterns: [/\bjio\b(?!\s*(cinema|mart))/i], canonical: 'Jio', category: 'utilities' },
  { patterns: [/vodafone|idea|\bvi\b/i], canonical: 'Vi (Vodafone Idea)', category: 'utilities' },
  { patterns: [/\bbsnl\b/i], canonical: 'BSNL', category: 'utilities' },
  { patterns: [/bescom|msedcl|tneb|adani\s*electricity|tata\s*power/i], canonical: 'Electricity Provider', category: 'utilities' },
  { patterns: [/indane|bharat\s*gas|hp\s*gas/i], canonical: 'Gas Provider', category: 'utilities' },

  // Entertainment
  { patterns: [/bookmyshow|\bbms\b/i], canonical: 'BookMyShow', category: 'entertainment' },
  { patterns: [/pvr|inox/i], canonical: 'PVR INOX', category: 'entertainment' },

  // Health / Pharma
  { patterns: [/apollo\s*pharmacy/i], canonical: 'Apollo Pharmacy', category: 'health' },
  { patterns: [/netmeds/i], canonical: 'Netmeds', category: 'health' },
  { patterns: [/medplus/i], canonical: 'MedPlus', category: 'health' },
  { patterns: [/\b1mg\b/i], canonical: '1mg', category: 'health' },
  { patterns: [/apollo\s*(hospital|clinic)/i], canonical: 'Apollo Hospital', category: 'health' },

  // Investments
  { patterns: [/groww/i], canonical: 'Groww', category: 'investments' },
  { patterns: [/zerodha/i], canonical: 'Zerodha', category: 'investments' },
  { patterns: [/upstox/i], canonical: 'Upstox', category: 'investments' },
  { patterns: [/kuvera/i], canonical: 'Kuvera', category: 'investments' },

  // Payment platforms
  { patterns: [/paytm/i], canonical: 'Paytm', category: 'other' },
  { patterns: [/phonepe|phone\s*pe/i], canonical: 'PhonePe', category: 'other' },
  { patterns: [/\bbharatpe\b/i], canonical: 'BharatPe', category: 'other' },
  { patterns: [/\bcred\b/i], canonical: 'CRED', category: 'other' },
]

/**
 * Normalize a raw merchant name to its canonical form.
 * Applies alias matching first, then applies generic cleanup.
 */
export function normalizeMerchant(raw: string): NormalizedMerchant {
  if (!raw) return { canonical: '', category: 'other', isKnown: false }

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

  return { canonical: cleaned || raw, category: 'other', isKnown: false }
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
