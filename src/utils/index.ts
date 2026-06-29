// ============================================
// Currency & Date Formatting Utilities
// Designed for Indian locale (INR, dd/mm/yyyy)
// ============================================

let activeCurrency: 'INR' | 'USD' = (() => {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('dhanrakshak_currency_preference') as 'INR' | 'USD') || 'INR'
  }
  return 'INR'
})()

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const INR_COMPACT_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const USD_COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

export function getGlobalCurrency(): 'INR' | 'USD' {
  return activeCurrency
}

export function getGlobalCurrencySymbol(): string {
  return activeCurrency === 'INR' ? '₹' : '$'
}

export function setGlobalCurrency(currency: 'INR' | 'USD') {
  activeCurrency = currency
  if (typeof window !== 'undefined') {
    localStorage.setItem('dhanrakshak_currency_preference', currency)
  }
}

/** Format amount as ₹1,23,456.78 or $123,456.78 */
export function formatCurrency(amount: number): string {
  if (activeCurrency === 'USD') {
    return USD_FORMATTER.format(amount)
  }
  return INR_FORMATTER.format(amount)
}

/** Format large amounts as ₹1.2L or $1.2M */
export function formatCurrencyCompact(amount: number): string {
  if (activeCurrency === 'USD') {
    return USD_COMPACT_FORMATTER.format(amount)
  }
  return INR_COMPACT_FORMATTER.format(amount)
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve
 * within `ms` milliseconds, it rejects with a timeout error.
 * Prevents Supabase or network queries from hanging the UI forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Request'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s. Please refresh the page or check your connection.`)),
        ms
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Retries an async function with exponential backoff.
 * Useful for transient Supabase / network failures.
 * @param fn - Async function to retry
 * @param retries - Number of additional attempts after first failure (default 2)
 * @param delayMs - Initial delay in ms, doubles each retry (default 800ms)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 800
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError
}

/** Format date as "28 May 2026" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format date as "28 May" (no year — for current month views) */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/** Format time as "11:30 PM" */
export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Get current month as YYYY-MM */
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge classnames, deduplicating Tailwind classes. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============================================
// BANK NAME DICTIONARY — for matching
// ============================================
const BANK_NAMES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bhdfc\b/i, label: 'HDFC' },
  { pattern: /\bicici\b/i, label: 'ICICI' },
  { pattern: /\bsbi\b|\bstate\s*bank\b/i, label: 'SBI' },
  { pattern: /\baxis\b/i, label: 'Axis' },
  { pattern: /\bkotak\b/i, label: 'Kotak' },
  { pattern: /\bpnb\b|\bpunjab\s*national\b/i, label: 'PNB' },
  { pattern: /\bbob\b|\bbank\s*of\s*baroda\b/i, label: 'Bank of Baroda' },
  { pattern: /\bcanara\b/i, label: 'Canara' },
  { pattern: /\byes\s*bank\b|\byesbank\b/i, label: 'Yes Bank' },
  { pattern: /\bpaytm\b/i, label: 'Paytm' },
  { pattern: /\bidfc\b/i, label: 'IDFC First' },
  { pattern: /\bfederal\s*bank\b/i, label: 'Federal' },
  // Require 'union bank' — bare 'union' matches too many non-bank phrases
  { pattern: /\bunion\s*bank\s*of\s*india\b|\bunion\s*bank\b/i, label: 'Union Bank' },
  { pattern: /\bindusind\b/i, label: 'IndusInd' },
  { pattern: /\bciti\b|\bcitibank\b/i, label: 'Citi' },
  { pattern: /\brbl\b/i, label: 'RBL' },
  { pattern: /\bau\s*small\s*finance\b|\bau\s*bank\b/i, label: 'AU Bank' },
  { pattern: /\bbandhan\b/i, label: 'Bandhan' },
  { pattern: /\bindian\s*overseas\b|\biob\b/i, label: 'IOB' },
  // Require 'central bank' — bare 'central' is too generic
  { pattern: /\bcentral\s*bank\s*of\s*india\b|\bcentral\s*bank\b/i, label: 'Central Bank' },
  { pattern: /\buco\s*bank\b/i, label: 'UCO Bank' },
  { pattern: /\bboi\b|\bbank\s*of\s*india\b/i, label: 'Bank of India' },
  { pattern: /\bstandard\s*chartered\b|\bsc\s*bank\b/i, label: 'StanChart' },
  { pattern: /\bhsbc\b/i, label: 'HSBC' },
  { pattern: /\bdbs\b/i, label: 'DBS' },
  { pattern: /\bamex\b|\bamerican\s*express\b/i, label: 'Amex' },
]

/** Extract bank brand name from text */
export function extractBankName(text: string): string {
  // If the account number is the user's Axis Bank account ending in 5154
  if (/\b(?:5154|xx5154|x5154)\b/i.test(text)) {
    return 'Axis'
  }
  for (const bank of BANK_NAMES) {
    if (bank.pattern.test(text)) {
      return bank.label
    }
  }
  return ''
}

/** Extract last 4 digits of card/account number from text */
export function extractLast4Digits(text: string): string {
  // Match patterns like: xx1234, *1234, ending 1234, card 1234, a/c 1234, ac 1234, account 1234, ending in 1234, *******1234, xxxx-xxxx-1234
  const patterns = [
    /(?:[xX\*]+-?)+\s*(\d{4})\b/,
    /(?:ending|ends)\s*(?:in\s*)?(\d{4})\b/i,
    /(?:card|cc|a\/c|ac|account|acct)\s*(?:no\.?\s*)?(?:ending\s*)?(?:in\s*)?(?:xx|XX|\*+|x+)?\s*(\d{4})\b/i,
    /(?:card|cc|a\/c|ac|account|acct)\s*(?:no\.?\s*)?(\d{4})(?:\s|$|\.|\,)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const digits = match[1]
      // Reject obvious years (2020-2035) — these are not card/account numbers
      const num = parseInt(digits, 10)
      if (num >= 2020 && num <= 2035) continue
      return digits
    }
  }
  return ''
}

/** 
 * Determine the payment instrument type (credit card, debit card, bank account, UPI, wallet)
 * by analyzing the email snippet / notes text.
 * Returns: 'credit_card' | 'debit_card' | 'upi' | 'bank_account' | 'wallet' | 'unknown'
 */
function detectPaymentInstrument(text: string): 'credit_card' | 'debit_card' | 'upi' | 'bank_account' | 'wallet' | 'unknown' {
  const lower = text.toLowerCase()

  // CREDIT CARD: must have explicit "credit card" or "CC ending/no" context
  if (/credit\s*card/i.test(text)) return 'credit_card'
  // "your CC" or "CC ending" 
  if (/\bcc\s+(?:ending|xx|no|number)/i.test(text)) return 'credit_card'
  // "card ending XXXX" or "card no. XXXX" — explicit card number reference
  if (/card\s*(?:ending|no\.?\s*\d)/i.test(text) && !/debit\s*card/i.test(text) && !/a\/c|account|savings|current/i.test(text)) {
    return 'credit_card'
  }

  // DEBIT CARD: explicit keywords only
  if (/debit\s*card/i.test(text)) return 'debit_card'

  // UPI: explicit keywords
  if (/\bupi\b/i.test(text)) return 'upi'
  const hasUpiVpa = (() => {
    const matches = lower.match(/[\w.-]+@[\w.-]+/g)
    if (!matches) return false
    for (const m of matches) {
      if (/\b(care|support|reply|noreply|alerts|help|info|service|contact|feedback|queries|security)@/.test(m)) continue
      if (/\.(com|in|net|org|edu|gov|co|info|biz|co\.in|org\.in|net\.in)$/.test(m)) continue
      return true
    }
    return false
  })()
  if (hasUpiVpa && /(?:paid|txn|transfer)/i.test(text)) return 'upi'

  // BANK ACCOUNT / TRANSFERS (NEFT/RTGS/IMPS/Net Banking): explicit keywords
  if (/\b(?:neft|imps|rtgs|ft|netbanking|internetbanking)\b/i.test(text)) return 'bank_account'
  if (/net\s*banking|internet\s*banking|online\s*transfer|fund\s*transfer/i.test(text)) return 'bank_account'
  if (/a\/c|account|acct|savings\s*(?:a\/c|account)?|current\s*(?:a\/c|account)?/i.test(text)) return 'bank_account'
  if (/debited\s+from|credited\s+to|your\s+(?:bank|a\/c)/i.test(text)) return 'bank_account'

  // WALLET
  if (/wallet|paytm\s*wallet|phonepe\s*wallet|freecharge|mobikwik/i.test(lower)) return 'wallet'

  // NOTE: Bare "card" mention (e.g. "Dear Card Holder") is NOT sufficient to classify as credit card.
  // We return 'unknown' and let the caller use a sensible default.
  return 'unknown'
}

/** 
 * Parses payment transaction details (notes / snippet) to extract and format 
 * the human-readable payment source label.
 * 
 * EXAMPLES of outputs:
 *   "HDFC Credit Card xx9876"
 *   "SBI Bank A/c xx4321"
 *   "ICICI UPI A/c xx7890"
 *   "Debit Card xx5678"
 *   "UPI"
 *   "Bank A/c"
 *   "Main Wallet"
 */
export function parsePaymentSource(notes: string | null | undefined): string {
  if (!notes) return 'Main Wallet'

  const instrument = detectPaymentInstrument(notes)
  const bankName = extractBankName(notes)

  switch (instrument) {
    case 'credit_card':
      return bankName
        ? `${bankName} Credit Card`
        : 'Credit Card'
    
    case 'debit_card':
      return bankName
        ? `${bankName} Debit Card`
        : 'Debit Card'
    
    case 'upi':
      return bankName
        ? `${bankName} UPI`
        : 'UPI'
    
    case 'bank_account':
      return bankName
        ? `${bankName} Bank A/c`
        : 'Bank A/c'
    
    case 'wallet':
      return bankName
        ? `${bankName} Wallet`
        : 'Digital Wallet'
    
    default:
      // Try to construct the most informative label possible
      if (bankName) {
        return `${bankName} Bank`
      }
      // Last resort: check for common payment keywords to give a more specific label
      if (/\bpos\b|\bswipe\b|\bterminal\b/i.test(notes)) return 'Card (POS Swipe)'
      if (/\batm\b/i.test(notes)) return 'ATM Withdrawal'
      if (/\bcash\b/i.test(notes)) return 'Cash'
      return 'Bank'
  }
}

/**
 * Determine if the payment was via a card (credit or debit) vs bank/UPI.
 * Used for icon selection in the UI.
 */
export function isCardPayment(notes: string | null | undefined): boolean {
  if (!notes) return false
  const instrument = detectPaymentInstrument(notes)
  return instrument === 'credit_card' || instrument === 'debit_card'
}

/**
 * Format the payment source label using structured columns if available,
 * falling back to raw notes parsing.
 */
export function formatPaymentSource(txn: {
  payment_mode?: string | null
  card_issuer?: string | null
  card_last4?: string | null
  notes?: string | null
}): string {
  const mode = txn.payment_mode
  const issuer = txn.card_issuer
  const last4 = txn.card_last4

  if (!mode || mode === 'unknown') {
    return parsePaymentSource(txn.notes)
  }

  let label = ''
  switch (mode) {
    case 'credit_card':
      label = issuer ? `${issuer} Credit Card` : 'Credit Card'
      break
    case 'debit_card':
      label = issuer ? `${issuer} Debit Card` : 'Debit Card'
      break
    case 'upi':
      label = issuer ? `${issuer} UPI` : 'UPI'
      break
    case 'bank_account':
      label = issuer ? `${issuer} Bank A/c` : 'Bank A/c'
      break
    case 'wallet':
      label = issuer ? `${issuer} Wallet` : 'Digital Wallet'
      break
    case 'neft':
      label = issuer ? `${issuer} NEFT` : 'NEFT'
      break
    case 'rtgs':
      label = issuer ? `${issuer} RTGS` : 'RTGS'
      break
    case 'imps':
      label = issuer ? `${issuer} IMPS` : 'IMPS'
      break
    case 'atm':
      label = issuer ? `${issuer} ATM` : 'ATM Withdrawal'
      break
    case 'nach':
      label = issuer ? `${issuer} Auto-Debit` : 'Auto-Debit'
      break
    case 'cheque':
      label = 'Cheque'
      break
    default:
      label = issuer ? `${issuer} Bank` : 'Bank'
  }

  if (last4) {
    label += ` xx${last4}`
  }
  return label
}

export { encryptText, decryptText } from './crypto'
