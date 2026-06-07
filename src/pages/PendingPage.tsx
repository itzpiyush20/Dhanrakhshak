// ============================================
// PendingPage — UPI Transaction Approval Flow
// Auto-scans bank alerts and reviews pending txns
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts'
import { Card, Button, Input, Select, Badge, EmptyState } from '@/components/ui'
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  scanRealGmailInbox,
  saveMerchantRule,
  supabase,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  applyMerchantRules,
} from '@/services'
import { saveMerchantRuleToDb } from '@/services/learningEngine'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, parsePaymentSource, isCardPayment, withTimeout } from '@/utils'
import { CATEGORIES } from '@/constants'
import type { Database } from '@/types/database'
import { useToast } from '@/context'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

// isCardPayment is now imported from @/utils

function parseTransactionTime(notes: string, createdAt: string): string {
  // Search for time format: HH:MM:SS or HH:MM or HH:MM AM/PM
  const timeMatch = notes.match(/([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?\s*(am|pm)?/i)
  if (timeMatch) {
    const hh = timeMatch[1]
    const mm = timeMatch[2]
    const ampm = timeMatch[4] ? ` ${timeMatch[4].toUpperCase()}` : ''
    return `${hh}:${mm}${ampm}`
  }
  
  try {
    const date = new Date(createdAt)
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  } catch (e) {}
  
  return '12:00 PM'
}

function parseShortDescription(description: string, notes: string, merchant: string): string {
  // Use the description if it's clean, non-generic, and short enough
  if (
    description &&
    !description.includes('Auto-Parsed') &&
    !description.includes('Auto Detected') &&
    !description.includes('Bank Transaction') &&
    description.length < 40
  ) {
    return description
  }
  
  const text = notes.toLowerCase()
  
  if (text.includes('swiggy')) return 'Swiggy meal delivery'
  if (text.includes('zomato')) return 'Zomato food order'
  if (text.includes('uber eats')) return 'Uber Eats order'
  if (text.includes('uber')) return 'Uber cab ride'
  if (text.includes('ola')) return 'Ola cab ride'
  if (text.includes('netflix')) return 'Netflix subscription'
  if (text.includes('spotify')) return 'Spotify premium'
  if (text.includes('myntra')) return 'Myntra fashion purchase'
  if (text.includes('amazon')) return 'Amazon checkout'
  if (text.includes('flipkart')) return 'Flipkart shopping'
  if (text.includes('blinkit')) return 'Blinkit quick delivery'
  if (text.includes('bigbasket')) return 'BigBasket groceries'
  if (text.includes('zepto')) return 'Zepto quick commerce'
  if (text.includes('airtel') || text.includes('broadband')) return 'Telecom / broadband bill'
  if (text.includes('jio')) return 'Jio recharge'
  if (text.includes('electricity') || text.includes('bescom') || text.includes('tata power')) return 'Electricity bill'
  if (text.includes('salary')) return 'Corporate payroll credit'
  if (text.includes('refund')) return 'Refund credit'
  if (text.includes('cashback')) return 'Cashback credit'
  if (text.includes('emi')) return 'EMI debit'
  if (text.includes('insurance')) return 'Insurance premium'
  if (text.includes('mutual fund') || text.includes('sip')) return 'Investment SIP debit'
  
  // Use merchant if it's valid
  if (merchant && merchant.length > 1) {
    const cleanMerchant = merchant
      .replace(/(?:outflow|ride|sub|rides|alert|payment|fashion)/i, '')
      .trim()
    if (cleanMerchant.length > 1) {
      return `${cleanMerchant} payment`
    }
  }
  
  // Use payment source as context
  const paymentSrc = parsePaymentSource(notes)
  if (paymentSrc !== 'Bank' && paymentSrc !== 'Main Wallet') {
    return `${paymentSrc} transaction`
  }
  
  return 'Bank transaction'
}

export default function PendingPage() {
  const { user, signInWithGoogle, hasGoogleToken, notifyGoogleTokenCleared, profile } = useAuth()
  const [pendingTxns, setPendingTxns] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // isGoogleConnected is a direct alias for hasGoogleToken from AuthContext.
  // It's a useState<boolean> (not a computed value), so React re-renders whenever
  // the token arrives (after OAuth) or is cleared (after expiry / sign-out).
  const isGoogleConnected = hasGoogleToken
  const [totalPendingCount, setTotalPendingCount] = useState(0)
  const [totalPendingValue, setTotalPendingValue] = useState(0)

  // Scheduling and Inactivity Warning states
  const [showInactivityBanner, setShowInactivityBanner] = useState(false)
  const [syncingBackground, setSyncingBackground] = useState(false)

  // Local state for inline edits
  const [editingFields, setEditingFields] = useState<
    Record<string, { category: string; description: string }>
  >({})

  // Confirmation Modal State
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null)
  const { showToast } = useToast()

  // States for Auto-Categorized Review Popup
  const [autoCategorizedTxns, setAutoCategorizedTxns] = useState<any[]>([])
  const [showAutoReviewModal, setShowAutoReviewModal] = useState(false)
  const [autoCategoryUpdatingId, setAutoCategoryUpdatingId] = useState<string | null>(null)

  // Scan rate-limit state (for non-owner users)
  const [scanCooldownMessage, setScanCooldownMessage] = useState<string | null>(null)

  const fetchPendingData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const txnsRes = await withTimeout(
        getTransactions({ status: 'pending', limit: 15 }),
        45000,
        'Pending data fetch'
      )

      if (txnsRes.error) throw txnsRes.error

      // isGoogleConnected is now derived from hasGoogleToken (AuthContext) — no need to set it here

      const txns = txnsRes.data || []
      setPendingTxns(txns)
      setTotalPendingCount(txnsRes.count || 0)

      // Fetch the sum of all pending transaction amounts
      const { data: allPending } = await supabase
        .from('transactions')
        .select('amount')
        .eq('approval_status', 'pending')
      
      const sum = allPending?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
      setTotalPendingValue(sum)

      // Prepopulate editing form states
      const fieldsMap: Record<string, { category: string; description: string }> = {}
      txns.forEach((t) => {
        fieldsMap[t.id] = {
          category: t.category,
          description: parseShortDescription(t.description || '', t.notes || '', t.merchant || ''),
        }
      })
      setEditingFields(fieldsMap)
    } catch (err: any) {
      console.error('Error loading pending transactions:', err)
      setError(err.message || 'Failed to load reviews.')
    } finally {
      setLoading(false)
    }
  }, [])

  const checkInactivityAndAutoSync = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: scanLogs } = await supabase
        .from('email_scan_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)

      const lastScan = scanLogs && scanLogs.length > 0 ? new Date(scanLogs[0].scanned_at) : null
      const now = new Date()

      // Show banner if last scan > 24 hours ago
      if (!lastScan || (now.getTime() - lastScan.getTime() > 24 * 60 * 60 * 1000)) {
        setShowInactivityBanner(true)
      }

      // Auto-sync if last scan was before the last scheduled 6:00 AM refresh
      const lastScheduledTime = getLastScheduledRefreshTime()
      if (!lastScan || lastScan.getTime() < lastScheduledTime.getTime()) {
        setSyncingBackground(true)
        // hasGoogleToken from context already covers both session and localStorage
        if (hasGoogleToken) {
          try {
            const res = await scanRealGmailInbox()
            if (res && !res.error) {
              setShowInactivityBanner(false)
              fetchPendingData()
            }
          } catch (e) {
            console.warn('Auto-sync failed:', e)
          }
        }
        // Non-Google users: no auto-scan
        setSyncingBackground(false)
      }
    } catch (err) {
      console.error('Pending page auto-sync check error:', err)
    }
  }, [fetchPendingData])

  useEffect(() => {
    document.title = 'Pending Alerts | Dhanrakshak'
    fetchPendingData()
  }, [fetchPendingData])

  useEffect(() => {
    checkInactivityAndAutoSync()
  }, [checkInactivityAndAutoSync])

  const handleFieldChange = (id: string, key: 'category' | 'description', value: string) => {
    setEditingFields((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }))
  }

  const handleApprove = async (id: string) => {
    const fields = editingFields[id]
    if (!fields) return

    // Learn merchant mapping rule — save to BOTH localStorage (fast) AND Supabase DB (persistent)
    const originalTxn = pendingTxns.find((t) => t.id === id)
    if (originalTxn) {
      const merchantToLearn = originalTxn.merchant || ''
      if (
        merchantToLearn &&
        merchantToLearn.length > 2 &&
        !['Retail Transaction', 'Incoming Credit', 'Bank Transaction'].includes(merchantToLearn)
      ) {
        // localStorage (immediate)
        saveMerchantRule(merchantToLearn, fields.category, true)
        // Supabase DB (persistent, cross-device)
        if (user?.id) {
          saveMerchantRuleToDb(user.id, merchantToLearn, fields.category, true).catch(console.warn)
        }
      }
    }

    setActionLoadingId(id)
    setError(null)
    try {
      // Automatically bulk-categorize every other transaction from the same merchant/vendor
      if (originalTxn && originalTxn.merchant) {
        const { error: bulkErr } = await supabase
          .from('transactions')
          .update({ category: fields.category })
          .eq('user_id', originalTxn.user_id)
          .eq('merchant', originalTxn.merchant)
        
        if (bulkErr) {
          console.error('Failed to bulk-categorize matching transactions:', bulkErr)
        }
      }

      const { error } = await updateTransaction(id, {
        category: fields.category,
        description: fields.description,
        approval_status: 'approved',
      })

      if (error) throw error
      await fetchPendingData()
    } catch (err: any) {
      console.error('Error approving transaction:', err)
      setError(err.message || 'Failed to approve transaction.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!confirm('Reject and delete this transaction alert?')) return

    setActionLoadingId(id)
    setError(null)
    try {
      const { error } = await deleteTransaction(id)
      if (error) throw error
      await fetchPendingData()
    } catch (err: any) {
      console.error('Error rejecting transaction:', err)
      setError(err.message || 'Failed to reject transaction.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleAutoCategoryChange = async (txnId: string, merchant: string, newCategory: string) => {
    setAutoCategoryUpdatingId(txnId)
    try {
      // 1. Update rule weights in the self-learning engine
      if (merchant) {
        saveMerchantRule(merchant, newCategory, true)
      }

      // 2. Update database row
      const { error: updateErr } = await supabase
        .from('transactions')
        .update({ category: newCategory })
        .eq('id', txnId)

      if (updateErr) throw updateErr

      // 3. Update local state to reflect change instantly in the list
      setAutoCategorizedTxns((prev) =>
        prev.map((t) => (t.id === txnId ? { ...t, category: newCategory } : t))
      )
    } catch (err) {
      console.error('Failed to change auto-categorized transaction:', err)
      showToast('Error updating category. Please try again.', 'error')
    } finally {
      setAutoCategoryUpdatingId(null)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanSuccessMessage(null)
    setScanCooldownMessage(null)
    setError(null)

    try {
      // Gate: isGoogleConnected = hasGoogleToken from AuthContext (useState<boolean>)
      // It's already reactive — no need to re-check session or localStorage here.
      if (!isGoogleConnected) {
        setError('Connect your Google account first. Click "Connect Google Account" below.')
        setScanning(false)
        return
      }

      const res = await scanRealGmailInbox()

      if (res.error) {
        // Rate-limit message from the scanner engine (non-owner users)
        if (res.error.message?.includes('Scan limit reached')) {
          setScanCooldownMessage(res.error.message)
          return
        }
        // If the scanner detected an expired token (401), it already called
        // clearGoogleToken(). We call notifyGoogleTokenCleared() to update
        // hasGoogleToken state in AuthContext so the UI reacts immediately.
        if (res.error.message?.includes('expired') || res.error.message?.includes('TOKEN_EXPIRED')) {
          notifyGoogleTokenCleared()
        }
        throw res.error
      }

      const count = res.data?.transactions?.length || 0
      const autoApproved = res.data?.autoApprovedCount || 0
      const pendingCount = count - autoApproved
      const skipped = (res.data as any)?.skippedConfidence || 0

      setScanSuccessMessage(
        `✨ Sync complete! Found ${count} transaction(s). Auto-approved ${autoApproved}, added ${pendingCount} for review.${skipped > 0 ? ` (${skipped} emails skipped — low confidence)` : ''}`
      )

      // Show auto-categorized review popup if any were auto-approved
      const autoList = res.data?.transactions?.filter((t: any) => t.approval_status === 'approved') || []
      if (autoList.length > 0) {
        setAutoCategorizedTxns(autoList)
        setShowAutoReviewModal(true)
      }

      await fetchPendingData()
    } catch (err: any) {
      console.error('Scan error:', err)
      setError(err.message || 'Scan failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  const handleReconnectGoogle = async () => {
    try {
      setScanning(true)
      setError(null)
      // forceConsent=true — always request a fresh Google access token
      // This is the ONLY place in the app that uses forceConsent
      const { error } = await signInWithGoogle('/pending', true)
      if (error) throw new Error(error)
    } catch (err: any) {
      setError(err.message || 'Failed to redirect to Google.')
      setScanning(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Auto-Detected Alerts</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Bank alerts scanned from email notifications. Review, correct category, and approve them.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => handleScan()}
                loading={scanning || syncingBackground}
                disabled={scanning || syncingBackground || !!scanCooldownMessage}
                className="shrink-0 gap-1.5 shadow-md justify-center"
                aria-label="Scan Gmail Inbox for new bank alerts"
              >
                ⚡ Scan Bank Alerts
              </Button>
            </div>
            <span className="text-[10px] font-semibold text-brand-300 font-mono bg-surface-2 border border-border-subtle/50 px-2 py-0.5 rounded-md">
              📅 Next Refresh: {getNextRefreshTime().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} at 6:00 AM
            </span>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-sm text-[var(--status-danger-text)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
            <div>{error}</div>
            {error.includes('expired') && (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 text-[var(--status-danger-text)] border-[var(--status-danger-border)] bg-[var(--status-danger-subtle)] hover:bg-[var(--status-danger-border)] hover:border-[var(--status-danger-text)]/40 transition-all text-xs justify-center"
                onClick={handleReconnectGoogle}
                loading={scanning}
                disabled={scanning}
              >
                🔑 Reconnect Google
              </Button>
            )}
          </div>
        )}

        {showInactivityBanner && (
          <div role="alert" className="rounded-2xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4 text-sm text-[var(--status-warning-text)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in shadow-md">
            <div className="flex items-start gap-2.5">
              <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
              <div>
                <p className="font-bold text-white">Refresh Alert — Action Required</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Your transaction tracker has not refreshed in the last 24 hours. Please refresh the tracker again to refresh your transactions to cover the days if you have not covered.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 text-[var(--status-warning-text)] border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] hover:bg-[var(--status-warning-border)] hover:border-[var(--status-warning-text)]/40 transition-all text-xs justify-center"
              onClick={handleScan}
              loading={scanning || syncingBackground}
              disabled={scanning || syncingBackground}
            >
              🔄 Sync Now
            </Button>
          </div>
        )}

        {scanSuccessMessage && (
          <div role="status" className="rounded-2xl bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] p-4 text-sm text-[var(--status-positive-text)] flex items-center justify-between animate-fade-in">
            <span>{scanSuccessMessage}</span>
            <button
              onClick={() => setScanSuccessMessage(null)}
              className="text-[var(--status-positive-text)] hover:opacity-85 font-bold ml-2 text-xs transition-colors"
              aria-label="Dismiss success message"
            >
              Dismiss
            </button>
          </div>
        )}

        {scanCooldownMessage && (
          <div role="status" className="rounded-2xl bg-brand-500/10 border border-brand-500/20 p-4 text-sm text-brand-500 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="text-lg shrink-0" aria-hidden="true">⏳</span>
              <div>
                <p className="font-bold text-white text-sm">Daily Scan Limit Reached</p>
                <p className="text-xs text-zinc-400 mt-0.5">{scanCooldownMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setScanCooldownMessage(null)}
              className="text-brand-500 hover:text-brand-600 font-bold ml-2 text-xs transition-colors shrink-0"
              aria-label="Dismiss scan limit message"
            >
              Dismiss
            </button>
          </div>
        )}

        {!isGoogleConnected && !error && (
          <div role="status" className="rounded-2xl bg-brand-500/10 border border-brand-500/20 p-4 text-sm text-brand-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in shadow-md">
            <div className="flex items-start gap-2.5">
              <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">🔗</span>
              <div>
                <p className="font-bold text-white">
                  Connect Google to Enable Live Scanning
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Sign in with Google to allow Dhanrakshak to read your bank alert emails and auto-detect transactions. {profile?.subscription_status === 'trial' ? '(Trial account active)' : (profile?.subscription_plan_type === 'monthly' ? '(Basic account active)' : '(Pro account active)')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="secondary"
                className="text-brand-500 border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 hover:border-brand-500/35 transition-all text-xs justify-center animate-fade-in"
                onClick={handleReconnectGoogle}
                loading={scanning}
                disabled={scanning}
              >
                🔑 Connect Google Account
              </Button>
              {(profile?.subscription_status === 'trial' || (profile?.subscription_status === 'active' && profile?.subscription_plan_type === 'monthly')) && (
                <Link to="/pricing" className="shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-brand-300 border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 hover:border-brand-500/35 transition-all text-xs justify-center font-bold"
                  >
                    👑 Upgrade to Pro
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {!isGoogleConnected && (
          <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
            <Card className="bg-surface-1 border-border-subtle p-6 space-y-4 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">🛡️</span>
                <h3 className="font-bold text-white text-base">Your Data Stays on Your Device</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                Dhanrakshak uses <strong>Private Local Processing</strong>. When you connect your Google account, our app fetches your bank alert emails and reads them <em>directly inside your browser</em>.
              </p>
              <div className="rounded-xl bg-surface-2 p-3 text-[11px] text-zinc-500 font-medium">
                💡 <strong>Think of it like an offline desk calculator:</strong> We never upload your raw emails, passwords, or transaction details to our servers. Your banking information is processed and stored locally on this device.
              </div>
            </Card>

            <Card className="bg-surface-1 border-border-subtle p-6 space-y-4 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">🌱</span>
                <h3 className="font-bold text-white text-base">Explore with Demo Data</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                Not ready to connect your Gmail yet? You can try out every feature (budgets, charts, and transaction alerts) using pre-generated sample transactions.
              </p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide">No credentials required</span>
                <Link to="/profile">
                  <Button size="sm" variant="secondary" className="text-xs font-bold text-brand-400 border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10">
                    Go to Demo Setup
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        )}

        {/* Quick summary stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-l-4 border-l-[var(--status-warning-text)]/80 hover:border-l-[var(--status-warning-text)] transition-all shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Pending Alerts
            </p>
            <p className="mt-1.5 text-2xl font-bold text-white">
              {totalPendingCount}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Awaiting your approval</p>
          </Card>
          <Card className="border-l-4 border-l-brand-500/80 hover:border-l-brand-500 transition-all shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Cumulative Value
            </p>
            <p className="mt-1.5 text-2xl font-bold text-brand-400">
              {formatCurrency(totalPendingValue)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Total pending cashflow impact</p>
          </Card>
        </div>

        {/* Main layout reviews */}
        <div className="w-full space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white">Review Required</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Transactions displayed here are from the past 7 days.</p>
          </div>

          {loading ? (
            // Skeletons
            [1, 2].map((i) => (
              <Card key={i} className="h-60 relative overflow-hidden">
                <div className="skeleton absolute inset-0 opacity-70" />
              </Card>
            ))
          ) : pendingTxns.length === 0 ? (
            <Card>
              <EmptyState
                icon="🎉"
                title="All caught up!"
                description="No pending transactions require review. Use the scanner above to import new alerts."
              />
            </Card>
          ) : (
            pendingTxns.map((txn, idx) => {
              const localFields = editingFields[txn.id] || {
                category: txn.category,
                description: txn.description || '',
              }
              const isDebit = txn.type === 'debit'

              const suggestion = applyMerchantRules(
                txn.merchant || '',
                txn.notes || '',
                txn.category
              )

              const confidenceColor = 
                suggestion.confidence >= 80 ? 'bg-[var(--status-positive-subtle)] text-[var(--status-positive-text)] border-[var(--status-positive-border)]' :
                suggestion.confidence >= 50 ? 'bg-[var(--status-warning-subtle)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]' :
                'bg-[var(--status-danger-subtle)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]'

              return (
                <Card
                  key={txn.id}
                  className={`border-dashed border-zinc-700/60 bg-surface-1/90 group hover:border-zinc-500/80 transition-all flex flex-col gap-4 animate-slide-up border-l-4 ${
                    isDebit ? 'border-l-[var(--status-danger-text)]/80' : 'border-l-[var(--status-positive-text)]/80'
                  }`}
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  {/* Header line */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 overflow-hidden flex-nowrap">
                        <Badge variant="info" className="shrink-0 whitespace-nowrap">Detected Alert</Badge>
                        <Badge variant="warning" className="truncate max-w-[150px] whitespace-nowrap font-bold" title={txn.merchant || ''}>
                          🏪 {txn.merchant || parseShortDescription(txn.description || '', txn.notes || '', '')}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-semibold">{formatDate(txn.date)}</span>
                    </div>
                    <span
                      className={`text-base font-extrabold shrink-0 px-3 py-1 rounded-xl border transition-all ${
                        isDebit
                          ? 'text-[var(--status-danger-text)] bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)] shadow-sm shadow-[var(--status-danger-text)]/5'
                          : 'text-[var(--status-positive-text)] bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)] shadow-sm shadow-[var(--status-positive-text)]/5'
                      }`}
                    >
                      {formatCurrency(Number(txn.amount))}
                    </span>
                  </div>

                  {/* Parsed transaction details in one clean responsive container */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 bg-surface-0/40 border border-border-subtle/20 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 shadow-inner">
                    <span className="flex items-center gap-1 bg-surface-2/60 border border-border-subtle/20 rounded-lg px-2 py-1 text-zinc-300 shrink-0">
                      <span aria-hidden="true">🕒</span> <strong>{parseTransactionTime(txn.notes || '', txn.created_at)}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-surface-2/60 border border-border-subtle/20 rounded-lg px-2 py-1 text-zinc-300 shrink-0">
                      <span aria-hidden="true">{isCardPayment(txn.notes) ? '💳' : '🏦'}</span>{' '}
                      <strong>
                        {parsePaymentSource(txn.notes)}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1 bg-surface-2/60 border border-border-subtle/20 rounded-lg px-2 py-1 text-brand-300 min-w-0 max-w-full">
                      <span aria-hidden="true" className="shrink-0">📝</span> <strong className="truncate">{localFields.description || parseShortDescription(txn.description, txn.notes || '', txn.merchant || '')}</strong>
                    </span>
                  </div>

                  {/* Form controls */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`cat-select-${txn.id}`}
                        className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5"
                      >
                        Category Classification
                      </label>
                      <Select
                        id={`cat-select-${txn.id}`}
                        value={localFields.category}
                        onChange={(e) => handleFieldChange(txn.id, 'category', e.target.value)}
                        disabled={actionLoadingId === txn.id}
                      >
                        {Object.entries(CATEGORIES).map(([key, cat]) => (
                          <option key={key} value={key}>
                            {cat.emoji} {cat.label}
                          </option>
                        ))}
                      </Select>
                      <div className="flex flex-wrap items-center gap-2.5 mt-3 px-3 py-2 rounded-xl bg-surface-2/45 border border-border-subtle/30 shadow-inner">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 border rounded-full ${confidenceColor}`}>
                          {suggestion.confidence > 0 ? `${suggestion.confidence}% Confidence` : 'Low Confidence'}
                        </span>
                        <span className="text-[10px] text-zinc-300 font-semibold flex items-center gap-1">
                          <span>🧠</span> <span className="text-zinc-400">{suggestion.matchReason}</span>
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`desc-input-${txn.id}`}
                        className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5"
                      >
                        Edit Label / Description
                      </label>
                      <Input
                        id={`desc-input-${txn.id}`}
                        value={localFields.description}
                        onChange={(e) =>
                          handleFieldChange(txn.id, 'description', e.target.value)
                        }
                        placeholder="e.g. Swiggy Lunch"
                        disabled={actionLoadingId === txn.id}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-border-subtle/30">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-[var(--status-danger-text)] border-[var(--status-danger-border)] bg-[var(--status-danger-subtle)] hover:bg-[var(--status-danger-border)] hover:border-[var(--status-danger-text)]/40 w-full sm:w-auto justify-center"
                      onClick={() => handleReject(txn.id)}
                      disabled={actionLoadingId === txn.id}
                    >
                      🗑️ Reject Alert
                    </Button>
                    <Button
                      size="sm"
                      className="w-full sm:w-auto justify-center"
                      onClick={() => setConfirmApproveId(txn.id)}
                      loading={actionLoadingId === txn.id}
                      disabled={actionLoadingId === txn.id}
                    >
                      ✔️ Review & Approve
                    </Button>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* 🤖 Auto-Categorization Review Modal */}
      {showAutoReviewModal && autoCategorizedTxns.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="Auto-Categorized Expenses Review">
          <div className="w-full max-w-xl bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col max-h-[85vh] animate-scale-up">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border-subtle/30 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-xl animate-pulse">
                  🤖
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Auto-Categorization Review</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Expenses categorized based on your past learnings</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAutoReviewModal(false)
                  setAutoCategorizedTxns([])
                }}
                className="h-8 w-8 rounded-full border border-border-subtle/50 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-2 transition-colors cursor-pointer"
                aria-label="Close auto-review dialog"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            {/* Subtext info panel */}
            <div className="bg-brand-500/5 border border-brand-500/10 rounded-xl p-3.5 mt-4 text-xs text-brand-300 leading-relaxed">
              <strong>💡 Self-Learning Engine Active:</strong> The following transactions were auto-approved. You can change their categories below to automatically update future classification rules.
            </div>

            {/* List area */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              {autoCategorizedTxns.map((txn) => (
                <div key={txn.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-surface-2 border border-border-subtle hover:border-zinc-700/50 transition-all gap-3 animate-fade-in">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{txn.merchant || 'Unknown Vendor'}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/30">{formatDate(txn.date)}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 italic max-w-[280px] truncate">{txn.description || txn.notes || 'No description'}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                    <span className="text-sm font-bold text-[var(--status-positive-text)] font-mono pr-1">
                      {formatCurrency(Number(txn.amount))}
                    </span>
                    
                    <div className="flex items-center gap-1.5 relative">
                      <select
                        value={txn.category}
                        disabled={autoCategoryUpdatingId === txn.id}
                        onChange={(e) => handleAutoCategoryChange(txn.id, txn.merchant || '', e.target.value)}
                        className="bg-surface-3 border border-border-subtle text-xs text-zinc-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer font-semibold"
                        aria-label={`Change category for ${txn.merchant}`}
                      >
                        {Object.entries(CATEGORIES).map(([key, cat]) => (
                          <option key={key} value={key}>
                            {cat.emoji} {cat.label}
                          </option>
                        ))}
                      </select>
                      {autoCategoryUpdatingId === txn.id && (
                        <div className="absolute right-2 top-2 h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border-subtle/30 pt-4 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-medium">
                Showing {autoCategorizedTxns.length} auto-approved entries
              </span>
              <Button
                variant="primary"
                onClick={() => {
                  setShowAutoReviewModal(false)
                  setAutoCategorizedTxns([])
                }}
                className="font-bold text-xs"
              >
                Close & Save Rules
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 📋 Approval Confirmation Modal */}
      {confirmApproveId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="Confirm Transaction Approval">
          <div className="w-full max-w-md bg-surface-1/90 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col animate-scale-up">
            <div className="flex items-center gap-3 border-b border-border-subtle/30 pb-4 mb-4">
              <span className="text-2xl text-brand-400 select-none" aria-hidden="true">❓</span>
              <h3 className="text-base font-bold text-white">Approve Transaction</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed mb-6">
              Are you sure you want to approve this transaction?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setConfirmApproveId(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const id = confirmApproveId
                  setConfirmApproveId(null)
                  await handleApprove(id)
                  showToast('Transaction approved')
                }}
              >
                Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
