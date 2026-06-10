// ============================================
// Email Scanner Service V2 — Dhanrakshak
// 5-Layer Financial Intelligence Engine
// Priority: Accuracy > Speed > Coverage
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'
import { extractBankName } from '@/utils'
import { applyMerchantRulesFromDB } from './learningEngine'
import { getGoogleToken, clearGoogleToken } from './googleAuth'
import { analyzeTransactionEmailWithAI } from './aiService'
import { normalizeMerchant } from './merchantNormalizer'
import { checkScannerAccess } from './scannerGate'

type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

// ============================================================
// OWNER EMAILS — get unlimited scans. All other users are
// capped to 1 scan per 24 hours.
// Set VITE_OWNER_EMAILS as a comma-separated list in your .env file.
// ============================================================
const OWNER_EMAILS = (import.meta.env.VITE_OWNER_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean)

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
  // Statements and summaries
  /\b(statement|e-?statement|monthly\s*statement|account\s*statement|credit\s*card\s*statement)\b/i,
  // Newsletters and promotions
  /\b(newsletter|unsubscribe|promotion|promotional|offer|coupon|deal|voucher|promo\s*code|discount\s*code)\b/i,
  // Cashback OFFERS (not credits) and reward points
  /\b(cashback\s*offer|cashback\s*on\s*your|earn\s*cashback|get\s*cashback|flat\s*\d+%\s*off)\b/i,
  /\b(reward\s*points?|loyalty\s*points?|bonus\s*points?|points?\s*earned|points?\s*credited|you.ve\s*earned)\b/i,
  // Sale and festival promotions
  /\b(sale|big\s*billion|great\s*indian|festive\s*offer|mega\s*sale|flash\s*sale|bumper\s*sale|end\s*of\s*season)\b/i,
  /\b(limited\s*(time|period|offer)|exclusive\s*(offer|deal)|special\s*(offer|deal))\b/i,
  // Welcome and onboarding
  /\b(welcome|onboarding|activate\s*your|verify\s*your\s*email|confirm\s*your)\b/i,
  // Policy and terms updates
  /\b(policy\s*update|terms\s*of\s*service|privacy\s*update|security\s*update|agreement\s*update)\b/i,
  // Bills due and reminders
  /\b(minimum\s*due|payment\s*due|bill\s*generated|overdue|payable\s*by|due\s*date|bill\s*reminder)\b/i,
  // Scheduled/future payments (not yet executed)
  /\b(auto-?debit\s*scheduled|standing\s*instruction|pre-?authorized|will\s*be\s*debited)\b/i,
  // Balance and limit alerts
  /\b(balance\s*(update|alert|notification)|available\s*balance|account\s*balance|credit\s*limit)\b/i,
  // Pre-approved offers
  /\b(pre-?approved|credit\s*limit\s*(increase|enhanced|boost)|upgrade\s*your\s*card|loan\s*offer)\b/i,
  // Inactivity / security notices
  /\b(your\s*account\s*has\s*been|account\s*locked|suspicious\s*activity|unusual\s*login)\b/i,
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
  if (/\bcredit\s*card\b|\bcc\b/.test(t)) return 'credit_card'
  if (/\bdebit\s*card\b/.test(t)) return 'debit_card'

  const hasUpiVpa = (() => {
    const matches = t.match(/[\w.-]+@[\w.-]+/g)
    if (!matches) return false
    for (const m of matches) {
      if (/\b(care|support|reply|noreply|alerts|help|info|service|contact|feedback|queries|security)@/.test(m)) continue
      if (/\.(com|in|net|org|edu|gov|co|info|biz|co\.in|org\.in|net\.in)$/.test(m)) continue
      return true
    }
    return false
  })()
  if (/\b(?:upi|vpa)\b/.test(t) || hasUpiVpa) return 'upi'

  if (/\bneft\b/.test(t)) return 'neft'
  if (/\brtgs\b/.test(t)) return 'rtgs'
  if (/\bimps\b/.test(t)) return 'imps'
  if (/\b(nach|auto\s*debit|ecs|mandate)\b/.test(t)) return 'nach'
  if (/\batm\s*withdrawal\b|\bcash\s*withdrawal\b/.test(t)) return 'atm'
  if (/\b(net\s*banking|internet\s*banking|netbanking)\b/.test(t)) return 'net_banking'
  if (/\b(wallet|paytm\s*wallet|phonepe\s*wallet|freecharge|mobikwik)\b/.test(t)) return 'wallet'
  if (/\bcheque\b|\bcheque\s*no\b/.test(t)) return 'cheque'
  return 'unknown'
}

// ============================================================
// CARD BRAND DETECTION
// ============================================================
type CardBrand = 'Visa' | 'Mastercard' | 'RuPay' | 'American Express' | 'Diners'

function detectCardBrand(text: string): CardBrand | null {
  if (/\b(amex|american\s*express)\b/i.test(text)) return 'American Express'
  if (/\b(diners\s*club|diners)\b/i.test(text)) return 'Diners'
  if (/\b(rupay|ru\s*pay)\b/i.test(text)) return 'RuPay'
  if (/\b(mastercard|master\s*card)\b/i.test(text)) return 'Mastercard'
  if (/\bvisa\b/i.test(text)) return 'Visa'
  return null
}

// ============================================================
// TRANSACTION TIME EXTRACTION
// ============================================================
function extractTransactionTime(text: string): string | null {
  // 12-hour format: 8:45 PM, 08:45 AM
  const amPmMatch = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)\b/)
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10)
    const m = amPmMatch[2]
    const meridiem = amPmMatch[3].toLowerCase()
    if (meridiem === 'pm' && h < 12) h += 12
    if (meridiem === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${m}`
  }
  // 24-hour format: 20:32, 14:05 — only match plausible clock values
  const h24Match = text.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/)
  if (h24Match) {
    return `${h24Match[1]}:${h24Match[2]}`
  }
  return null
}

// ============================================================
// MANDATORY EVIDENCE GATE — past-tense transaction verb
// ============================================================
const PAST_TENSE_TX_VERB_RE =
  /\b(debited|credited|paid|transferred|withdrawn|charged|received|deposited|settled|cleared|processed|refunded|reversed)\b/i

function hasPastTenseTransactionVerb(text: string): boolean {
  return PAST_TENSE_TX_VERB_RE.test(text)
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
  isLargeAmount: boolean
  debitCreditClear: boolean
}

function computeConfidence(signals: ConfidenceSignals): number {
  let score = 0
  if (signals.trustedSender) score += 35
  if (signals.hardAcceptSubject) score += 20
  if (signals.hasTransactionKeyword) score += 20
  if (signals.hasAmount) score += 15
  if (signals.hasMerchant) score += 10
  if (signals.hasPaymentMode) score += 5
  if (signals.hasReferenceId) score += 5
  if (signals.debitCreditClear) score += 5

  if (!signals.trustedSender) {
    score -= 15
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
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  const providerToken = getGoogleToken()

  if (!user) return { data: null, error: new Error('User not authenticated') }
  if (!providerToken) {
    return {
      data: null,
      error: new Error('Gmail Inbox not connected. Please click "Connect Gmail Inbox" on the Pending Alerts page to authorise Gmail scanning.'),
    }
  }

  try {
    // Premium gate + cooldown check (service-layer enforcement)
    const accessResult = await checkScannerAccess()
    if (!accessResult.allowed) {
      return { data: null, error: new Error(accessResult.message || 'Scanner access denied.') }
    }

    const cleanEmail = user.email?.toLowerCase().trim() || ''
    const isOwner = OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(cleanEmail)

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

    // ── Incremental Gmail sync ──────────────────────────────
    // On first scan: fetch last 7 days
    // On subsequent scans: use Gmail historyId checkpoint to fetch only new emails.
    // Falls back to date-based query if historyId is stale (>7 days) or missing.
    // ──────────────────────────────────────────────────────

    // Step 1: capture current historyId BEFORE fetching (save at end of scan)
    let currentHistoryId: string | null = null
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${providerToken}` },
      })
      if (profileRes.ok) {
        const profileData = await profileRes.json()
        currentHistoryId = profileData.historyId || null
      }
    } catch {
      // non-fatal — scan continues without historyId
    }

    // Step 2: get last saved historyId from scan logs
    let savedHistoryId: string | null = null
    let lastScanAt: string | null = null
    if (!isFirstScan) {
      try {
        const { data: lastLog } = await supabase
          .from('email_scan_logs')
          .select('gmail_history_id, scanned_at')
          .eq('user_id', user.id)
          .eq('status', 'success')
          .not('gmail_history_id', 'is', null)
          .order('scanned_at', { ascending: false })
          .limit(1)

        if (lastLog && lastLog.length > 0) {
          savedHistoryId = (lastLog[0] as any).gmail_history_id || null
          lastScanAt = lastLog[0].scanned_at || null
        }
      } catch {
        // non-fatal
      }
    }

    const maxResults = isOwner ? 200 : 100
    let messages: { id: string; threadId: string }[] = []
    let startLimitTime = 0

    // Step 3: try incremental fetch if historyId is fresh (< 7 days)
    const historyFresh =
      savedHistoryId &&
      lastScanAt &&
      Date.now() - new Date(lastScanAt).getTime() < 7 * 24 * 60 * 60 * 1000

    if (!isFirstScan && historyFresh && savedHistoryId) {
      try {
        const histUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${savedHistoryId}&historyTypes=messageAdded&labelId=INBOX`
        const histRes = await fetch(histUrl, { headers: { Authorization: `Bearer ${providerToken}` } })

        if (histRes.status === 404) {
          // historyId expired — fall through to full scan
          console.warn('[emailScanner] historyId expired, falling back to full scan')
        } else if (histRes.ok) {
          const histData = await histRes.json()
          const histMessages: { id: string; threadId: string }[] = (histData.history || [])
            .flatMap((h: any) => h.messagesAdded || [])
            .map((m: any) => m.message)
            .filter((m: any) => m?.id)
            .reduce((acc: { id: string; threadId: string }[], m: any) => {
              if (!acc.some(x => x.id === m.id)) acc.push({ id: m.id, threadId: m.threadId || '' })
              return acc
            }, [])

          messages = histMessages.slice(0, maxResults)
          startLimitTime = new Date(`${activeYear}-01-01T00:00:00Z`).getTime()
        }
      } catch (histErr) {
        console.warn('[emailScanner] history API failed, falling back to full scan:', histErr)
      }
    }

    // Step 4: full scan fallback (first scan or stale historyId)
    if (messages.length === 0) {
      if (isFirstScan) {
        startLimitTime = Date.now() - 7 * 24 * 60 * 60 * 1000
        const d = new Date(startLimitTime)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const q = `after:${yyyy}/${mm}/${dd} (debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)`
        let nextPageToken = ''
        do {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
          const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })
          if (listRes.status === 401 || listRes.status === 403) { clearGoogleToken(); throw new Error('TOKEN_EXPIRED') }
          if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)
          const listData = await listRes.json()
          if (listData.messages) messages = messages.concat(listData.messages)
          if (messages.length >= maxResults) { messages = messages.slice(0, maxResults); break }
          nextPageToken = listData.nextPageToken || ''
        } while (nextPageToken)
      } else {
        // Non-first scan with no historyId — scan since last successful scan date
        const afterDate = lastScanAt
          ? new Date(lastScanAt)
          : new Date(`${activeYear}-01-01T00:00:00Z`)
        startLimitTime = afterDate.getTime()
        const yyyy = afterDate.getFullYear()
        const mm = String(afterDate.getMonth() + 1).padStart(2, '0')
        const dd = String(afterDate.getDate()).padStart(2, '0')
        const q = `after:${yyyy}/${mm}/${dd} before:${activeYear + 1}/01/01 (debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)`
        let nextPageToken = ''
        do {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
          const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })
          if (listRes.status === 401 || listRes.status === 403) { clearGoogleToken(); throw new Error('TOKEN_EXPIRED') }
          if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)
          const listData = await listRes.json()
          if (listData.messages) messages = messages.concat(listData.messages)
          if (messages.length >= maxResults) { messages = messages.slice(0, maxResults); break }
          nextPageToken = listData.nextPageToken || ''
        } while (nextPageToken)
      }
    }

    if (messages.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: 0,
          transactions_found: 0,
          status: 'success',
          ...(currentHistoryId ? { gmail_history_id: currentHistoryId } : {}),
        } as any)
        .select()
        .single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }

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

    const { data: existingTxns } = await supabase
      .from('transactions')
      .select('email_message_id, reference_id')
      .eq('user_id', user.id)

    const existingMessageIds = new Set<string>(existingTxns?.map((t) => t.email_message_id).filter((id): id is string => !!id))
    const existingRefIds = new Set<string>(existingTxns?.map((t) => t.reference_id).filter((r): r is string => !!r))

    const transactionsToInsert: TransactionInsert[] = []
    let skippedConfidence = 0

    for (const mail of validDetails) {
      const mailMessageId: string = mail.id || ''

      if (mailMessageId && existingMessageIds.has(mailMessageId)) continue

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

      // Mandatory evidence gate — reject if no past-tense transaction verb found
      if (!hasPastTenseTransactionVerb(fullText)) continue

      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || ''
      if (geminiApiKey) {
        try {
          const aiResult = await analyzeTransactionEmailWithAI(subject, bodyText, mailDate)
          if (aiResult) {
            if (aiResult.is_transaction && aiResult.amount && aiResult.amount > 0) {
              if (aiResult.reference_id && existingRefIds.has(aiResult.reference_id)) {
                continue
              }

              // Normalize merchant to canonical form
              const rawMerchant = aiResult.merchant || 'Other'
              const normalized = normalizeMerchant(rawMerchant)
              const resolvedMerchant = normalized.canonical || rawMerchant

              let ruleResult
              try {
                ruleResult = await applyMerchantRulesFromDB(
                  user.id,
                  resolvedMerchant,
                  bodyText,
                  aiResult.category || normalized.category || 'other'
                )
              } catch {
                ruleResult = {
                  category: aiResult.category || normalized.category || 'other',
                  approval_status: 'pending',
                  confidence: aiResult.confidence_score,
                }
              }

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
                // notes intentionally omitted — do not store email body
                date: aiResult.date || mailDate,
                source: 'email',
                approval_status: approval_status as 'approved' | 'pending' | 'rejected',
                reference_id: aiResult.reference_id,
                payment_mode: (aiResult.payment_mode || 'unknown') as any,
                card_issuer: aiResult.card_issuer || null,
                card_brand: aiResult.card_brand || detectCardBrand(fullText) || null,
                transaction_time: aiResult.transaction_time || extractTransactionTime(bodyText) || null,
                confidence_score: aiResult.confidence_score,
                event_type: aiResult.transaction_type || 'debit',
                email_message_id: mailMessageId || null,
              } as any
            } else {
              continue
            }
          }
        } catch (aiErr) {
          console.warn('[emailScanner] AI parsing failed, falling back to heuristics:', aiErr)
        }
      }

      if (!parsedTxn) {
        const senderDomainMatch = fromValue.match(/@([\w.-]+)>?/i)
        const senderDomain = senderDomainMatch ? senderDomainMatch[1].toLowerCase() : ''
        const isTrustedSender = TRUSTED_SENDER_DOMAINS.has(senderDomain) ||
          [...TRUSTED_SENDER_DOMAINS].some(d => senderDomain.endsWith('.' + d))

        const isHardRejected = HARD_REJECT_SUBJECT_PATTERNS.some(p => p.test(subject))
        if (isHardRejected) continue

        const isHardAccepted = HARD_ACCEPT_SUBJECT_PATTERNS.some(p => p.test(subject))

        // Extended promotional content rejection
        const isPromotionalSpam =
          /\b(?:promo(?:tion)?|coupon|unsubscribe|shop\s+now|buy\s+now|special\s+offer|limited\s+period|earn\s+cashback|get\s+cashback|cashback\s+on\s+your\s+next|exclusive\s+deal)\b/i.test(emailContentForParsing) ||
          /\b(?:reward\s+points?|loyalty\s+points?|you.ve\s+earned|points?\s+credited|bonus\s+points?)\b/i.test(emailContentForParsing) ||
          /\b(?:pre-?approved|credit\s+limit\s+(?:increase|enhanced)|upgrade\s+your\s+card|loan\s+offer)\b/i.test(emailContentForParsing) ||
          /\b(?:available\s+balance\s+is|your\s+account\s+balance|balance\s+is\s+(?:rs|₹|inr))/i.test(emailContentForParsing)
        if (isPromotionalSpam) continue

        if (!isHardAccepted) {
          if (/\b(?:declined|failed|unsuccessful|initiated|requested|rejected|cancelled|void|voided)\b/i.test(emailContentForParsing)) continue
          if (/\b(?:otp|one\s*time\s*pass(?:word|code)|verification\s*code|verification\s*pin|passcode|security\s*pin|security\s*code|m-?pin|t-?pin|2fa|two\s*factor|auth\s*code|do\s*not\s*share)\b/i.test(emailContentForParsing)) continue
          if (/\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement|e-?statement|estatement)\b/i.test(emailContentForParsing)) continue
          if (/(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|auto-?debit\s+has\s+been\s+scheduled|is\s+scheduled\s+for)/i.test(emailContentForParsing)) continue
          if (/\b(?:policy\s+update|security\s+policy|terms\s+of\s+service|agreement\s+update|privacy\s+update|will\s+not\s+be\s+charged|no\s+charges\s+apply)\b/i.test(emailContentForParsing)) continue
        }

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

        const filteredAmounts = amountMatches.filter(m => {
          const preStart = Math.max(0, m.index - 30)
          const precedingText = emailContentForParsing.substring(preStart, m.index).toLowerCase()
          const postEnd = Math.min(emailContentForParsing.length, m.index + m.text.length + 20)
          const succeedingText = emailContentForParsing.substring(m.index + m.text.length, postEnd).toLowerCase()
          return !(/bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger|total\s+due|minimum\s+due/i.test(precedingText) ||
            /bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger/i.test(succeedingText))
        })

        if (filteredAmounts.length === 0) continue

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

        const winStart = Math.max(0, resolvedMatch.index - 120)
        const winEnd = Math.min(emailContentForParsing.length, resolvedMatch.index + resolvedMatch.text.length + 120)
        const windowContent = emailContentForParsing.substring(winStart, winEnd).toLowerCase()
        const lowerContent = emailContentForParsing.toLowerCase()

        const debitWords = [
          'debited', 'debited for', 'spent', 'paid', 'paid to', 'withdrawn', 'charged',
          'payment to', 'sent to', 'transfer to', 'purchased at', 'debit',
          'order placed', 'checkout', 'billed', 'invoice'
        ]
        const creditWords = ['credited', 'credited to', 'received', 'received from', 'added', 'refund', 'refunded', 'cashback', 'deposited', 'salary', 'credit', 'reversed']

        let debitScore = 0, creditScore = 0
        debitWords.forEach(w => { if (windowContent.includes(w)) debitScore += 10 })
        creditWords.forEach(w => {
          if (w === 'received') {
            const hasFalseCreditReceived = /received\s+(?:your\s+)?order|order\s+received|payment\s+received|received\s+payment|received\s+at/i.test(windowContent)
            if (hasFalseCreditReceived) return
          }
          if (windowContent.includes(w)) creditScore += 10
        })

        if (debitScore === 0 && creditScore === 0) {
          debitWords.forEach(w => { if (lowerContent.includes(w)) debitScore += 5 })
          creditWords.forEach(w => {
            if (w === 'received') {
              const hasFalseCreditReceived = /received\s+(?:your\s+)?order|order\s+received|payment\s+received|received\s+payment|received\s+at/i.test(lowerContent)
              if (hasFalseCreditReceived) return
            }
            if (lowerContent.includes(w)) creditScore += 5
          })
        }

        if (debitScore === 0 && creditScore === 0) continue

        let txType: 'debit' | 'credit' = creditScore > debitScore ? 'credit' : 'debit'
        const debitCreditClear = Math.abs(debitScore - creditScore) >= 10

        if (amount < 10 && txType === 'credit') {
          if (!/salary|refund|reversed/i.test(emailContentForParsing)) continue
        }
        if (amount < 1) continue

        const paymentMode = detectPaymentMode(emailContentForParsing)
        const cardBrand = detectCardBrand(emailContentForParsing)
        const txTime = extractTransactionTime(emailContentForParsing)
        const cardIssuer = extractBankName(emailContentForParsing) || null

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

        // Normalize merchant to canonical form
        if (merchant) {
          const norm = normalizeMerchant(merchant)
          merchant = norm.canonical || merchant
          if (norm.isKnown && category === 'other') category = norm.category
        }

        if (txType === 'credit' && knownMerchant && knownMerchant.name !== 'Salary Credit') {
          const hasRefundOrReversal = /refund|reversed|cashback|refunded|returned|chargeback/i.test(emailContentForParsing)
          if (!hasRefundOrReversal) {
            txType = 'debit'
          }
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

        const refMatch = emailContentForParsing.match(
          /(?:UPI\s*(?:Ref(?:\.?\s*No\.?)?|Txn\s*ID|Transaction\s*ID)[:\s]*([0-9]{10,20}))|(?:(?:Ref(?:\.?\s*No\.?)?|RefNo|Transaction\s*(?:ID|Ref))[:\s]*([0-9]{6,20}))/i
        )
        const reference_id = refMatch ? (refMatch[1] || refMatch[2]) : null

        if (reference_id && existingRefIds.has(reference_id)) continue

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

        if (confidence < 70) {
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
          // notes intentionally omitted — do not store email body
          date: mailDate,
          source: 'email',
          approval_status,
          reference_id,
          payment_mode: paymentMode,
          card_issuer: cardIssuer,
          card_brand: cardBrand,
          transaction_time: txTime,
          confidence_score: confidence,
          event_type: eventType,
          email_message_id: mailMessageId || null,
        } as any
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
          error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (confidence < 70)` : null,
          ...(currentHistoryId ? { gmail_history_id: currentHistoryId } : {}),
        } as any)
        .select()
        .single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }

    const { data: insertedTxns, error: txnError } = await supabase
      .from('transactions')
      .insert(transactionsToInsert)
      .select()

    if (txnError) throw txnError

    try {
      // Cards sync disabled
    } catch (cardErr) {
      console.warn('Card upsert failed (disabled):', cardErr)
    }

    const { data: scanLog, error: logError } = await supabase
      .from('email_scan_logs')
      .insert({
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: transactionsToInsert.length,
        status: 'success',
        error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (confidence < 70)` : null,
        ...(currentHistoryId ? { gmail_history_id: currentHistoryId } : {}),
      } as any)
      .select()
      .single()

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
      errorMessage = 'Your Gmail connection expired. Please click "Connect Gmail Inbox" on the Pending Alerts page to get a fresh token and try again.'
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
