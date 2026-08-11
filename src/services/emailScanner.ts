// ============================================
// Email Scanner Service V2 — Dhanrakshak
// 5-Layer Financial Intelligence Engine
// Priority: Accuracy > Speed > Coverage
// ============================================

import { supabase as defaultSupabase } from './supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { extractBankName, retryWithBackoff } from '../utils/index.js'
import { applyMerchantRulesFromDB } from './learningEngine.js'
import { getGoogleToken, clearGoogleToken, tryRefreshGoogleToken } from './googleAuth.js'
import { analyzeTransactionEmailWithAI } from './aiService.js'
import { stripBoilerplate } from './emailBoilerplate.js'
import { evaluateRegexGates, logRejection, isBulkMarketingEmail, hasPaymentAssertion } from './emailScanGates.js'

type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

// ============================================================
// OWNER EMAILS — get unlimited scans. All other users are
// capped to 1 scan per 24 hours.
// Set VITE_OWNER_EMAILS as a comma-separated list in your .env file.
// ============================================================
const OWNER_EMAILS = (
  (import.meta.env || {}).VITE_OWNER_EMAILS ||
  (typeof process !== 'undefined' ? process.env.VITE_OWNER_EMAILS : '') ||
  ''
)
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
  'sbi.co.in', 'onlinesbi.com', 'sbicards.com', 'sbicard.com', 'sbicard.in',
  'pnb.co.in', 'punjabnationalbank.in', 'pnbcard.in',
  'canarabank.com', 'canarabank.in',
  'bankofbaroda.in', 'bankofbaroda.com', 'bobibanking.com',
  'bankofindia.co.in', 'bankofindia.com',
  'unionbankofindia.org', 'unionbankofindia.com', 'unionbank.co.in',
  'indianbank.in', 'indianbank.co.in',
  'centralbankofindia.co.in', 'centralbank.org.in',
  'ucobank.com', 'ucobank.co.in',
  'iobnet.co.in', 'iob.in', 'iob.co.in',
  'idbi.co.in', 'idbibank.co.in', 'idbibank.in', 'idbibank.com',
  'allahababank.in',
  // Indian Private Banks
  'hdfcbank.com', 'hdfcbank.net',
  'icicibank.com', 'icicibank.org', 'icici.com', 'icicibank.net',
  'axisbank.com', 'axisbank.co.in', 'axis.bank.in', 'axisbank.in', 'axisbank.net',
  'kotak.com', 'kotakbank.com', 'kotak.in',
  'yesbank.in', 'yesbank.com',
  'indusind.com', 'indusindbank.com',
  'idfcfirstbank.com', 'idfcfirst.com', 'idfcfirstbank.in',
  'federalbank.co.in', 'federalbank.com',
  'rblbank.com', 'rblbank.in',
  'aubank.in', 'aufinanciers.com',
  'bandhanbank.com',
  'dcbbank.com',
  'sbm.co.in', 'sbmbank.co.in',
  'sib.co.in', 'southindianbank.com',
  'kvb.co.in', 'kvbmail.com',
  'karnatakabank.com', 'karnatakabank.co.in',
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
  'onecard.in', 'getonecard.app',
  'sliceit.com',
  'uni.cards', 'unicards.in',
  'scapia.cards', 'scapia.app',
  'jupiter.money',
  'fi.money',
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
  'Groceries': ['mart', 'grocery', 'supermarket', 'bigbasket', 'blinkit', 'zepto', 'groceries', 'kirana', 'milk', 'dairy', 'provisions'],
  'Food & Dining': ['zomato', 'swiggy', 'food', 'restaurant', 'cafe', 'canteen', 'dhaba', 'eats', 'pizza', 'burger', 'kitchen', 'bakery', 'dining', 'coffee'],
  'Transport': ['uber', 'ola', 'cab', 'taxi', 'metro', 'irctc', 'railway', 'train', 'flight', 'airline', 'petrol', 'diesel', 'hpcl', 'bpcl', 'iocl', 'cng', 'toll', 'fastag', 'rapido'],
  'Entertainment': ['pvr', 'inox', 'movie', 'cinema', 'bookmyshow', 'theatre', 'gaming', 'pub', 'bar', 'club', 'lounge'],
  'Subscriptions': ['netflix', 'spotify', 'prime', 'hotstar', 'youtube', 'premium', 'apple', 'icloud', 'google one', 'microsoft', 'adobe'],
  'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'mall', 'fashion', 'retail', 'croma', 'reliance digital', 'clothing', 'nykaa', 'bazaar', 'dmart'],
  'Utilities & Bills': ['airtel', 'jio', 'bsnl', 'broadband', 'electricity', 'bescom', 'power', 'water', 'gas', 'indane', 'telecom', 'wifi'],
  'Salary': ['salary', 'payroll', 'employer', 'stipend', 'wages'],
  'Investments': ['mutual fund', 'sip', 'groww', 'zerodha', 'upstox', 'investment', 'etf', 'demat', 'stocks', 'securities'],
  'Health': ['hospital', 'pharmacy', 'medical', 'clinic', 'doctor', 'medicine', 'apollo', 'netmeds', 'medplus', 'insurance'],
  'Education': ['school', 'college', 'university', 'course', 'coaching', 'tuition', 'fee', 'exam'],
  'Travel': ['hotel', 'makemytrip', 'booking', 'goibibo', 'cleartrip', 'easemytrip', 'airbnb', 'oyo'],
}

export interface RuleMatchResult {
  category: string
  approval_status: 'approved' | 'pending'
  confidence: number
  matchReason: string
}

export function applyMerchantRules(merchant: string, snippet: string, defaultCategory: string): RuleMatchResult {
  const weights = getMerchantWeights()
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
    return {
      category: bestCategory,
      // Never auto-approve — every scanned/matched transaction must land in
      // Pending for explicit human review, regardless of confidence.
      approval_status: 'pending',
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
  { pattern: /zomato/i, name: 'Zomato', category: 'Food & Dining', description: 'Zomato Food Order' },
  { pattern: /swiggy/i, name: 'Swiggy', category: 'Food & Dining', description: 'Swiggy Meal Delivery' },
  { pattern: /uber\s*eats/i, name: 'Uber Eats', category: 'Food & Dining', description: 'Uber Eats Order' },
  { pattern: /dunzo/i, name: 'Dunzo', category: 'Food & Dining', description: 'Dunzo Delivery' },
  { pattern: /blinkit|grofers/i, name: 'Blinkit', category: 'Groceries', description: 'Blinkit Quick Delivery' },
  { pattern: /bigbasket/i, name: 'BigBasket', category: 'Groceries', description: 'BigBasket Groceries' },
  { pattern: /zepto/i, name: 'Zepto', category: 'Groceries', description: 'Zepto Quick Commerce' },
  { pattern: /instamart/i, name: 'Swiggy Instamart', category: 'Groceries', description: 'Swiggy Instamart' },
  { pattern: /jiomart/i, name: 'JioMart', category: 'Groceries', description: 'JioMart Grocery' },
  { pattern: /\bola\s*electric\b|olaev/i, name: 'Ola Electric', category: 'Transport', description: 'Ola Electric Scooter' },
  { pattern: /\bola\b/i, name: 'Ola', category: 'Transport', description: 'Ola Cab Ride' },
  { pattern: /\buber\b/i, name: 'Uber', category: 'Transport', description: 'Uber Cab Ride' },
  { pattern: /rapido/i, name: 'Rapido', category: 'Transport', description: 'Rapido Bike Ride' },
  { pattern: /irctc/i, name: 'IRCTC', category: 'Transport', description: 'IRCTC Railway Booking' },
  { pattern: /fastag|\bfastag\b|netc\s*fastag/i, name: 'FASTag', category: 'Transport', description: 'FASTag Toll Payment' },
  { pattern: /makemytrip|mmt\b/i, name: 'MakeMyTrip', category: 'Travel', description: 'MakeMyTrip Booking' },
  { pattern: /goibibo/i, name: 'Goibibo', category: 'Travel', description: 'Goibibo Booking' },
  { pattern: /cleartrip/i, name: 'Cleartrip', category: 'Travel', description: 'Cleartrip Booking' },
  { pattern: /easemytrip/i, name: 'EaseMyTrip', category: 'Travel', description: 'EaseMyTrip Booking' },
  { pattern: /yatra\.com|\byatra\b/i, name: 'Yatra', category: 'Travel', description: 'Yatra Booking' },
  { pattern: /oyo\s*rooms|oyorooms|oyo\b/i, name: 'OYO', category: 'Travel', description: 'OYO Hotel Stay' },
  { pattern: /netflix/i, name: 'Netflix', category: 'Subscriptions', description: 'Netflix Subscription' },
  { pattern: /spotify/i, name: 'Spotify', category: 'Subscriptions', description: 'Spotify Premium' },
  { pattern: /hotstar|disney\+|disneyplus/i, name: 'Disney+ Hotstar', category: 'Subscriptions', description: 'Disney+ Hotstar Subscription' },
  { pattern: /youtube\s*premium/i, name: 'YouTube Premium', category: 'Subscriptions', description: 'YouTube Premium' },
  { pattern: /amazon\s*prime/i, name: 'Amazon Prime', category: 'Subscriptions', description: 'Amazon Prime Subscription' },
  { pattern: /jio\s*cinema|jiocinema/i, name: 'JioCinema', category: 'Subscriptions', description: 'JioCinema Subscription' },
  { pattern: /sonyliv/i, name: 'SonyLIV', category: 'Subscriptions', description: 'SonyLIV Subscription' },
  { pattern: /zee5/i, name: 'ZEE5', category: 'Subscriptions', description: 'ZEE5 Subscription' },
  { pattern: /apple\s*(?:tv|music|icloud|one)/i, name: 'Apple Subscription', category: 'Subscriptions', description: 'Apple Subscription' },
  { pattern: /google\s*one/i, name: 'Google One', category: 'Subscriptions', description: 'Google One Storage' },
  { pattern: /myntra/i, name: 'Myntra', category: 'Shopping', description: 'Myntra Fashion Purchase' },
  { pattern: /amazon/i, name: 'Amazon', category: 'Shopping', description: 'Amazon Checkout' },
  { pattern: /flipkart/i, name: 'Flipkart', category: 'Shopping', description: 'Flipkart Shopping' },
  { pattern: /meesho/i, name: 'Meesho', category: 'Shopping', description: 'Meesho Purchase' },
  { pattern: /ajio/i, name: 'AJIO', category: 'Shopping', description: 'AJIO Fashion Purchase' },
  { pattern: /nykaa/i, name: 'Nykaa', category: 'Shopping', description: 'Nykaa Beauty Purchase' },
  { pattern: /croma/i, name: 'Croma', category: 'Shopping', description: 'Croma Electronics' },
  { pattern: /reliance\s*digital/i, name: 'Reliance Digital', category: 'Shopping', description: 'Reliance Digital Purchase' },
  { pattern: /\bdmart\b|d-?mart/i, name: 'DMart', category: 'Groceries', description: 'DMart Purchase' },
  { pattern: /airtel/i, name: 'Airtel', category: 'Utilities & Bills', description: 'Airtel Telecom / Broadband' },
  { pattern: /\bjio\b/i, name: 'Jio', category: 'Utilities & Bills', description: 'Jio Telecom Recharge' },
  { pattern: /\bvi\b|vodafone|idea/i, name: 'Vi (Vodafone Idea)', category: 'Utilities & Bills', description: 'Vi Telecom Recharge' },
  { pattern: /bsnl/i, name: 'BSNL', category: 'Utilities & Bills', description: 'BSNL Telecom Bill' },
  { pattern: /electricity|bescom|tata\s*power|adani\s*electricity|msedcl|tneb/i, name: 'Electricity Provider', category: 'Utilities & Bills', description: 'Electricity Bill Payment' },
  { pattern: /gas\s*bill|indane|bharat\s*gas|hp\s*gas/i, name: 'Gas Provider', category: 'Utilities & Bills', description: 'Gas Bill Payment' },
  { pattern: /water\s*bill|water\s*supply/i, name: 'Water Supply', category: 'Utilities & Bills', description: 'Water Bill Payment' },
  { pattern: /salary|credited\s*by.*(?:employer|company|corp)/i, name: 'Salary Credit', category: 'Salary', description: 'Monthly Salary Credit' },
  { pattern: /bookmyshow|\bbms\b/i, name: 'BookMyShow', category: 'Entertainment', description: 'BookMyShow Tickets' },
  { pattern: /pvr|inox/i, name: 'PVR INOX', category: 'Entertainment', description: 'PVR INOX Cinema' },
  { pattern: /apollo\s*pharmacy|netmeds|medplus|1mg\b/i, name: 'Pharmacy', category: 'Health', description: 'Pharmacy / Medicine Purchase' },
  { pattern: /apollo\s*(?:hospital|clinic)/i, name: 'Apollo Hospital', category: 'Health', description: 'Apollo Hospital Payment' },
  { pattern: /groww/i, name: 'Groww', category: 'Investments', description: 'Groww Investment' },
  { pattern: /zerodha/i, name: 'Zerodha', category: 'Investments', description: 'Zerodha Trading' },
  { pattern: /upstox/i, name: 'Upstox', category: 'Investments', description: 'Upstox Investment' },
  { pattern: /kuvera/i, name: 'Kuvera', category: 'Investments', description: 'Kuvera Fund Investment' },
  { pattern: /mutual\s*fund|sip\b/i, name: 'Mutual Fund SIP', category: 'Investments', description: 'Mutual Fund SIP Debit' },
  { pattern: /paytm\s*mall|paytm\s*(?:movie|travel)/i, name: 'Paytm Mall', category: 'Shopping', description: 'Paytm Mall Purchase' },
  { pattern: /swiggy\s*genie/i, name: 'Swiggy Genie', category: 'Transport', description: 'Swiggy Genie Delivery' },
  { pattern: /tata\s*cliq|tatacliq/i, name: 'Tata CLiQ', category: 'Shopping', description: 'Tata CLiQ Purchase' },
  { pattern: /lenskart/i, name: 'Lenskart', category: 'Health', description: 'Lenskart Eyewear' },
  { pattern: /classplus|unacademy|byjus|byju/i, name: 'EdTech Platform', category: 'Education', description: 'Online Education' },
]

// ============================================================
// LAYER 4 — EVENT TYPE CLASSIFICATION
// ============================================================
type EventType = 'debit' | 'credit' | 'refund' | 'emi' | 'sip' | 'salary' | 'chargeback' | 'subscription' | 'transfer' | 'insurance' | 'loan_repayment' | 'atm_withdrawal'

export function classifyEventType(text: string, txType: 'debit' | 'credit', category: string): EventType {
  // Bank reference tokens often embed the keyword between underscores
  // (e.g. "PPR030614052540_EMI_05-08-") — `_` is a \w character, so a bare
  // `\bemi\b` never matches there. Normalizing underscores to spaces here
  // (scoped to this classifier only) restores word-boundary matching
  // without touching the general parsing text used elsewhere.
  const t = text.replace(/_/g, ' ').toLowerCase()

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
  if (category === 'Subscriptions') return 'subscription'
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
  const candidateRegex = /(?:^|\D)(?:[xX*]+-?)*\s*(\d{4})\b/g
  let match
  const candidates: { digits: string; index: number }[] = []

  while ((match = candidateRegex.exec(text)) !== null) {
    const digits = match[1]
    const idx = match.index + match[0].indexOf(digits)
    candidates.push({ digits, index: idx })
  }

  for (const candidate of candidates) {
    const digits = candidate.digits
    const idx = candidate.index

    const val = parseInt(digits, 10)
    if (val >= 2020 && val <= 2035) continue

    const preText = text.substring(Math.max(0, idx - 60), idx)

    const isMasked = /[xX*]+-?\s*$/.test(preText)

    const cardRegex = /\b(card|cc|credit|debit|visa|mastercard|mc|rupay|amex|diners|sbicard|sbi-card)\b/i
    const accountRegex = /\b(a\/c|account|acct|acc|savings|current|deposit|loan|wallet)\b/i
    const refRegex = /\b(ref\s*(?:no\.?|num(?:ber)?)?|reference\s*(?:no\.?|num(?:ber)?)?|txn\s*id|transaction\s*id|utr|otp|code|pin)\b/i

    const cardLastIdx = getLastMatchIndex(preText, cardRegex)
    const accountLastIdx = getLastMatchIndex(preText, accountRegex)
    const refLastIdx = getLastMatchIndex(preText, refRegex)

    const cardDist = cardLastIdx !== -1 ? preText.length - cardLastIdx : Infinity
    const accountDist = accountLastIdx !== -1 ? preText.length - accountLastIdx : Infinity
    const refDist = refLastIdx !== -1 ? preText.length - refLastIdx : Infinity

    if (accountDist < cardDist) continue
    if (refDist < cardDist) continue

    const endsMatch = preText.match(/\b(ending|ends)\s*(?:in\s*)?$/i)
    const hasEnds = !!endsMatch

    if (!isMasked && cardDist > 40 && !hasEnds) continue

    if (cardDist === Infinity && accountDist !== Infinity) continue
    if (cardDist === Infinity && refDist !== Infinity) continue

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
  const { data: { user } } = await defaultSupabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }
  const { data, error } = await defaultSupabase
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
export interface ScanGmailOptions {
  /** Supabase client to use for all DB reads/writes during this scan. Defaults to the browser singleton. */
  db?: SupabaseClient
  /** User id/email to scan for. When provided (with accessToken), the browser session lookup is skipped entirely — this is the server-side/cron path. */
  userId?: string
  userEmail?: string
  /** Google API access token to use directly, bypassing localStorage/session lookup. */
  accessToken?: string
  /** Active financial year to scope the scan to. Defaults to the browser's localStorage value (or 2026). */
  activeYear?: number
  /** AI email analyzer to use. Defaults to the proxy-based `analyzeTransactionEmailWithAI`. */
  askAI?: (subject: string, body: string, emailDate: string, categoryNames?: string[]) => ReturnType<typeof analyzeTransactionEmailWithAI>
}

export async function scanRealGmailInbox(opts?: ScanGmailOptions) {
  const supabase = opts?.db || defaultSupabase
  // Generated up front so every per-email rejection logged during this scan
  // can reference the scan_log row before that row itself is inserted
  // (which only happens after the whole scan completes, below).
  const scanLogId: string = crypto.randomUUID
    ? crypto.randomUUID()
    : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const askAI = opts?.askAI ||
    ((subject: string, body: string, emailDate: string, categoryNames?: string[]) =>
      analyzeTransactionEmailWithAI(subject, body, emailDate, undefined, categoryNames))

  let user: { id: string; email?: string } | undefined
  let providerToken: string | null = null

  if (opts?.userId && opts?.accessToken) {
    // Server-side path (cron): identity and token are supplied directly, no browser session exists.
    user = { id: opts.userId, email: opts.userEmail }
    providerToken = opts.accessToken
  } else {
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user

    providerToken = getGoogleToken()

    if (!user) return { data: null, error: new Error('User not authenticated') }

    // If access token is expired, silently refresh it before giving up
    if (!providerToken && session?.access_token) {
      providerToken = await tryRefreshGoogleToken(session.access_token)
    }
  }

  if (!user) return { data: null, error: new Error('User not authenticated') }

  if (!providerToken) {
    return {
      data: null,
      error: new Error('Gmail Inbox not connected. Please click "Connect Gmail Inbox" on the Pending Alerts page to authorise Gmail scanning.'),
    }
  }

  try {
    const cleanEmail = user.email?.toLowerCase().trim() || ''
    const isOwner = OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(cleanEmail)

    // Check if the user has an active premium subscription to bypass the cooldown
    let isPremium = false
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_status, subscription_expires_at')
        .eq('id', user.id)
        .single()
      if (profile) {
        if (profile.subscription_status === 'active') {
          if (!profile.subscription_expires_at) {
            isPremium = true
          } else if (new Date(profile.subscription_expires_at).getTime() > Date.now()) {
            isPremium = true
          } else {
            supabase
              .from('profiles')
              .update({ subscription_status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', user.id)
              .then(({ error }: { error: any }) => {
                if (error) console.warn('Failed to update expired status in email scanner:', error.message)
              })
          }
        } else if (profile.subscription_status === 'trial') {
          if (profile.subscription_expires_at && new Date(profile.subscription_expires_at).getTime() > Date.now()) {
            isPremium = true
          } else {
            supabase
              .from('profiles')
              .update({ subscription_status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', user.id)
              .then(({ error }: { error: any }) => {
                if (error) console.warn('Failed to update expired status in email scanner:', error.message)
              })
          }
        }
      }
    } catch (e) {
      console.warn('Failed to query profile for premium bypass:', e)
    }

    if (!isOwner && !isPremium) {
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

    const { data: registeredCards } = await supabase.from('cards').select('last4, issuer').eq('user_id', user.id)

    const cardMap: Record<string, string> = {}
    if (registeredCards) {
      registeredCards.forEach((c: any) => {
        if (c.last4 && c.issuer) cardMap[c.last4] = c.issuer
      })
    }

    let activeYear = opts?.activeYear ?? 2026
    if (opts?.activeYear === undefined) {
      try {
        const storedYear = localStorage.getItem(`dhanrakshak_active_financial_year_${user.id}`)
        if (storedYear) {
          activeYear = parseInt(storedYear, 10)
        }
      } catch (e) {
        console.warn('Failed to load active year from localStorage, using default 2026', e)
      }
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
    let lastScanTime = 0
    try {
      const { data: logs } = await supabase
        .from('email_scan_logs')
        .select('scanned_at')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)
      if (logs && logs.length > 0) {
        isFirstScan = false
        lastScanTime = new Date(logs[0].scanned_at).getTime()
      }
    } catch (e) {
      console.warn('Failed to query email scan logs, assuming first scan', e)
    }

    // Two OR-ed groups: the original bank-alert-style keywords, plus generic
    // receipt-shaped language that direct-vendor emails use instead (a trip
    // receipt or food-delivery order confirmation rarely says "debited" or
    // "paid" — it says "receipt", "order", "trip", "total"). Together these
    // widen the fetch net without fetching every email in the window.
    const BANK_ALERT_KEYWORDS = '(debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)'
    const RECEIPT_KEYWORDS = '(receipt OR invoice OR order OR booking OR trip OR fare OR ride OR subscription OR renewal OR total)'
    const EMAIL_KEYWORDS = `(${BANK_ALERT_KEYWORDS} OR ${RECEIPT_KEYWORDS})`

    const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 // never scan back further than 30 days
    let startLimitTime = 0
    let q = ''
    if (isFirstScan) {
      // First scan: look back 7 days
      startLimitTime = Date.now() - 7 * 24 * 60 * 60 * 1000
    } else {
      // Subsequent scans: cover everything since the last *successful* scan (with a
      // small overlap buffer, since Gmail's date-only granularity and delayed bank
      // emails can otherwise leave same-day messages just outside the window), but
      // never less than a 26-hour window. Anchoring to "now - 26h" alone (instead of
      // the last successful scan) silently drops days of transactions whenever the
      // app isn't opened for more than 26 hours — or whenever the automatic daily
      // cron is delayed/fails for more than 26 hours — since the Gmail query itself
      // excludes anything before that cutoff; dedup can't recover emails that were
      // never fetched.
      const sinceLastScan = lastScanTime - 2 * 60 * 60 * 1000
      const rolling26h = Date.now() - 26 * 60 * 60 * 1000
      startLimitTime = Math.min(sinceLastScan, rolling26h)
      startLimitTime = Math.max(startLimitTime, Date.now() - MAX_LOOKBACK_MS)
    }
    // Use Unix epoch (seconds) for precise filtering — Gmail supports this format
    const sinceSeconds = Math.floor(startLimitTime / 1000)
    q = `after:${sinceSeconds} ${EMAIL_KEYWORDS}`

    let messages: { id: string; threadId: string }[] = []
    let nextPageToken = ''

    // Page size only — NOT a cap on total messages processed. The scan
    // window (isFirstScan / since-last-successful-scan, computed above)
    // defines completeness; a message-count cap here would silently
    // truncate the oldest matches whenever a window has more mail than
    // the cap, which is exactly when completeness matters most (a first
    // 7-day scan, or a scan after a gap).
    do {
      const pageSize = isOwner ? 200 : 100
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${pageSize}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })

      if (listRes.status === 401 || listRes.status === 403) {
        clearGoogleToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)

      const listData = await listRes.json() as any
      if (listData.messages) messages = messages.concat(listData.messages)
      nextPageToken = listData.nextPageToken || ''
    } while (nextPageToken)

    // Deduplicate messages by id to avoid duplicate key errors within the same scan batch
    const uniqueMessagesMap = new Map<string, { id: string; threadId: string }>()
    for (const m of messages) {
      if (m && m.id) uniqueMessagesMap.set(m.id, m)
    }
    const uniqueMessages = Array.from(uniqueMessagesMap.values())

    if (uniqueMessages.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({ id: scanLogId, user_id: user.id, emails_processed: 0, transactions_found: 0, status: 'success' })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }

    const batchSize = 15
    const validDetails: any[] = []
    for (let i = 0; i < uniqueMessages.length; i += batchSize) {
      const batch = uniqueMessages.slice(i, i + batchSize)
      let tokenExpiredDuringBatch = false
      const batchResults = await Promise.all(
        batch.map(async (m: { id: string }) => {
          try {
            const res = await retryWithBackoff(async () => {
              const r = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
                { headers: { Authorization: `Bearer ${providerToken}` } }
              )
              // 401/403 are auth failures, not transient — surface immediately,
              // don't burn retries on a token that isn't coming back this batch.
              if (r.status === 401 || r.status === 403) return r
              // 429/5xx are transient — throwing here is what makes
              // retryWithBackoff retry; anything else (2xx, 4xx other than
              // 401/403) returns normally and is handled below.
              if (r.status === 429 || r.status >= 500) {
                throw new Error(`Transient Gmail fetch failure: ${r.status}`)
              }
              return r
            }, 2, 500)

            if (res.status === 401 || res.status === 403) {
              tokenExpiredDuringBatch = true
              return null
            }
            if (!res.ok) return null
            return await res.json()
          } catch {
            logRejection(supabase, user.id, scanLogId, 'fetch_failed', '', '', `messageId=${m.id}`)
            return null
          }
        })
      )
      if (tokenExpiredDuringBatch) {
        clearGoogleToken()
        throw new Error('TOKEN_EXPIRED')
      }
      validDetails.push(...batchResults.filter(Boolean))
    }

    const { data: existingTxns, error: existingTxnsError } = await supabase
      .from('transactions')
      .select('email_message_id, reference_id')
      .eq('user_id', user.id)

    if (existingTxnsError) {
      console.error('[emailScanner] Failed to load existing transactions for dedup:', existingTxnsError)
    }

    const existingMessageIds = new Set<string>(
      (existingTxns ?? []).map((t: any) => t.email_message_id).filter((id: any): id is string => !!id)
    )
    const existingRefIds = new Set<string>(
      (existingTxns ?? []).map((t: any) => t.reference_id).filter((r: any): r is string => !!r)
    )

    // Fetch the user's real categories once per scan (not once per email) — used to
    // (1) feed the AI prompt the user's actual category names instead of the old
    // hardcoded/legacy list, and (2) validate merchant-rule/AI category suggestions
    // against what actually exists, falling back to the permanent category if not.
    const { data: userCategories } = await supabase
      .from('categories')
      .select('name, is_permanent')
      .eq('user_id', user.id)
    const categoryNames = (userCategories || []).map((c: any) => c.name)
    const fallbackCategoryName = (userCategories || []).find((c: any) => c.is_permanent)?.name || 'Other'

    const transactionsToInsert: TransactionInsert[] = []
    // Renamed from skippedConfidence: these emails are no longer skipped —
    // they're inserted as pending transactions with their low score
    // preserved, so the name should say what actually happens to them now.
    let lowConfidencePendingCount = 0
    const lowConfidenceEmailsDetails: string[] = []

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
      const senderDomainMatch = fromValue.match(/@([\w.-]+)>?/i)
      const senderDomain = senderDomainMatch ? senderDomainMatch[1].toLowerCase() : ''
      const isTrustedSender = TRUSTED_SENDER_DOMAINS.has(senderDomain) ||
        [...TRUSTED_SENDER_DOMAINS].some(d => senderDomain.endsWith('.' + d))
      // Strip security/legal footer boilerplate before ANY gate or the AI
      // prompt sees this text — footers were colliding with rejection
      // keywords (e.g. "has not been initiated by you") and silently
      // dropping genuine transaction emails.
      const strippedBodyText = stripBoilerplate(bodyText)
      const fullText = `${subject} ${strippedBodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)

      // Bulk marketing with no payment language anywhere is an advertisement,
      // not a receipt. Rejected BEFORE the AI call so newsletters never consume
      // the daily AI scan quota — a newsletter-heavy inbox would otherwise
      // exhaust it on junk and force genuine receipts onto the regex fallback.
      // All three conditions are required: banks bypass on the first, and
      // genuine receipts bypass on the second (they carry no bulk markers).
      // `bodyText` is passed unstripped and untruncated on purpose — opt-out
      // text lives in footers, past where the other gates stop reading.
      const isBulkMail = isBulkMarketingEmail(mail.payload?.headers || [], bodyText)
      if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(emailContentForParsing)) {
        logRejection(supabase, user.id, scanLogId, 'bulk_mail_no_payment_evidence', senderDomain, subject, subject.substring(0, 120))
        continue
      }

      let parsedTxn: TransactionInsert | null = null
      let aiConfidentReject = false

      {
        try {
          const aiResult = await askAI(subject, strippedBodyText, mailDate, categoryNames)
          if (aiResult) {
            if (aiResult.is_transaction && aiResult.amount && aiResult.amount > 0) {
              if (aiResult.reference_id && existingRefIds.has(aiResult.reference_id)) {
                continue
              }

              const resolvedMerchant = aiResult.merchant || 'Other'
              let ruleResult
              try {
                ruleResult = await applyMerchantRulesFromDB(user.id, resolvedMerchant, bodyText, aiResult.category || fallbackCategoryName, supabase)
              } catch {
                ruleResult = { category: aiResult.category || fallbackCategoryName, approval_status: 'pending', confidence: aiResult.confidence_score }
              }

              // The prompt tells the model to score 0-59 for "uncertain cases
              // (these will be reviewed or rejected)", but this call site never
              // read the score. Honour that contract: still insert (never
              // silently drop), but pin it to pending explicitly here rather
              // than relying on applyMerchantRulesFromDB's invariant.
              const aiLowConfidence =
                typeof aiResult.confidence_score === 'number' && aiResult.confidence_score < 60
              if (aiLowConfidence) {
                logRejection(supabase, user.id, scanLogId, 'ai_low_confidence', senderDomain, subject, `confidence=${aiResult.confidence_score}`)
              }
              const approval_status = aiLowConfidence ? 'pending' : ruleResult.approval_status

              const resolvedCategory = (categoryNames.length > 0 && !categoryNames.includes(ruleResult.category))
                ? fallbackCategoryName
                : ruleResult.category

              parsedTxn = {
                user_id: user.id,
                amount: aiResult.amount,
                type: aiResult.transaction_type || 'debit',
                category: resolvedCategory,
                merchant: resolvedMerchant,
                description: aiResult.description || `${resolvedMerchant} Transaction`,
                date: aiResult.date || mailDate,
                source: 'email',
                approval_status: approval_status as 'approved' | 'pending' | 'rejected',
                category_confirmed_at: approval_status === 'approved' ? null : undefined,
                reference_id: aiResult.reference_id,
                payment_mode: (aiResult.payment_mode || 'unknown') as any,
                card_issuer: aiResult.card_issuer,
                card_brand: aiResult.card_brand,
                transaction_time: aiResult.transaction_time,
                confidence_score: aiResult.confidence_score,
                event_type: aiResult.transaction_type || 'debit',
                email_message_id: mailMessageId || null,
              }
            } else {
              // AI returned a result but classified this as a non-transaction (or
              // couldn't extract an amount) — don't drop the email outright, since
              // the AI misclassifies oddly-formatted bank alerts. Let it fall
              // through to the regex heuristic engine below as a second opinion,
              // unless the AI explicitly and confidently said this isn't a
              // transaction at all (is_transaction === false), which we still trust.
              aiConfidentReject = aiResult.is_transaction === false
            }
          }
        } catch (aiErr) {
          console.warn('[emailScanner] AI parsing failed, falling back to heuristics:', aiErr)
        }
      }

      if (aiConfidentReject && !parsedTxn) {
        logRejection(supabase, user.id, scanLogId, 'ai_confident_reject', senderDomain, subject, '')
        continue
      }

      if (!parsedTxn) {
        const isHardRejected = HARD_REJECT_SUBJECT_PATTERNS.some(p => p.test(subject))
        if (isHardRejected) {
          logRejection(supabase, user.id, scanLogId, 'hard_reject_subject', senderDomain, subject, subject)
          continue
        }

        const isHardAccepted = HARD_ACCEPT_SUBJECT_PATTERNS.some(p => p.test(subject))

        const gateResult = evaluateRegexGates(subject, emailContentForParsing, isHardAccepted)
        if (gateResult.rejected) {
          logRejection(supabase, user.id, scanLogId, gateResult.gate!, senderDomain, subject, gateResult.snippet || '')
          continue
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
          const preStart = Math.max(0, m.index - 80)
          const precedingText = emailContentForParsing.substring(preStart, m.index).toLowerCase()
          const postEnd = Math.min(emailContentForParsing.length, m.index + m.text.length + 50)
          const succeedingText = emailContentForParsing.substring(m.index + m.text.length, postEnd).toLowerCase()
          return !(/bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger|total\s+due|minimum\s+due|reward|cashback\s+of|earn|bonus/i.test(precedingText) ||
            /bal(?:ance)?|avail(?:able)?|limit|outstanding|ledger|reward|bonus/i.test(succeedingText))
        })

        if (filteredAmounts.length === 0) continue

        // `payment(?!s\b)` excludes the plural "Payments" section header
        // (a false match that used to win the amount-proximity tie-break
        // against real amounts in receipt-shaped emails) while still
        // matching genuine singular uses like "payment of Rs.500" or
        // "Payment received".
        const txKeywordsRe = /debited|spent|paid|withdrawn|txn|charged|payment(?!s\b)|credited|received|added|refund|transfer|neft|imps|rtgs/i
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

        // Second form of the pre-AI gate, now that an amount exists. Catches
        // bulk mail that mentions payments somewhere in an article but whose
        // *amount* is editorial — a share price or an advertised list price.
        if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(windowContent)) {
          logRejection(supabase, user.id, scanLogId, 'bulk_mail_no_payment_near_amount', senderDomain, subject, `amount=${amount}`)
          continue
        }

        const debitWords = [
          'debited', 'debited for', 'spent', 'paid', 'paid to', 'withdrawn', 'charged',
          'payment to', 'sent to', 'transfer to', 'purchased at', 'debit',
          'order placed', 'checkout', 'billed', 'invoice'
        ]
        const creditWords = ['credited', 'credited to', 'received', 'received from', 'added', 'refund', 'refunded', 'cashback', 'deposited', 'salary', 'credit', 'reversed']

        const FALSE_CREDIT_RECEIVED = /received\s+(?:your\s+)?(?:order|payment)|order\s+received|payment\s+received|we\s+(?:have\s+)?received\s+your|received\s+at/i
        // Mirrors FALSE_CREDIT_RECEIVED: "invoice" in debitWords is meant to
        // catch genuine invoice/bill language ("Invoice #1234 generated,
        // amount debited"), but boilerplate disclaimers like "is not a tax
        // invoice" (e.g. ride-receipt fine print) false-match it as a debit
        // signal. This guard only suppresses that negated phrasing — a bare
        // "invoice" mention still scores normally.
        const FALSE_DEBIT_INVOICE = /not\s+an?\s+(?:tax\s+)?invoice/i

        let debitScore = 0, creditScore = 0
        debitWords.forEach(w => {
          if (w === 'invoice' && FALSE_DEBIT_INVOICE.test(windowContent)) return
          if (windowContent.includes(w)) debitScore += 10
        })
        creditWords.forEach(w => {
          if (w === 'received' && FALSE_CREDIT_RECEIVED.test(windowContent)) return
          if (windowContent.includes(w)) creditScore += 10
        })

        if (debitScore === 0 && creditScore === 0) {
          debitWords.forEach(w => {
            if (w === 'invoice' && FALSE_DEBIT_INVOICE.test(lowerContent)) return
            if (lowerContent.includes(w)) debitScore += 5
          })
          creditWords.forEach(w => {
            if (w === 'received' && FALSE_CREDIT_RECEIVED.test(lowerContent)) return
            if (lowerContent.includes(w)) creditScore += 5
          })
        }

        // No debit/credit keyword anywhere near the amount — this used to be a
        // silent `continue` with no logRejection call, the one rejection point
        // in this file that left no trace. A receipt-shaped email (Uber trip,
        // Zomato order) legitimately has no such keyword, so instead of
        // dropping it, fall through: txType below naturally resolves to
        // 'debit' (creditScore is not > debitScore when both are 0) and
        // debitCreditClear is naturally false (|0-0| < 10), which correctly
        // marks the direction as inferred, not keyword-confirmed. The email
        // still has to clear every gate above and the confidence check below.
        const hadNoDirectionSignal = debitScore === 0 && creditScore === 0
        if (hadNoDirectionSignal) {
          logRejection(supabase, user.id, scanLogId, 'no_debit_credit_signal', senderDomain, subject, `amount=${amount}`)
        }

        let txType: 'debit' | 'credit' = creditScore > debitScore ? 'credit' : 'debit'
        const debitCreditClear = Math.abs(debitScore - creditScore) >= 10

        if (amount < 10 && txType === 'credit') {
          if (!/salary|refund|reversed/i.test(emailContentForParsing)) continue
        }
        if (amount < 1) continue

        const paymentMode = detectPaymentMode(emailContentForParsing)
        const cardLast4 = extractCardLast4(emailContentForParsing)
        let cardIssuer = extractBankName(emailContentForParsing) || null
        if (!cardIssuer && cardLast4 && cardMap[cardLast4]) {
          cardIssuer = cardMap[cardLast4]
        }

        // Anchored to the subject and the amount's neighbourhood, never the
        // whole body: a real merchant sits next to its amount ("Rs.250 debited
        // at OLA CABS") or in the subject ("Your trip with Uber"), whereas a
        // brand mentioned in an article tens of KB away is not the merchant.
        // Scanning fullText is how a news story about Ola Electric became an
        // "Ola Cab Ride" transaction.
        const knownMerchant = extractMerchantFromSnippet(`${subject} ${windowContent}`)
        const dynamicMerchant = extractDynamicMerchant(emailContentForParsing)
        const subjectMerchant = subject ? extractDynamicMerchant(subject) : ''

        let merchant = ''
        let category = fallbackCategoryName
        let description = ''

        if (knownMerchant) {
          merchant = knownMerchant.name; category = knownMerchant.category; description = knownMerchant.description
        } else if (dynamicMerchant) {
          merchant = dynamicMerchant
        } else if (subjectMerchant) {
          merchant = subjectMerchant
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
          ruleResult = await applyMerchantRulesFromDB(user.id, merchant, emailContentForParsing, category, supabase)
        } catch {
          ruleResult = applyMerchantRules(merchant, emailContentForParsing, category)
        }

        const finalApprovalStatus = ruleResult.approval_status

        const finalCategory = (categoryNames.length > 0 && !categoryNames.includes(ruleResult.category))
          ? fallbackCategoryName
          : ruleResult.category
        const approval_status = finalApprovalStatus
        const eventType = classifyEventType(emailContentForParsing, txType, finalCategory)

        const confidence = computeConfidence({
          trustedSender: isTrustedSender,
          hardAcceptSubject: isHardAccepted,
          hasTransactionKeyword: (debitScore + creditScore) >= 20,
          hasAmount: true,
          hasMerchant: !isGenericMerchant,
          hasPaymentMode: paymentMode !== 'unknown',
          hasReferenceId: !!reference_id,
          isLargeAmount: amount > 100000,
          debitCreditClear,
        })

        // Below-threshold confidence used to drop the email outright. It now
        // still gets logged (so the audit trail in email_scan_rejections is
        // unchanged), but inserts as a pending transaction instead of being
        // discarded — approval_status is already guaranteed 'pending' here
        // (applyMerchantRulesFromDB/applyMerchantRules never return
        // 'approved'), so a low-confidence guess costs the user one
        // dismiss-tap on the Pending page rather than a permanently missing
        // transaction.
        if (confidence < 65) {
          lowConfidencePendingCount++
          if (lowConfidenceEmailsDetails.length < 5) {
            lowConfidenceEmailsDetails.push(`${senderDomain || 'unknown'}|"${subject.substring(0, 30)}"|Conf:${confidence}`)
          }
          logRejection(supabase, user.id, scanLogId, 'confidence_below_65', senderDomain, subject, `confidence=${confidence}`)
        }

        parsedTxn = {
          user_id: user.id,
          amount,
          type: txType,
          category: finalCategory,
          merchant,
          description,
          date: mailDate,
          source: 'email',
          approval_status,
          category_confirmed_at: approval_status === 'approved' ? null : undefined,
          reference_id,
          payment_mode: paymentMode,
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
          id: scanLogId,
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
          error_message: lowConfidencePendingCount > 0 ? `${lowConfidencePendingCount} email(s) added as pending (low confidence). Samples: ${lowConfidenceEmailsDetails.join('; ')}` : null,
        })
        .select().single()
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
        id: scanLogId,
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: transactionsToInsert.length,
        status: 'success',
        error_message: lowConfidencePendingCount > 0 ? `${lowConfidencePendingCount} email(s) added as pending (confidence < 65). Samples: ${lowConfidenceEmailsDetails.join('; ')}` : null,
      })
      .select().single()

    if (logError) throw logError

    const autoApprovedCount = transactionsToInsert.filter((t) => t.approval_status === 'approved').length

    return {
      data: {
        transactions: insertedTxns,
        log: scanLog as EmailScanLog,
        autoApprovedCount,
        lowConfidencePendingCount,
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

    if (!opts?.userId) {
      await supabase.from('email_scan_logs').insert({
        id: scanLogId,
        user_id: user.id,
        emails_processed: 0,
        transactions_found: 0,
        status: 'failed',
        error_message: errorMessage,
      })
    }
    return { data: null, error: new Error(errorMessage) }
  }
}

/**
 * Calculate the next scheduled refresh time (always 6:00 AM today or tomorrow)
 */
export function getNextRefreshTime(dailyScanTime = '06:00'): Date {
  const [hour, minute] = dailyScanTime.split(':').map(Number)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour || 6, minute || 0, 0, 0)
  if (now.getTime() >= next.getTime()) next.setDate(next.getDate() + 1)
  return next
}

/**
 * Calculate the last scheduled refresh time (always target scan time today or yesterday)
 */
export function getLastScheduledRefreshTime(dailyScanTime = '06:00'): Date {
  const [hour, minute] = dailyScanTime.split(':').map(Number)
  const now = new Date()
  const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour || 6, minute || 0, 0, 0)
  if (now.getTime() >= todayTarget.getTime()) return todayTarget
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour || 6, minute || 0, 0, 0)
}
