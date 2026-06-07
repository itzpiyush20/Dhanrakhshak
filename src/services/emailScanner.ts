// ============================================
// Email Scanner Service V2 — Dhanrakshak
// 5-Layer Financial Intelligence Engine
// Priority: Accuracy > Speed > Coverage
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'
import { extractBankName } from '@/utils'
import { applyMerchantRulesFromDB } from './learningEngine'
import { saveGoogleToken, getGoogleToken, clearGoogleToken } from './googleAuth'
import { analyzeTransactionEmailWithAI } from './aiService'

type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

// ============================================================
// OWNER EMAILS — get unlimited scans. All other users are
// capped to 1 scan per 24 hours.
// ============================================================
const OWNER_EMAILS = ['itzpiyushkhandelwal@gmail.com', 'itzpiyush20@gmail.com']

// ============================================================
// LAYER 1 — TRUSTED SENDER DOMAIN WHITELIST
// Only emails from these domains are treated as financial alerts
// All others receive a -30 confidence penalty
// ============================================================
const TRUSTED_SENDER_DOMAINS = new Set([
  // Indian PSU Banks
  'sbi.co.in', 'onlinesbi.com', 'sbicards.com', 'sbicard.com',
  'pnb.co.in', 'punjabnationalbank.in',
  'canarabank.com', 'canarabank.in',
  'bankofbaroda.in', 'bankofbaroda.com',
  'bankofindia.co.in',
  'unionbankofindia.org', 'unionbankofindia.com',
  'indianbank.in',
  'centralbankofindia.co.in',
  'ucobank.com',
  'iobnet.co.in',
  'allahababank.in',
  // Indian Private Banks
  'hdfcbank.com', 'hdfcbank.net',
  'icicibank.com',
  'axisbank.com',
  'kotak.com', 'kotakbank.com',
  'yesbank.in', 'yesbank.com',
  'indusind.com', 'indusindbank.com',
  'idfcfirstbank.com',
  'federalbank.co.in',
  'rblbank.com',
  'aubank.in', 'aufinanciers.com',
  'bandhanbank.com',
  'dcbbank.com',
  'sbm.co.in', 'sbmbank.co.in',
  // Credit Card Issuers
  'sbicard.com', 'sbicards.com',
  'citi.com', 'citibank.co.in', 'citibank.com',
  'americanexpress.com', 'aexp.com',
  'hsbc.co.in', 'hsbc.com',
  'standardchartered.com', 'sc.com',
  // Payment Processors / Fintech
  'phonepe.com',
  'paytm.com', 'paytmbank.com',
  'amazonpay.in',
  'googlepay.com', 'google.com',
  'cred.club',
  'razorpay.com',
  'cashfree.com',
  'mobikwik.com',
  'freecharge.in',
  'jiomoney.com',
  'nsdl.co.in',
  'npci.org.in',
  // Notifications / alerts subdomains (common pattern)
  'alerts.hdfcbank.com', 'alerts.icicibank.com', 'alerts.axisbank.com',
  // IRCTC / Railways
  'irctc.co.in', 'railnet.gov.in',
  // E-commerce payment emails
  'amazonses.com',
  // Juspay / payment gateways
  'juspay.in',
  // Bharatpe
  'bharatpe.com',
])

// ============================================================
// LAYER 2 — SUBJECT LINE FILTERS
// Hard-reject: clearly non-transactional
// Hard-accept: clearly transactional (bypass further soft checks)
// ============================================================
const HARD_REJECT_SUBJECT_PATTERNS = [
  /\b(statement|e-?statement|monthly\s*statement|account\s*statement)\b/i,
  /\b(newsletter|unsubscribe|promotion|promotional|offer|coupon|deal|cashback\s*offer|reward\s*points|limited\s*period|sale)\b/i,
  /\b(welcome|onboarding|activate\s*your|verify\s*your\s*email|confirm\s*your)\b/i,
  /\b(policy\s*update|terms\s*of\s*service|privacy\s*update|security\s*update|agreement\s*update)\b/i,
  /\b(minimum\s*due|payment\s*due|bill\s*generated|overdue|payable\s*by|due\s*date)\b/i,
  /\b(auto-?debit\s*scheduled|standing\s*instruction|pre-?authorized)\b/i,
]

const HARD_ACCEPT_SUBJECT_PATTERNS = [
  /\b(debited|debit\s*alert|amount\s*debited)\b/i,
  /\b(credited|credit\s*alert|amount\s*credited)\b/i,
  /\b(transaction\s*alert|payment\s*alert|txn\s*alert)\b/i,
  /\b(purchase\s*alert|spend\s*alert|spending\s*alert)\b/i,
  /\b(salary\s*credited|salary\s*received)\b/i,
  /\b(upi\s*transaction|upi\s*payment)\b/i,
  /\b(emi\s*debited|loan\s*emi)\b/i,
  /\b(refund\s*credited|refund\s*processed)\b/i,
]

// ============================================================
// MERCHANT LEARNING — localStorage fallback (V2 also supports DB)
// ============================================================
const BLOCKLIST_KEYWORDS = new Set([
  'and', 'for', 'the', 'with', 'from', 'was', 'were', 'had', 'has', 'have',
  'bank', 'payment', 'transfer', 'alert', 'ref', 'upi', 'pay', 'account',
  'cash', 'money', 'wallet', 'online', 'card', 'transaction', 'txn', 'credit',
  'debit', 'received', 'sent', 'paid', 'charge', 'bill', 'recharge', 'refund',
  'employer', 'salary', 'cashback', 'customer', 'alert', 'notification',
  'noreply', 'xx', 'x', 'a/c', 'dear', 'customer', 'successful', 'successfully',
  'completed', 'status',
])

export interface MerchantRule {
  category: string
  autoApprove: boolean
}

export function getMerchantWeights(): Record<string, Record<string, number>> {
  try {
    const weights = localStorage.getItem('dhanrakshak_merchant_weights')
    return weights ? JSON.parse(weights) : {}
  } catch {
    return {}
  }
}

export function getMerchantSettings(): Record<string, { autoApprove: boolean }> {
  try {
    const settings = localStorage.getItem('dhanrakshak_merchant_settings')
    return settings ? JSON.parse(settings) : {}
  } catch {
    return {}
  }
}

export function saveMerchantSetting(merchant: string, settings: { autoApprove: boolean }) {
  try {
    const current = getMerchantSettings()
    current[merchant.toLowerCase().trim()] = settings
    localStorage.setItem('dhanrakshak_merchant_settings', JSON.stringify(current))
  } catch (e) {
    console.error('Failed to save merchant setting:', e)
  }
}

/** Multi-stage cleaning pipeline to isolate canonical merchant names */
export function cleanMerchantName(rawMerchant: string): string {
  if (!rawMerchant) return ''
  let cleaned = rawMerchant.toLowerCase().trim()
  // Strip UPI Virtual Payment Addresses
  cleaned = cleaned.replace(/[a-z0-9._-]+@[a-z0-9.-]+/g, '')
  // Remove payment aggregators
  const aggregators = [
    /^(upi|pos|txn|ref|imps|neft|rtgs|payment|transfer|sent|paid|spent|alert|info|narration|remarks)[-/\s*]+/gi,
    /^(gpay|paytm|phonepe|bhim|amazonpay|bharatpe)[-/\s*]+/gi,
    /\b(gpay|paytm|phonepe|bhim|amazonpay|bharatpe)\b/gi,
  ]
  for (const regex of aggregators) cleaned = cleaned.replace(regex, ' ')
  cleaned = cleaned.replace(/\b(outflow|ride|sub|rides|alert|payment|fashion|pos|txn|ref|order|bank|alert|info|narration|terminal|store|merchant|biller|payee|recipient|transfer|bill|recharge|receipt)\b/gi, ' ')
  cleaned = cleaned.replace(/\b(bangalore|mumbai|delhi|new\s+delhi|chennai|pune|hyderabad|kolkata|ahmedabad|bengaluru|in|ind|ltd|pvt|co)\b(?:\s*$)/gi, '')
  cleaned = cleaned.replace(/\b\d{4,15}\b/g, '')
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function saveMerchantRule(merchant: string, category: string, autoApprove = true) {
  try {
    const weights = getMerchantWeights()
    const cleanMerchant = cleanMerchantName(merchant).toLowerCase().trim()
    if (!cleanMerchant || cleanMerchant.length <= 2 || BLOCKLIST_KEYWORDS.has(cleanMerchant)) return
    weights[cleanMerchant] = { [category]: 2 }
    const currentSettings = getMerchantSettings()
    if (currentSettings[cleanMerchant] === undefined || currentSettings[cleanMerchant].autoApprove !== autoApprove) {
      saveMerchantSetting(cleanMerchant, { autoApprove })
    }
    localStorage.setItem('dhanrakshak_merchant_weights', JSON.stringify(weights))
  } catch (e) {
    console.error('Failed to save merchant weight:', e)
  }
}

export function deleteMerchantRule(key: string) {
  try {
    const weights = getMerchantWeights()
    delete weights[key]
    localStorage.setItem('dhanrakshak_merchant_weights', JSON.stringify(weights))
    const settings = getMerchantSettings()
    delete settings[key]
    localStorage.setItem('dhanrakshak_merchant_settings', JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to delete merchant rule:', e)
  }
}

export function getMerchantRules(): Record<string, { category: string; autoApprove: boolean }> {
  try {
    const weights = getMerchantWeights()
    const settings = getMerchantSettings()
    const rules: Record<string, { category: string; autoApprove: boolean }> = {}
    for (const [merchant, categoriesMap] of Object.entries(weights)) {
      let bestCategory = 'other'
      let maxCount = 0
      for (const [cat, count] of Object.entries(categoriesMap)) {
        if (count > maxCount) { maxCount = count; bestCategory = cat }
      }
      const autoApprove = settings[merchant]?.autoApprove !== false
      rules[merchant] = { category: bestCategory, autoApprove }
    }
    return rules
  } catch {
    return {}
  }
}

// ============================================================
// CONTEXT KEYWORD CLASSIFIER (fallback categorisation)
// ============================================================
const CONTEXT_KEYWORDS: Record<string, string[]> = {
  groceries: ['mart', 'grocery', 'supermarket', 'bigbasket', 'blinkit', 'zepto', 'groceries', 'kirana', 'milk', 'dairy', 'provisions'],
  food: ['zomato', 'swiggy', 'food', 'restaurant', 'cafe', 'canteen', 'dhaba', 'eats', 'pizza', 'burger', 'kitchen', 'bakery', 'dining', 'coffee'],
  transport: ['uber', 'ola', 'cab', 'taxi', 'metro', 'irctc', 'railway', 'train', 'flight', 'airline', 'petrol', 'diesel', 'hpcl', 'bpcl', 'iocl', 'cng', 'toll', 'fastag', 'rapido'],
  entertainment: ['pvr', 'inox', 'movie', 'cinema', 'bookmyshow', 'theatre', 'gaming', 'pub', 'bar', 'club', 'lounge'],
  subscriptions: ['netflix', 'spotify', 'prime', 'hotstar', 'youtube', 'premium', 'apple', 'icloud', 'google one', 'microsoft', 'adobe'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'mall', 'fashion', 'retail', 'croma', 'reliance digital', 'clothing', 'nykaa', 'bazaar', 'dmart'],
  utilities: ['airtel', 'jio', 'bsnl', 'broadband', 'electricity', 'bescom', 'power', 'water', 'gas', 'indane', 'telecom', 'wifi'],
  salary: ['salary', 'payroll', 'employer', 'stipend', 'wages'],
  investments: ['mutual fund', 'sip', 'groww', 'zerodha', 'upstox', 'investment', 'etf', 'demat', 'stocks', 'securities'],
  health: ['hospital', 'pharmacy', 'medical', 'clinic', 'doctor', 'medicine', 'apollo', 'netmeds', 'medplus', 'insurance'],
  education: ['school', 'college', 'university', 'course', 'coaching', 'tuition', 'fee', 'exam'],
  travel: ['hotel', 'makemytrip', 'booking', 'goibibo', 'cleartrip', 'easemytrip', 'airbnb', 'oyo'],
}

export interface RuleMatchResult {
  category: string
  approval_status: 'approved' | 'pending'
  confidence: number
  matchReason: string
}

export function applyMerchantRules(merchant: string, snippet: string, defaultCategory: string): RuleMatchResult {
  const weights = getMerchantWeights()
  const settings = getMerchantSettings()
  const cleanMerchantText = cleanMerchantName(merchant).toLowerCase()
  const normalizedSnippet = snippet.toLowerCase()
  const normalizedMerchant = merchant.toLowerCase()

  let bestCategory = defaultCategory
  let maxWeight = 0
  let totalKeyWeight = 0
  let matchedKey = ''

  for (const [key, catMap] of Object.entries(weights)) {
    const keyLower = key.toLowerCase()
    const escapedKey = escapeRegExp(keyLower)
    const hasMatch =
      new RegExp(`\\b${escapedKey}\\b`, 'i').test(cleanMerchantText) ||
      new RegExp(`\\b${escapedKey}\\b`, 'i').test(normalizedSnippet)
    if (hasMatch) {
      let keyBestCat = 'other', keyMaxWeight = 0, keyTotal = 0
      for (const [cat, count] of Object.entries(catMap)) {
        keyTotal += count
        if (count > keyMaxWeight) { keyMaxWeight = count; keyBestCat = cat }
      }
      if (keyMaxWeight > maxWeight) {
        maxWeight = keyMaxWeight
        totalKeyWeight = keyTotal
        bestCategory = keyBestCat
        matchedKey = key
      }
    }
  }

  if (maxWeight > 0) {
    const confidence = Math.round((maxWeight / totalKeyWeight) * 100)
    const isAutoApproveDisabled = settings[matchedKey]?.autoApprove === false
    const isHighConfidence = confidence >= 80 && totalKeyWeight >= 2 && !isAutoApproveDisabled
    return {
      category: bestCategory,
      approval_status: isHighConfidence ? 'approved' : 'pending',
      confidence,
      matchReason: `Matched learned rule for '${matchedKey}' (${confidence}% confidence)`,
    }
  }

  for (const [cat, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    for (const keyword of keywords) {
      const keywordRegex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i')
      if (keywordRegex.test(normalizedMerchant) || keywordRegex.test(normalizedSnippet)) {
        return {
          category: cat,
          approval_status: 'pending',
          confidence: 70,
          matchReason: `Suggested by keyword '${keyword}' (70% confidence)`,
        }
      }
    }
  }

  return {
    category: defaultCategory || 'other',
    approval_status: 'pending',
    confidence: defaultCategory && defaultCategory !== 'other' ? 60 : 0,
    matchReason: defaultCategory && defaultCategory !== 'other'
      ? `Template default for '${cleanMerchantName(merchant) || merchant}' (60% confidence)`
      : 'Unrecognized merchant',
  }
}

// ============================================================
// WELL-KNOWN MERCHANT PATTERNS
// ============================================================
const KNOWN_MERCHANTS: { pattern: RegExp; name: string; category: string; description: string }[] = [
  { pattern: /zomato/i, name: 'Zomato', category: 'food', description: 'Zomato Food Order' },
  { pattern: /swiggy/i, name: 'Swiggy', category: 'food', description: 'Swiggy Meal Delivery' },
  { pattern: /uber\s*eats/i, name: 'Uber Eats', category: 'food', description: 'Uber Eats Order' },
  { pattern: /dunzo/i, name: 'Dunzo', category: 'food', description: 'Dunzo Delivery' },
  { pattern: /blinkit|grofers/i, name: 'Blinkit', category: 'groceries', description: 'Blinkit Quick Delivery' },
  { pattern: /bigbasket/i, name: 'BigBasket', category: 'groceries', description: 'BigBasket Groceries' },
  { pattern: /zepto/i, name: 'Zepto', category: 'groceries', description: 'Zepto Quick Commerce' },
  { pattern: /instamart/i, name: 'Swiggy Instamart', category: 'groceries', description: 'Swiggy Instamart' },
  { pattern: /jiomart/i, name: 'JioMart', category: 'groceries', description: 'JioMart Grocery' },
  { pattern: /\bola\s*electric\b|olaev/i, name: 'Ola Electric', category: 'transport', description: 'Ola Electric Scooter' },
  { pattern: /\bola\b/i, name: 'Ola', category: 'transport', description: 'Ola Cab Ride' },
  { pattern: /\buber\b/i, name: 'Uber', category: 'transport', description: 'Uber Cab Ride' },
  { pattern: /rapido/i, name: 'Rapido', category: 'transport', description: 'Rapido Bike Ride' },
  { pattern: /irctc/i, name: 'IRCTC', category: 'transport', description: 'IRCTC Railway Booking' },
  { pattern: /fastag|\bfastag\b|netc\s*fastag/i, name: 'FASTag', category: 'transport', description: 'FASTag Toll Payment' },
  { pattern: /makemytrip|mmt\b/i, name: 'MakeMyTrip', category: 'travel', description: 'MakeMyTrip Booking' },
  { pattern: /goibibo/i, name: 'Goibibo', category: 'travel', description: 'Goibibo Booking' },
  { pattern: /cleartrip/i, name: 'Cleartrip', category: 'travel', description: 'Cleartrip Booking' },
  { pattern: /easemytrip/i, name: 'EaseMyTrip', category: 'travel', description: 'EaseMyTrip Booking' },
  { pattern: /yatra\.com|\byatra\b/i, name: 'Yatra', category: 'travel', description: 'Yatra Booking' },
  { pattern: /oyo\s*rooms|oyorooms|oyo\b/i, name: 'OYO', category: 'travel', description: 'OYO Hotel Stay' },
  { pattern: /netflix/i, name: 'Netflix', category: 'subscriptions', description: 'Netflix Subscription' },
  { pattern: /spotify/i, name: 'Spotify', category: 'subscriptions', description: 'Spotify Premium' },
  { pattern: /hotstar|disney\+|disneyplus/i, name: 'Disney+ Hotstar', category: 'subscriptions', description: 'Disney+ Hotstar Subscription' },
  { pattern: /youtube\s*premium/i, name: 'YouTube Premium', category: 'subscriptions', description: 'YouTube Premium' },
  { pattern: /amazon\s*prime/i, name: 'Amazon Prime', category: 'subscriptions', description: 'Amazon Prime Subscription' },
  { pattern: /jio\s*cinema|jiocinema/i, name: 'JioCinema', category: 'subscriptions', description: 'JioCinema Subscription' },
  { pattern: /sonyliv/i, name: 'SonyLIV', category: 'subscriptions', description: 'SonyLIV Subscription' },
  { pattern: /zee5/i, name: 'ZEE5', category: 'subscriptions', description: 'ZEE5 Subscription' },
  { pattern: /apple\s*(?:tv|music|icloud|one)/i, name: 'Apple Subscription', category: 'subscriptions', description: 'Apple Subscription' },
  { pattern: /google\s*one/i, name: 'Google One', category: 'subscriptions', description: 'Google One Storage' },
  { pattern: /myntra/i, name: 'Myntra', category: 'shopping', description: 'Myntra Fashion Purchase' },
  { pattern: /amazon/i, name: 'Amazon', category: 'shopping', description: 'Amazon Checkout' },
  { pattern: /flipkart/i, name: 'Flipkart', category: 'shopping', description: 'Flipkart Shopping' },
  { pattern: /meesho/i, name: 'Meesho', category: 'shopping', description: 'Meesho Purchase' },
  { pattern: /ajio/i, name: 'AJIO', category: 'shopping', description: 'AJIO Fashion Purchase' },
  { pattern: /nykaa/i, name: 'Nykaa', category: 'shopping', description: 'Nykaa Beauty Purchase' },
  { pattern: /croma/i, name: 'Croma', category: 'shopping', description: 'Croma Electronics' },
  { pattern: /reliance\s*digital/i, name: 'Reliance Digital', category: 'shopping', description: 'Reliance Digital Purchase' },
  { pattern: /\bdmart\b|d-?mart/i, name: 'DMart', category: 'groceries', description: 'DMart Purchase' },
  { pattern: /airtel/i, name: 'Airtel', category: 'utilities', description: 'Airtel Telecom / Broadband' },
  { pattern: /\bjio\b/i, name: 'Jio', category: 'utilities', description: 'Jio Telecom Recharge' },
  { pattern: /\bvi\b|vodafone|idea/i, name: 'Vi (Vodafone Idea)', category: 'utilities', description: 'Vi Telecom Recharge' },
  { pattern: /bsnl/i, name: 'BSNL', category: 'utilities', description: 'BSNL Telecom Bill' },
  { pattern: /electricity|bescom|tata\s*power|adani\s*electricity|msedcl|tneb/i, name: 'Electricity Provider', category: 'utilities', description: 'Electricity Bill Payment' },
  { pattern: /gas\s*bill|indane|bharat\s*gas|hp\s*gas/i, name: 'Gas Provider', category: 'utilities', description: 'Gas Bill Payment' },
  { pattern: /water\s*bill|water\s*supply/i, name: 'Water Supply', category: 'utilities', description: 'Water Bill Payment' },
  { pattern: /salary|credited\s*by.*(?:employer|company|corp)/i, name: 'Salary Credit', category: 'salary', description: 'Monthly Salary Credit' },
  { pattern: /bookmyshow|\bbms\b/i, name: 'BookMyShow', category: 'entertainment', description: 'BookMyShow Tickets' },
  { pattern: /pvr|inox/i, name: 'PVR INOX', category: 'entertainment', description: 'PVR INOX Cinema' },
  { pattern: /apollo\s*pharmacy|netmeds|medplus|1mg\b/i, name: 'Pharmacy', category: 'health', description: 'Pharmacy / Medicine Purchase' },
  { pattern: /apollo\s*(?:hospital|clinic)/i, name: 'Apollo Hospital', category: 'health', description: 'Apollo Hospital Payment' },
  { pattern: /groww/i, name: 'Groww', category: 'investments', description: 'Groww Investment' },
  { pattern: /zerodha/i, name: 'Zerodha', category: 'investments', description: 'Zerodha Trading' },
  { pattern: /upstox/i, name: 'Upstox', category: 'investments', description: 'Upstox Investment' },
  { pattern: /kuvera/i, name: 'Kuvera', category: 'investments', description: 'Kuvera Fund Investment' },
  { pattern: /mutual\s*fund|sip\b/i, name: 'Mutual Fund SIP', category: 'investments', description: 'Mutual Fund SIP Debit' },
  { pattern: /paytm\s*mall|paytm\s*(?:movie|travel)/i, name: 'Paytm Mall', category: 'shopping', description: 'Paytm Mall Purchase' },
  { pattern: /swiggy\s*genie/i, name: 'Swiggy Genie', category: 'transport', description: 'Swiggy Genie Delivery' },
  { pattern: /tata\s*cliq|tatacliq/i, name: 'Tata CLiQ', category: 'shopping', description: 'Tata CLiQ Purchase' },
  { pattern: /lenskart/i, name: 'Lenskart', category: 'health', description: 'Lenskart Eyewear' },
  { pattern: /classplus|unacademy|byjus|byju/i, name: 'EdTech Platform', category: 'education', description: 'Online Education' },
]

// ============================================================
// LAYER 4 — EVENT TYPE CLASSIFICATION
// ============================================================
type EventType = 'debit' | 'credit' | 'refund' | 'emi' | 'sip' | 'salary' | 'chargeback' | 'subscription' | 'transfer' | 'insurance' | 'loan_repayment' | 'atm_withdrawal'

function classifyEventType(text: string, txType: 'debit' | 'credit', category: string): EventType {
  const t = text.toLowerCase()

  // Credit events
  if (txType === 'credit') {
    if (/\b(salary|payroll|employer|stipend|wages)\b/.test(t)) return 'salary'
    if (/\b(refund|reversed|chargeback|dispute\s*resolved)\b/.test(t)) return 'refund'
    if (/\b(cashback)\b/.test(t)) return 'credit'
    return 'credit'
  }

  // Debit events
  if (/\b(emi|equated\s*monthly|loan\s*emi|emi\s*debit)\b/.test(t)) return 'emi'
  if (/\b(sip|systematic\s*investment|mutual\s*fund\s*sip)\b/.test(t)) return 'sip'
  if (/\b(insurance|premium|life\s*insurance|health\s*insurance|term\s*plan|ulip)\b/.test(t)) return 'insurance'
  if (/\b(loan\s*repayment|loan\s*payment|emi|home\s*loan|personal\s*loan|auto\s*loan)\b/.test(t)) return 'loan_repayment'
  if (/\b(atm\s*withdrawal|atm\s*cash|cash\s*withdrawal|atm\s*debit)\b/.test(t)) return 'atm_withdrawal'
  if (/\b(transfer|neft|rtgs|imps|fund\s*transfer|wire\s*transfer)\b/.test(t)) return 'transfer'
  if (category === 'subscriptions') return 'subscription'
  return 'debit'
}

// ============================================================
// PAYMENT MODE DETECTION (maps to DB payment_mode column)
// ============================================================
type PaymentMode = 'upi' | 'credit_card' | 'debit_card' | 'neft' | 'rtgs' | 'imps' | 'atm' | 'net_banking' | 'nach' | 'wallet' | 'cheque' | 'unknown'

function detectPaymentMode(text: string): PaymentMode {
  const t = text.toLowerCase()
  if (/\bupi\b/.test(t) || /@[a-z]+/i.test(t)) return 'upi'
  if (/\bcredit\s*card\b|\bcc\b/.test(t)) return 'credit_card'
  if (/\bdebit\s*card\b/.test(t)) return 'debit_card'
  if (/\bneft\b/.test(t)) return 'neft'
  if (/\brtgs\b/.test(t)) return 'rtgs'
  if (/\bimps\b/.test(t)) return 'imps'
  if (/\b(nach|auto\s*debit|ecs|mandate)\b/.test(t)) return 'nach'
  if (/\batm\s*withdrawal\b|\bcash\s*withdrawal\b/.test(t)) return 'atm'
  if (/\b(net\s*banking|internet\s*banking|netbanking)\b/.test(t)) return 'net_banking'
  if (/\b(wallet|paytm\s*wallet|phonepe\s*wallet|freecharge|mobikwik)\b/.test(t)) return 'wallet'
  if (/\bcheque\b|\bcheque\s*no\b/.test(t)) return 'cheque'
  // NOTE: Bare "card" (e.g. "Dear Card Holder", "card linked") must NOT default to credit_card.
  // Only explicit "credit card" or "debit card" keywords trigger card classification above.
  return 'unknown'
}

// ============================================================
// CARD LAST-4 EXTRACTION
// ============================================================
function getLastMatchIndex(preText: string, regex: RegExp): number {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g')
  let match
  let lastIndex = -1
  while ((match = globalRegex.exec(preText)) !== null) {
    lastIndex = match.index
  }
  return lastIndex
}

function extractCardLast4(text: string): string | null {
  // Find all occurrences of 4-digit sequences in the text
  const candidateRegex = /(?:^|\D)(?:[xX*]+-?)*\s*(\d{4})\b/g
  let match
  const candidates: { digits: string; index: number }[] = []
  
  while ((match = candidateRegex.exec(text)) !== null) {
    const digits = match[1]
    const idx = match.index + match[0].indexOf(digits)
    candidates.push({
      digits,
      index: idx
    })
  }

  for (const candidate of candidates) {
    const digits = candidate.digits
    const idx = candidate.index

    // Sanity check 1: Reject obvious non-card numbers (years)
    const val = parseInt(digits, 10)
    if (val >= 2020 && val <= 2035) continue

    // Extract local context around the candidate
    const preText = text.substring(Math.max(0, idx - 60), idx)

    // Check if it is masked (e.g. xx1234, *1234, -1234)
    const isMasked = /[xX*]+-?\s*$/.test(preText)

    // Look for keywords in the preceding context
    const cardRegex = /\b(card|cc|credit|debit|visa|mastercard|mc|rupay|amex|diners|sbicard|sbi-card)\b/i
    const accountRegex = /\b(a\/c|account|acct|acc|savings|current|deposit|loan|wallet)\b/i
    const refRegex = /\b(ref\s*(?:no\.?|num(?:ber)?)?|reference\s*(?:no\.?|num(?:ber)?)?|txn\s*id|transaction\s*id|utr|otp|code|pin)\b/i

    // We calculate distance from the candidate to the last occurrence of each keyword.
    const cardLastIdx = getLastMatchIndex(preText, cardRegex)
    const accountLastIdx = getLastMatchIndex(preText, accountRegex)
    const refLastIdx = getLastMatchIndex(preText, refRegex)

    const cardDist = cardLastIdx !== -1 ? preText.length - cardLastIdx : Infinity
    const accountDist = accountLastIdx !== -1 ? preText.length - accountLastIdx : Infinity
    const refDist = refLastIdx !== -1 ? preText.length - refLastIdx : Infinity

    // Strict validation rules:
    // 1. If an account keyword is closer to the candidate than any card keyword, reject as it is a bank account number.
    if (accountDist < cardDist) continue

    // 2. If a reference/transaction ID/OTP/code keyword is closer to the candidate than any card keyword, reject.
    if (refDist < cardDist) continue

    // 3. To prevent random 4-digit numbers (like amounts, times, or PIN codes) from matching,
    // we require either:
    //    a) The number is masked (e.g. xx1234 or *1234)
    //    b) There is an explicit card keyword (e.g. "card", "visa", etc.) or "ending in"/"ends" within the close preceding context (distance <= 40).
    const endsMatch = preText.match(/\b(ending|ends)\s*(?:in\s*)?$/i)
    const hasEnds = !!endsMatch

    if (!isMasked && cardDist > 40 && !hasEnds) {
      continue
    }

    // 4. Double check that it's not preceded by A/c or account words even if further away, if there is no card keyword.
    if (cardDist === Infinity && accountDist !== Infinity) continue
    if (cardDist === Infinity && refDist !== Infinity) continue

    // If we passed all checks, this is our card!
    return digits
  }

  return null
}

// ============================================================
// MERCHANT EXTRACTION
// ============================================================
function extractMerchantFromSnippet(snippet: string): { name: string; category: string; description: string } | null {
  for (const km of KNOWN_MERCHANTS) {
    if (km.pattern.test(snippet)) return { name: km.name, category: km.category, description: km.description }
  }
  return null
}

function extractDynamicMerchant(snippet: string): string {
  const patterns = [
    /(?:transferred|sent|paid)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?[0-9,]+(?:\.[0-9]+)?\s+to\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:debited|charged)\s+(?:Rs\.?\s*|INR\s*|₹\s*)?[0-9,]+(?:\.[0-9]+)?\s+(?:at|on|for)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:merchant|vendor|biller|payee|recipient)[:\s]+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\r|\n|$))/i,
    /(?:info|narration|remarks)[:\s\-]+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:credited|received|refunded)\s+.*?\s+from\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+on|\s+via|\s+using|\s*$))/i,
    /(?:paid\s+to|transfer(?:red)?\s+to|debited\s+to|txn\s+to|payment\s+to|sent\s+to)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI\s*Ref|\s+on|\s+at|\s+ref|\s+for|\s+via|\s*$))/i,
    /(?:spent\s+at|debited\s+at|purchased\s+at|payment\s+at|charged\s+at|(?:^|\s)at)\s+([A-Za-z0-9][\w\s&.\-]{1,30}?)(?:\s*(?:\.|,|\s+Ref|\s+UPI\s*Ref|\s+on|\s+ref|\s+for|\s+via|\s*$))/i,
    /to\s+([A-Z][A-Z0-9\s&]{2,25}?)(?:\s*\.?\s*(?:Ref|UPI|ref|$))/,
    /VPA[:\s]+([a-z0-9._]+)@/i,
    /Info[:\s]+([A-Za-z0-9][\w\s&.\-]{2,25})/i,
  ]
  for (const pattern of patterns) {
    const match = snippet.match(pattern)
    if (match && match[1]) {
      let merchant = match[1].trim()
        .replace(/\b(ref|on|using|by|upi|refno|xx|account|ref\s*no|UPI\s*Ref)\b.*/i, '')
        .trim()
      if (merchant.length < 2) continue
      if (/^(rs|inr|the|and|for|was|ref|upi)$/i.test(merchant)) continue
      return merchant
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    }
  }
  return ''
}

function generateDescription(merchant: string, snippet: string, type: 'debit' | 'credit'): string {
  const known = extractMerchantFromSnippet(snippet)
  if (known) return known.description
  if (merchant && merchant.length > 1) {
    const cleanMerchant = merchant.replace(/(?:outflow|ride|sub|rides|alert|payment|fashion|pos|txn|ref|order)/gi, '').trim()
    return type === 'credit' ? `${cleanMerchant || 'Incoming'} Credit` : `${cleanMerchant || 'Payment'} Transaction`
  }
  if (type === 'credit') {
    if (/salary|credited by/i.test(snippet)) return 'Salary Credit'
    if (/refund/i.test(snippet)) return 'Refund Credit'
    if (/cashback/i.test(snippet)) return 'Cashback Credit'
    return 'Incoming Credit'
  }
  if (/emi/i.test(snippet)) return 'EMI Debit'
  if (/insurance/i.test(snippet)) return 'Insurance Premium'
  if (/mutual\s*fund|sip/i.test(snippet)) return 'Investment SIP Debit'
  if (/loan/i.test(snippet)) return 'Loan Repayment'
  if (/atm/i.test(snippet)) return 'ATM Cash Withdrawal'
  return 'Bank Transaction'
}

const GENERIC_MERCHANT_PATTERNS = [
  /auto\s*detected/i, /retail\s*transaction/i, /payment\s*transaction/i,
  /bank\s*transaction/i, /^merchant$/i, /^payment$/i, /^transaction$/i,
]

// ============================================================
// LAYER 5 — CONFIDENCE SCORING ENGINE
// ============================================================
interface ConfidenceSignals {
  trustedSender: boolean
  hardAcceptSubject: boolean
  hasTransactionKeyword: boolean
  hasAmount: boolean
  hasMerchant: boolean
  hasPaymentMode: boolean
  hasReferenceId: boolean
  isLargeAmount: boolean   // > 1L — slight sanity penalty
  debitCreditClear: boolean // debit/credit score gap is >= 15
}

function computeConfidence(signals: ConfidenceSignals): number {
  let score = 0
  if (signals.trustedSender) score += 35
  if (signals.hardAcceptSubject) score += 20 // increased from 15
  if (signals.hasTransactionKeyword) score += 20
  if (signals.hasAmount) score += 15
  if (signals.hasMerchant) score += 10 // increased from 5
  if (signals.hasPaymentMode) score += 5
  if (signals.hasReferenceId) score += 5
  if (signals.debitCreditClear) score += 5
  
  if (!signals.trustedSender) {
    score -= 15 // reduced penalty from -30 to -15
  }
  if (signals.isLargeAmount) score -= 5
  return Math.max(0, Math.min(100, score))
}

// ============================================================
// UTILITY — Base64 URL Decoder
// ============================================================
function decodeBase64Url(str: string): string {
  if (!str) return ''
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const pad = base64.length % 4
  if (pad) {
    if (pad === 1) return ''
    base64 += new Array(5 - pad).join('=')
  }
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

function extractEmailBody(mail: any): string {
  if (!mail || !mail.payload) return mail?.snippet || ''
  let plainText = ''
  let htmlText = ''

  function traverseParts(part: any) {
    if (!part) return
    const mimeType = part.mimeType || ''
    const bodyData = part.body?.data || ''
    if (mimeType === 'text/plain' && bodyData) plainText += decodeBase64Url(bodyData) + '\n'
    else if (mimeType === 'text/html' && bodyData) htmlText += decodeBase64Url(bodyData) + '\n'
    if (part.parts && Array.isArray(part.parts)) part.parts.forEach(traverseParts)
  }

  traverseParts(mail.payload)
  if (plainText.trim()) return plainText.trim()
  if (htmlText.trim()) {
    try {
      const doc = new DOMParser().parseFromString(htmlText, 'text/html')
      const textContent = doc.body.textContent || doc.body.innerText || ''
      if (textContent.trim()) return textContent.trim()
    } catch {
      const textContent = htmlText.replace(/<[^>]*>/g, ' ')
      if (textContent.trim()) return textContent.trim()
    }
  }
  return mail.snippet || ''
}

/** Fetch recent scan logs */
export async function getScanLogs() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }
  const { data, error } = await supabase
    .from('email_scan_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false })
    .limit(5)
  return { data: data as EmailScanLog[] | null, error }
}

// ============================================================
// MAIN ENGINE — Scan Real Gmail Inbox (V2)
// ============================================================
export async function scanRealGmailInbox() {
  // ── TOKEN RESOLUTION ──
  // Use the googleAuth service as single source of truth.
  // getGoogleToken() checks expiry client-side before returning.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  // If the session still has provider_token (right after OAuth redirect),
  // save it with a fresh expiry so the 55-min clock resets.
  if (session?.provider_token) {
    saveGoogleToken(session.provider_token)
  }

  // Now read the authoritative token (may come from session or localStorage)
  const providerToken = session?.provider_token || getGoogleToken()

  if (!user) return { data: null, error: new Error('User not authenticated') }
  if (!providerToken) {
    return {
      data: null,
      error: new Error('Google account not connected. Please click "Connect Google Account" to authorise Gmail scanning.'),
    }
  }

  try {
    // ── RATE LIMIT CHECK ──
    // Owner email gets unlimited scans.
    // All other users are limited to 1 successful scan per 24 hours.
    const cleanEmail = user.email?.toLowerCase().trim() || ''
    const isOwner = OWNER_EMAILS.some(e => e.toLowerCase().trim() === cleanEmail)
    if (!isOwner) {
      const { data: recentScanLogs } = await supabase
        .from('email_scan_logs')
        .select('scanned_at')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)

      if (recentScanLogs && recentScanLogs.length > 0) {
        const lastScanTime = new Date(recentScanLogs[0].scanned_at).getTime()
        const hoursSinceLastScan = (Date.now() - lastScanTime) / (60 * 60 * 1000)
        if (hoursSinceLastScan < 24) {
          const hoursLeft = Math.ceil(24 - hoursSinceLastScan)
          return {
            data: null,
            error: new Error(`Scan limit reached. Next scan available in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. All transactions from your last scan are already captured.`),
          }
        }
      }
    }



    // Fetch user's registered cards/accounts and past approved transactions to map last4 digits to issuers dynamically
    const [{ data: registeredCards }, { data: pastCards }] = await Promise.all([
      supabase.from('cards').select('last4, issuer').eq('user_id', user.id),
      supabase.from('transactions').select('card_last4, card_issuer').eq('user_id', user.id).eq('approval_status', 'approved').not('card_last4', 'is', null).not('card_issuer', 'is', null)
    ])

    const cardMap: Record<string, string> = {}
    if (registeredCards) {
      registeredCards.forEach(c => {
        if (c.last4 && c.issuer) cardMap[c.last4] = c.issuer
      })
    }
    if (pastCards) {
      pastCards.forEach(c => {
        if (c.card_last4 && c.card_issuer) cardMap[c.card_last4] = c.card_issuer
      })
    }


    // Fetch active financial year (default to 2026)
    let activeYear = 2026
    try {
      const storedYear = localStorage.getItem(`dhanrakshak_active_financial_year_${user.id}`)
      if (storedYear) {
        activeYear = parseInt(storedYear, 10)
      }
    } catch (e) {
      console.warn('Failed to load active year from localStorage, using default 2026', e)
    }

    const today = new Date()
    const activeYearEnd = new Date(`${activeYear}-12-31T23:59:59Z`)
    if (today > activeYearEnd) {
      return {
        data: null,
        error: new Error(`Financial Year ${activeYear} has ended. Please start the new financial year in settings to resume tracking.`)
      }
    }

    // Check if this is the user's first successful email scan
    let isFirstScan = true
    try {
      const { data: logs } = await supabase
        .from('email_scan_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .limit(1)
      if (logs && logs.length > 0) {
        isFirstScan = false
      }
    } catch (e) {
      console.warn('Failed to query email scan logs, assuming first scan', e)
    }

    let startLimitTime = 0
    let q = ''
    if (isFirstScan) {
      // First scan: last 7 days lookback window
      startLimitTime = Date.now() - 7 * 24 * 60 * 60 * 1000
      const startLimitDate = new Date(startLimitTime)
      const yyyy = startLimitDate.getFullYear()
      const mm = String(startLimitDate.getMonth() + 1).padStart(2, '0')
      const dd = String(startLimitDate.getDate()).padStart(2, '0')
      
      q = `after:${yyyy}/${mm}/${dd} (debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)`
    } else {
      // Subsequent scans: full calendar year (Jan 1 to Dec 31 of active year)
      startLimitTime = new Date(`${activeYear}-01-01T00:00:00Z`).getTime()
      // Gmail before is exclusive, so before:YYYY-01-01 matches up to Dec 31
      q = `after:${activeYear}/01/01 before:${activeYear + 1}/01/01 (debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)`
    }

    // --- Fetch message list ---
    let messages: { id: string; threadId: string }[] = []
    let nextPageToken = ''

    do {
      // Owner gets up to 200 messages for full coverage; others get 100
      const maxResults = isOwner ? 200 : 100
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })

      if (listRes.status === 401) {
        // Token is expired — clear from storage so UI updates to "disconnected"
        clearGoogleToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)

      const listData = await listRes.json()
      if (listData.messages) messages = messages.concat(listData.messages)
      const messageLimit = isOwner ? 200 : 100
      if (messages.length >= messageLimit) { messages = messages.slice(0, messageLimit); break }
      nextPageToken = listData.nextPageToken || ''
    } while (nextPageToken)

    if (messages.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({ user_id: user.id, emails_processed: 0, transactions_found: 0, status: 'success' })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }

    // --- Fetch full message details in parallel batches ---
    const batchSize = 15
    const validDetails: any[] = []
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (m: { id: string }) => {
          try {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
              { headers: { Authorization: `Bearer ${providerToken}` } }
            )
            if (!res.ok) return null
            return await res.json()
          } catch { return null }
        })
      )
      validDetails.push(...batchResults.filter(Boolean))
    }

    // --- Fetch existing message IDs + reference IDs for dedup ---
    const { data: existingTxns } = await supabase
      .from('transactions')
      .select('email_message_id, reference_id')
      .eq('user_id', user.id)

    const existingMessageIds = new Set<string>(existingTxns?.map((t) => t.email_message_id).filter((id): id is string => !!id))
    const existingRefIds = new Set<string>(existingTxns?.map((t) => t.reference_id).filter((r): r is string => !!r))

    // --- Parse Engine ---
    const transactionsToInsert: TransactionInsert[] = []
    let skippedConfidence = 0

    for (const mail of validDetails) {
      const mailMessageId: string = mail.id || ''

      // Primary dedup: skip if we've already processed this Gmail message
      if (mailMessageId && existingMessageIds.has(mailMessageId)) continue

      // Date check early
      const mailTime = mail.internalDate ? Number(mail.internalDate) : Date.now()
      if (mailTime < startLimitTime) continue
      const mailDate = new Date(mailTime).toISOString().split('T')[0]
      if (mailDate < `${activeYear}-01-01`) continue
      if (mailDate > `${activeYear}-12-31`) continue

      const bodyText = extractEmailBody(mail)
      const headers = mail.payload?.headers || []
      const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')
      const subject = subjectHeader?.value || ''
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')
      const fromValue: string = fromHeader?.value || ''
      const fullText = `${subject} ${bodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)

      let parsedTxn: TransactionInsert | null = null

      // Try AI verification first if API key is present
      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || ''
      if (geminiApiKey) {
        try {
          const aiResult = await analyzeTransactionEmailWithAI(subject, bodyText, mailDate)
          if (aiResult) {
            if (aiResult.is_transaction && aiResult.amount && aiResult.amount > 0) {
              // Deduplicate by reference ID if AI extracted one
              if (aiResult.reference_id && existingRefIds.has(aiResult.reference_id)) {
                continue
              }

              // Determine category & approval status from db learning engine
              const resolvedMerchant = aiResult.merchant || 'Other'
              let ruleResult
              try {
                ruleResult = await applyMerchantRulesFromDB(user.id, resolvedMerchant, bodyText, aiResult.category || 'other')
              } catch {
                ruleResult = { category: aiResult.category || 'other', approval_status: 'pending', confidence: aiResult.confidence_score }
              }

              // Apply auto-approval logic if the merchant matches past approvals (70% confidence)
              let approval_status = ruleResult.approval_status
              if (ruleResult.confidence >= 70 && ruleResult.matchReason?.startsWith('DB rule:')) {
                approval_status = 'approved'
              }

              parsedTxn = {
                user_id: user.id,
                amount: aiResult.amount,
                type: aiResult.transaction_type || 'debit',
                category: ruleResult.category,
                merchant: resolvedMerchant,
                description: aiResult.description || `${resolvedMerchant} Transaction`,
                notes: emailContentForParsing,
                date: aiResult.date || mailDate,
                source: 'email',
                approval_status: approval_status as 'approved' | 'pending' | 'rejected',
                reference_id: aiResult.reference_id,
                payment_mode: (aiResult.payment_mode || 'unknown') as any,
                card_last4: aiResult.card_last4,
                card_issuer: aiResult.card_issuer,
                confidence_score: aiResult.confidence_score,
                event_type: aiResult.transaction_type || 'debit',
                email_message_id: mailMessageId || null,
              }
            } else {
              // AI confirmed this is NOT a completed transaction — skip
              continue
            }
          }
        } catch (aiErr) {
          console.warn('[emailScanner] AI parsing failed, falling back to heuristics:', aiErr)
        }
      }

      if (!parsedTxn) {
        // ── LAYER 1: SENDER DOMAIN CHECK ──
        const senderDomainMatch = fromValue.match(/@([\w.-]+)>?/i)
        const senderDomain = senderDomainMatch ? senderDomainMatch[1].toLowerCase() : ''
        const isTrustedSender = TRUSTED_SENDER_DOMAINS.has(senderDomain) ||
          [...TRUSTED_SENDER_DOMAINS].some(d => senderDomain.endsWith('.' + d))

        // ── LAYER 2: SUBJECT LINE FILTER ──
        const isHardRejected = HARD_REJECT_SUBJECT_PATTERNS.some(p => p.test(subject))
        if (isHardRejected) continue

        const isHardAccepted = HARD_ACCEPT_SUBJECT_PATTERNS.some(p => p.test(subject))

        // ── GLOBAL PROMOTION / SPAM FILTER ──
        const isPromotionalSpam = /\b(?:promo(?:tion)?|coupon|unsubscribe|shop\s+now|buy\s+now|special\s+offer|limited\s+period|earn\s+cashback|get\s+cashback|cashback\s+on\s+your\s+next|exclusive\s+deal)\b/i.test(emailContentForParsing)
        if (isPromotionalSpam) continue

        // ── CONTENT FILTERS (only skip if NOT hard-accepted) ──
        if (!isHardAccepted) {
          if (/\b(?:declined|failed|unsuccessful|initiated|requested|rejected|cancelled|void|voided)\b/i.test(emailContentForParsing)) continue
          if (/\b(?:otp|one\s*time\s*pass(?:word|code)|verification\s*code|verification\s*pin|passcode|security\s*pin|security\s*code|m-?pin|t-?pin|2fa|two\s*factor|auth\s*code|do\s*not\s*share)\b/i.test(emailContentForParsing)) continue
          if (/\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement|e-?statement|estatement)\b/i.test(emailContentForParsing)) continue
          if (/(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|auto-?debit\s+has\s+been\s+scheduled|is\s+scheduled\s+for)/i.test(emailContentForParsing)) continue
          if (/\b(?:policy\s+update|security\s+policy|terms\s+of\s+service|agreement\s+update|privacy\s+update|will\s+not\s+be\s+charged|no\s+charges\s+apply)\b/i.test(emailContentForParsing)) continue
        }

        // ── LAYER 3: AMOUNT DETECTION ──
        const amountMatches: { value: number; index: number; text: string }[] = []
        const prefixRegex = /(?:Rs\.?\s*|INR\s*|₹\s*|Rupees?\s*)([0-9,]+(?:\.[0-9]{1,2})?)/gi
        const suffixRegex = /\b([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|INR|₹|Rupees?)/gi
        let amtMatch
        while ((amtMatch = prefixRegex.exec(emailContentForParsing)) !== null) {
          const value = Number(amtMatch[1].replace(/,/g, ''))
          if (!isNaN(value) && value > 0 && value <= 99999999) amountMatches.push({ value, index: amtMatch.index, text: amtMatch[0] })
        }
        while ((amtMatch = suffixRegex.exec(emailContentForParsing)) !== null) {
          const value = Number(amtMatch[1].replace(/,/g, ''))
          if (!isNaN(value) && value > 0 && value <= 99999999) amountMatches.push({ value, index: amtMatch.index, text: amtMatch[0] })
        }

        if (amountMatches.length === 0) continue

        // Filter balance/limit amounts
        const filteredAmounts = amountMatches.filter(m => {
          const preStart = Math.max(0, m.index - 30)
          const precedingText = emailContentForParsing.substring(preStart, m.index).toLowerCase()
          const postEnd = Math.min(emailContentForParsing.length, m.index + m.text.length + 20)
          const succeedingText = emailContentForParsing.substring(m.index + m.text.length, postEnd).toLowerCase()
          return !(/bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger|total\s+due|minimum\s+due/i.test(precedingText) ||
            /bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger/i.test(succeedingText))
        })

        if (filteredAmounts.length === 0) continue

        // Pick amount closest to transaction keyword
        const txKeywordsRe = /debited|spent|paid|withdrawn|txn|charged|payment|credited|received|added|refund|transfer|neft|imps|rtgs/i
        let amount = filteredAmounts[0].value
        let resolvedMatch = filteredAmounts[0]

        if (filteredAmounts.length > 1) {
          let minDistance = Infinity
          filteredAmounts.forEach((m) => {
            const ctx = emailContentForParsing.substring(Math.max(0, m.index - 80), Math.min(emailContentForParsing.length, m.index + m.text.length + 80))
            const kw = ctx.match(txKeywordsRe)
            if (kw && kw.index !== undefined) {
              const distance = Math.abs(kw.index - (m.index - Math.max(0, m.index - 80)))
              if (distance < minDistance) { minDistance = distance; amount = m.value; resolvedMatch = m }
            }
          })
        }

        if (isNaN(amount) || amount <= 0) continue

        // ── DEBIT / CREDIT CLASSIFICATION ──
        const winStart = Math.max(0, resolvedMatch.index - 120)
        const winEnd = Math.min(emailContentForParsing.length, resolvedMatch.index + resolvedMatch.text.length + 120)
        const windowContent = emailContentForParsing.substring(winStart, winEnd).toLowerCase()
        const lowerContent = emailContentForParsing.toLowerCase()

        const debitWords = ['debited', 'debited for', 'spent', 'paid', 'paid to', 'withdrawn', 'charged', 'payment to', 'sent to', 'transfer to', 'purchased at', 'debit']
        const creditWords = ['credited', 'credited to', 'received', 'received from', 'added', 'refund', 'refunded', 'cashback', 'deposited', 'salary', 'credit', 'reversed']

        let debitScore = 0, creditScore = 0
        debitWords.forEach(w => { if (windowContent.includes(w)) debitScore += 10 })
        creditWords.forEach(w => { if (windowContent.includes(w)) creditScore += 10 })

        if (debitScore === 0 && creditScore === 0) {
          debitWords.forEach(w => { if (lowerContent.includes(w)) debitScore += 5 })
          creditWords.forEach(w => { if (lowerContent.includes(w)) creditScore += 5 })
        }

        if (debitScore === 0 && creditScore === 0) continue

        const txType: 'debit' | 'credit' = creditScore > debitScore ? 'credit' : 'debit'
        const debitCreditClear = Math.abs(debitScore - creditScore) >= 10

        // MINIMUM AMOUNT GATE
        if (amount < 10 && txType === 'credit') {
          if (!/salary|refund|reversed/i.test(emailContentForParsing)) continue
        }
        if (amount < 1) continue

        // ── PAYMENT MODE & CARD METADATA ──
        const paymentMode = detectPaymentMode(emailContentForParsing)
        const cardLast4 = extractCardLast4(emailContentForParsing)
        let cardIssuer = extractBankName(emailContentForParsing) || null
        if (!cardIssuer && cardLast4 && cardMap[cardLast4]) {
          cardIssuer = cardMap[cardLast4]
        }

        // ── MERCHANT EXTRACTION ──
        const knownMerchant = extractMerchantFromSnippet(fullText)
        const dynamicMerchant = extractDynamicMerchant(emailContentForParsing)
        const subjectMerchant = subject ? extractDynamicMerchant(subject) : ''

        let merchant = ''
        let category = 'other'
        let description = ''

        if (knownMerchant) {
          merchant = knownMerchant.name; category = knownMerchant.category; description = knownMerchant.description
        } else if (dynamicMerchant) {
          merchant = dynamicMerchant
        } else if (subjectMerchant) {
          merchant = subjectMerchant
        }

        if (!merchant) {
          if (subject) {
            const subjectKnown = extractMerchantFromSnippet(subject)
            if (subjectKnown) { merchant = subjectKnown.name; category = subjectKnown.category; description = subjectKnown.description }
          }
          if (!merchant && fromValue) {
            const displayNameMatch = fromValue.match(/^([^<]+)</)
            if (displayNameMatch) {
              const senderName = displayNameMatch[1].trim()
              if (senderName.length > 2 && !/alert|noreply|no-reply|notification|update|info|support|bank/i.test(senderName)) {
                merchant = senderName
                  .replace(/\b(bank|alerts?|notifications?|noreply)\b/gi, '').trim()
                  .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
              }
            }
          }
        }

        const isGenericMerchant = !merchant || merchant.length < 2 || GENERIC_MERCHANT_PATTERNS.some(p => p.test(merchant))
        if (isGenericMerchant) {
          const bankName = cardIssuer || extractBankName(emailContentForParsing)
          if (bankName) {
            merchant = bankName.toLowerCase().includes('bank') ? bankName : `${bankName} Bank`
          } else {
            merchant = txType === 'credit' ? 'Incoming Credit' : 'Bank Transaction'
          }
        }
        if (!description) description = generateDescription(merchant, emailContentForParsing, txType)

        // ── REFERENCE ID ──
        const refMatch = emailContentForParsing.match(
          /(?:UPI\s*(?:Ref(?:\.?\s*No\.?)?|Txn\s*ID|Transaction\s*ID)[:\s]*([0-9]{10,20}))|(?:(?:Ref(?:\.?\s*No\.?)?|RefNo|Transaction\s*(?:ID|Ref))[:\s]*([0-9]{6,20}))/i
        )
        const reference_id = refMatch ? (refMatch[1] || refMatch[2]) : null

        if (reference_id && existingRefIds.has(reference_id)) continue

        // ── LAYER 4: EVENT TYPE ──
        let ruleResult: RuleMatchResult
        try {
          ruleResult = await applyMerchantRulesFromDB(user.id, merchant, emailContentForParsing, category)
        } catch {
          ruleResult = applyMerchantRules(merchant, emailContentForParsing, category)
        }

        let finalApprovalStatus = ruleResult.approval_status
        if (ruleResult.confidence >= 70 && ruleResult.matchReason.startsWith('DB rule:')) {
          finalApprovalStatus = 'approved'
        }

        const { category: finalCategory } = ruleResult
        const approval_status = finalApprovalStatus
        const eventType = classifyEventType(emailContentForParsing, txType, finalCategory)

        // ── LAYER 5: CONFIDENCE SCORING ──
        const confidence = computeConfidence({
          trustedSender: isTrustedSender,
          hardAcceptSubject: isHardAccepted,
          hasTransactionKeyword: debitScore > 0 || creditScore > 0,
          hasAmount: true,
          hasMerchant: !isGenericMerchant,
          hasPaymentMode: paymentMode !== 'unknown',
          hasReferenceId: !!reference_id,
          isLargeAmount: amount > 100000,
          debitCreditClear,
        })

        // CONFIDENCE GATE: only insert if confidence >= 55
        if (confidence < 55) {
          skippedConfidence++
          continue
        }

        parsedTxn = {
          user_id: user.id,
          amount,
          type: txType,
          category: finalCategory,
          merchant,
          description,
          notes: emailContentForParsing,
          date: mailDate,
          source: 'email',
          approval_status,
          reference_id,
          payment_mode: paymentMode,
          card_last4: cardLast4,
          card_issuer: cardIssuer,
          confidence_score: confidence,
          event_type: eventType,
          email_message_id: mailMessageId || null,
        }
      }

      if (parsedTxn) {
        transactionsToInsert.push(parsedTxn)
      }
    }

    if (transactionsToInsert.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
          error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (low confidence)` : null,
        })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }

    // ── INSERT TRANSACTIONS ──
    const { data: insertedTxns, error: txnError } = await supabase
      .from('transactions')
      .insert(transactionsToInsert)
      .select()

    if (txnError) throw txnError

    // ── UPSERT CONFIRMED CARDS to cards table ──
    // Disabled: Cards feature is removed per user request.
    try {
      // Cards sync disabled
    } catch (cardErr) {
      console.warn('Card upsert failed (disabled):', cardErr)
    }

    // ── LOG SCAN ──
    const { data: scanLog, error: logError } = await supabase
      .from('email_scan_logs')
      .insert({
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: transactionsToInsert.length,
        status: 'success',
        error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (confidence < 55)` : null,
      })
      .select().single()

    if (logError) throw logError

    const autoApprovedCount = transactionsToInsert.filter((t) => t.approval_status === 'approved').length

    return {
      data: {
        transactions: insertedTxns,
        log: scanLog as EmailScanLog,
        autoApprovedCount,
        skippedConfidence,
      },
      error: null,
    }
  } catch (err: any) {
    console.error('Error scanning Gmail:', err)

    let errorMessage: string
    if (err.message === 'TOKEN_EXPIRED') {
      errorMessage = 'Your Google session expired. Please click "Reconnect Google" to get a fresh token and try again.'
    } else if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
      errorMessage = 'Could not reach Google APIs. Check your internet connection or disable any ad-blockers / Brave shields that may be blocking Google requests.'
    } else {
      errorMessage = err.message || 'Gmail scan failed. Please try again.'
    }

    await supabase.from('email_scan_logs').insert({
      user_id: user.id,
      emails_processed: 0,
      transactions_found: 0,
      status: 'failed',
      error_message: errorMessage,
    })
    return { data: null, error: new Error(errorMessage) }
  }
}

/**
 * Calculate the next scheduled refresh time (always 6:00 AM today or tomorrow)
 */
export function getNextRefreshTime(): Date {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0)
  if (now.getTime() >= next.getTime()) next.setDate(next.getDate() + 1)
  return next
}

/**
 * Calculate the last scheduled refresh time (always 6:00 AM today or yesterday)
 */
export function getLastScheduledRefreshTime(): Date {
  const now = new Date()
  const todaySix = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0)
  if (now.getTime() >= todaySix.getTime()) return todaySix
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 6, 0, 0, 0)
}
