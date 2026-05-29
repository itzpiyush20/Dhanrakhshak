// ============================================
// Email Scanner Service — Inbox Simulator
// Simulates bank alert email scanning & UPI parsing
// ============================================

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

const SIMULATED_ALERTS = [
  {
    amount: 180,
    type: 'debit' as const,
    category: 'food',
    merchant: 'Zomato / Swiggy',
    description: 'UPI: Swiggy order payment',
    notes: 'Dear Customer, your Account xx4321 was debited for Rs 180.00 on 29-May-2026 by UPI Ref 61829038 to SWIGGY.',
  },
  {
    amount: 999,
    type: 'debit' as const,
    category: 'utilities',
    merchant: 'Airtel Broadband',
    description: 'UPI: Monthly broadband bill',
    notes: 'Transaction Alert: Your Account xx4321 was debited with INR 999.00 on 29-May-2026 for a UPI txn to AIRTEL BILLS. Ref 71829304.',
  },
  {
    amount: 3500,
    type: 'debit' as const,
    category: 'shopping',
    merchant: 'Myntra Fashion',
    description: 'UPI: Shopping checkout',
    notes: 'ALERT: HDFC Bank A/c xx4321 has been debited for Rs 3500.00 on 29-May-2026 by UPI Ref 80192837 to MYNTRA.',
  },
]

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

/** Simulate scanning gmail inbox for UPI alert emails */
export async function simulateInboxScan() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // Simulate parsing logic:
  // Randomly pick 1 to 3 items from our alerts list to simulate real inbox variance
  const countToImport = Math.floor(Math.random() * 3) + 1 // 1, 2 or 3
  const selectedAlerts = SIMULATED_ALERTS.slice(0, countToImport)

  const transactionsToInsert: TransactionInsert[] = selectedAlerts.map((alert) => ({
    user_id: user.id,
    amount: alert.amount,
    type: alert.type,
    category: alert.category,
    merchant: alert.merchant,
    description: alert.description,
    notes: alert.notes,
    date: new Date().toISOString().split('T')[0],
    source: 'email',
    approval_status: 'pending',
  }))

  // 1. Insert simulated pending transactions
  const { data: insertedTxns, error: txnError } = await supabase
    .from('transactions')
    .insert(transactionsToInsert)
    .select()

  if (txnError) return { data: null, error: txnError }

  // 2. Create the email scan log record
  const { data: scanLog, error: logError } = await supabase
    .from('email_scan_logs')
    .insert({
      user_id: user.id,
      emails_processed: Math.floor(Math.random() * 20) + 10, // 10 to 30 emails scanned
      transactions_found: countToImport,
      status: 'success',
    })
    .select()
    .single()

  if (logError) return { data: null, error: logError }

  return {
    data: {
      transactions: insertedTxns,
      log: scanLog as EmailScanLog,
    },
    error: null,
  }
}

/** Scan actual Gmail inbox using Google OAuth Provider Token */
export async function scanRealGmailInbox() {
  const { data: { session } } = await supabase.auth.getSession()
  const providerToken = session?.provider_token
  const user = session?.user

  if (!user) return { data: null, error: new Error('User not authenticated') }
  if (!providerToken) {
    return {
      data: null,
      error: new Error(
        'Google OAuth Provider Token missing. Please log in with Google to authorize live Gmail tracking.'
      ),
    }
  }

  try {
    // 1. Fetch message list from Gmail API matching query filters
    // Filters for common transactional bank phrases in subject/body
    const q = 'subject:(debited OR credited OR "UPI txn alert" OR "Transaction Alert" OR spent)'
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(q)}`,
      {
        headers: { Authorization: `Bearer ${providerToken}` },
      }
    )

    if (!listRes.ok) {
      throw new Error(`Gmail API List failed: ${listRes.statusText}`)
    }

    const listData = await listRes.json()
    const messages = listData.messages || []

    if (messages.length === 0) {
      // Create empty scan log
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: 0,
          transactions_found: 0,
          status: 'success',
        })
        .select()
        .single()
      
      return { data: { transactions: [], log: log as EmailScanLog }, error: null }
    }

    // 2. Fetch details for each message in parallel to parse snippets
    const detailPromises = messages.map(async (m: { id: string }) => {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
        {
          headers: { Authorization: `Bearer ${providerToken}` },
        }
      )
      if (!detailRes.ok) return null
      return detailRes.json()
    })

    const details = await Promise.all(detailPromises)
    const validDetails = details.filter(Boolean)

    // 3. Run Parser Engine over email snippets
    const transactionsToInsert: TransactionInsert[] = []

    validDetails.forEach((mail: any) => {
      const snippet = mail.snippet || ''
      
      // Parse Amount: search for "Rs. 180" or "Rs 180" or "INR 180" or "Rs.180"
      const amtMatch = snippet.match(/(?:Rs\.?\s*|INR\s*|Rs\s*)([0-9,]+(?:\.[0-9]{2})?)/i)
      if (!amtMatch) return // Skip if no amount parsed

      const amount = Number(amtMatch[1].replace(/,/g, ''))
      if (isNaN(amount) || amount <= 0) return

      // Parse Type: look for debited/spent/paid/withdrawn vs credited/received/added
      let type: 'debit' | 'credit' = 'debit'
      if (/credited|received|added|refund/i.test(snippet)) {
        type = 'credit'
      }

      // Parse Merchant: look for Zomato, Swiggy, Uber, Netflix, Myntra, etc.
      let merchant = 'Auto Detected Merchant'
      let category = 'other'
      
      if (/zomato/i.test(snippet)) {
        merchant = 'Zomato Outflow'
        category = 'food'
      } else if (/swiggy/i.test(snippet)) {
        merchant = 'Swiggy Outflow'
        category = 'food'
      } else if (/uber/i.test(snippet)) {
        merchant = 'Uber Ride'
        category = 'transport'
      } else if (/netflix/i.test(snippet)) {
        merchant = 'Netflix Sub'
        category = 'subscriptions'
      } else if (/myntra|amazon|flipkart/i.test(snippet)) {
        merchant = 'Online Shopping'
        category = 'shopping'
      } else if (/airtel|jio|bsnl|broadband|electricity|bill/i.test(snippet)) {
        merchant = 'Utility Bill'
        category = 'utilities'
      } else if (/salary|credited by/i.test(snippet)) {
        merchant = 'Corporate Salary'
        category = 'salary'
      }

      // Parse Reference ID
      const refMatch = snippet.match(/(?:Ref|RefNo|UPI Ref|Ref\.?\s*)([0-9]{6,15})/i)
      const reference_id = refMatch ? refMatch[1] : null

      // Parse Date
      // Convert Unix internal date to YYYY-MM-DD
      const mailDate = mail.internalDate
        ? new Date(Number(mail.internalDate)).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]

      transactionsToInsert.push({
        user_id: user.id,
        amount,
        type,
        category,
        merchant,
        description: `Auto-Parsed UPI txn: ${merchant}`,
        notes: snippet,
        date: mailDate,
        source: 'email',
        approval_status: 'pending',
        reference_id,
      })
    })

    if (transactionsToInsert.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
        })
        .select()
        .single()
      
      return { data: { transactions: [], log: log as EmailScanLog }, error: null }
    }

    // 4. Check for duplicates in the database
    const { data: existingTxns } = await supabase
      .from('transactions')
      .select('notes, reference_id')
      .eq('user_id', user.id)

    const notesSet = new Set(existingTxns?.map((t) => t.notes).filter(Boolean))
    const refSet = new Set(existingTxns?.map((t) => t.reference_id).filter(Boolean))

    const uniqueTxns = transactionsToInsert.filter((t) => {
      if (t.reference_id && refSet.has(t.reference_id)) return false
      if (t.notes && notesSet.has(t.notes)) return false
      return true
    })

    if (uniqueTxns.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
        })
        .select()
        .single()
      
      return { data: { transactions: [], log: log as EmailScanLog }, error: null }
    }

    // 5. Insert unique parsed transactions
    const { data: insertedTxns, error: txnError } = await supabase
      .from('transactions')
      .insert(uniqueTxns)
      .select()

    if (txnError) throw txnError

    // 6. Log successful parsing activity
    const { data: scanLog, error: logError } = await supabase
      .from('email_scan_logs')
      .insert({
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: uniqueTxns.length,
        status: 'success',
      })
      .select()
      .single()

    if (logError) throw logError

    return {
      data: {
        transactions: insertedTxns,
        log: scanLog as EmailScanLog,
      },
      error: null,
    }
  } catch (err: any) {
    console.error('Error scanning live Gmail:', err)
    
    // Log failure
    await supabase.from('email_scan_logs').insert({
      user_id: user.id,
      emails_processed: 0,
      transactions_found: 0,
      status: 'failed',
      error_message: err.message || 'Live Gmail Scan connection error',
    })

    return { data: null, error: err }
  }
}
