// ============================================================
// Currency detection and formatting — requirement R11
//
// The app is INR-first and stays that way; this exists so a foreign charge is
// recorded as what it actually is instead of being silently absorbed into the
// rupee column. A USD 50 subscription stored as ₹50 is a wrong number in the
// ledger, which is worse than a missing one.
//
// Deliberately no exchange rates. Converting would need a live rate source, a
// rate-on-what-date policy, and would make historical totals drift as rates
// move. Mixed currencies are kept apart and reported separately instead.
// ============================================================

/** The app's home currency. Everything defaults here. */
export const DEFAULT_CURRENCY = 'INR'

/**
 * Symbols and codes mapped to ISO 4217, longest-first so that "US$" and "S$"
 * are recognised before a bare "$", and "AED" before a stray "D".
 */
const CURRENCY_TOKENS: Array<{ pattern: string; code: string }> = [
  { pattern: '\\b(?:Rs\\.?|INR|Rupees?)\\b|₹', code: 'INR' },
  { pattern: '\\bUSD\\b|US\\$', code: 'USD' },
  { pattern: '\\bSGD\\b|S\\$', code: 'SGD' },
  { pattern: '\\bAUD\\b|A\\$', code: 'AUD' },
  { pattern: '\\bCAD\\b|C\\$', code: 'CAD' },
  { pattern: '\\bAED\\b|Dhs\\.?', code: 'AED' },
  { pattern: '\\bEUR\\b|€', code: 'EUR' },
  { pattern: '\\bGBP\\b|£', code: 'GBP' },
  { pattern: '\\bJPY\\b|¥', code: 'JPY' },
  // Bare $ last: every more specific dollar variant has already matched.
  { pattern: '\\$', code: 'USD' },
]

const CURRENCY_ALTERNATION = CURRENCY_TOKENS.map((t) => t.pattern).join('|')
const NUMBER_PATTERN = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?'

/** Resolve a matched symbol or code to its ISO 4217 code. */
export function currencyCodeFor(token: string | null | undefined): string {
  if (!token) return DEFAULT_CURRENCY
  const cleaned = token.trim()
  for (const { pattern, code } of CURRENCY_TOKENS) {
    if (new RegExp(`^(?:${pattern})$`, 'i').test(cleaned)) return code
  }
  return DEFAULT_CURRENCY
}

export interface AmountMatch {
  value: number
  /** Offset in the source text, used for keyword-proximity scoring. */
  index: number
  text: string
  currency: string
}

/**
 * Every currency-tagged amount in the text, in the order found.
 *
 * Only amounts carrying an explicit symbol or code are returned — a bare
 * number is never treated as money, which is what stops order numbers and
 * reference ids becoming transactions.
 */
export function extractAmountMatches(text: string): AmountMatch[] {
  if (!text) return []
  const matches: AmountMatch[] = []

  const prefixed = new RegExp(`(${CURRENCY_ALTERNATION})\\s*(${NUMBER_PATTERN})`, 'gi')
  const suffixed = new RegExp(`\\b(${NUMBER_PATTERN})\\s*(${CURRENCY_ALTERNATION})`, 'gi')

  let m: RegExpExecArray | null
  while ((m = prefixed.exec(text)) !== null) {
    const value = Number(m[2].replace(/,/g, ''))
    if (!Number.isNaN(value) && value > 0 && value <= 99999999) {
      matches.push({ value, index: m.index, text: m[0], currency: currencyCodeFor(m[1]) })
    }
  }
  while ((m = suffixed.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, ''))
    if (!Number.isNaN(value) && value > 0 && value <= 99999999) {
      matches.push({ value, index: m.index, text: m[0], currency: currencyCodeFor(m[2]) })
    }
  }

  return matches
}

/** Display symbol for a currency, falling back to the code itself. */
export function currencySymbol(code: string = DEFAULT_CURRENCY): string {
  switch (code) {
    case 'INR': return '₹'
    case 'USD': return '$'
    case 'EUR': return '€'
    case 'GBP': return '£'
    case 'JPY': return '¥'
    default: return `${code} `
  }
}

/** True when this transaction may be summed into the app's headline totals. */
export function isHomeCurrency(code: string | null | undefined): boolean {
  return (code ?? DEFAULT_CURRENCY) === DEFAULT_CURRENCY
}
