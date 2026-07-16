// ============================================
// DashboardPage — Premium Financial Dashboard
// Displays stats, spending breakdown, recent txns
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/layouts'
import { Card, Button, EmptyState, Modal } from '@/components/ui'
import ActiveSubscriptionsWidget from '@/components/dashboard/ActiveSubscriptionsWidget'
import QuickAddWidget from '@/components/dashboard/QuickAddWidget'
import ReceivablesCard from '@/components/dashboard/ReceivablesCard'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Crown,
  DollarSign,
  BarChart2,
  Settings,
  TrendingUp,
  TrendingDown,
  Shield,
  Download,
  Check,
  CreditCard,
  Wallet,
  Sparkles,
  X,
  Flame,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'
import { getTransactions, getMonthlySummary, getLoggingStreak } from '@/services/transactions'
import { getBudgets } from '@/services/budgets'
import {
  supabase,
  resetAccountData,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  scanRealGmailInbox,
  seedSandboxData,
} from '@/services'
import { migrateLocalStorageRulesToDB } from '@/services/learningEngine'
import { formatCurrency, formatCurrencyCompact, getCurrentMonth, formatDate, withTimeout } from '@/utils'
import { CATEGORIES } from '@/constants'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface SummaryData {
  total_income: number
  total_expenses: number
  savings: number
  category_breakdown: Array<{
    category: string
    amount: number
    count: number
    percentage: number
  }>
}

interface SyncSummary {
  total: number
  autoApproved: number
  pendingReview: number
  topCategory?: { label: string; amount: number }
}

export default function DashboardPage() {
  const { user, profile, hasGoogleToken, notifyGoogleTokenCleared, dailyScanTime } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // Helper to extract first name of the user, ignoring standard titles
  const getFirstName = (fullName?: string) => {
    const nameToParse = profile?.full_name || fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'Account'
    const parts = nameToParse.trim().split(/\s+/)
    let result = parts[0]
    const cleanWord = (word: string) => word.replace(/[^a-zA-Z]/g, '').toLowerCase()
    if (parts.length > 1 && ['ca', 'dr', 'mr', 'ms', 'mrs'].includes(cleanWord(parts[0]))) {
      result = parts[1]
    }
    return result
  }

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Safe-to-spend hero number
  const [monthBudgetTotal, setMonthBudgetTotal] = useState(0)

  // Calm consistency chip — real logging activity, not app opens
  const [streakInfo, setStreakInfo] = useState<{ streak: number; loggedToday: boolean }>({
    streak: 0,
    loggedToday: false,
  })

  // First-run checklist
  const [checklistDismissed, setChecklistDismissed] = useState(false)
  const [visitedAnalytics, setVisitedAnalytics] = useState(false)

  // Post-sync summary card (replaces plain "sync complete" toast)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)

  // Demo data seeding (from the landing page "Try demo" CTA)
  const [seedingDemo, setSeedingDemo] = useState(false)

  // Month-end recap — shown once on the first visit of a new month
  const [monthEndRecap, setMonthEndRecap] = useState<{
    month: string
    totalExpenses: number
    totalIncome: number
    topCategory?: { label: string; amount: number }
    priorExpenses: number | null
  } | null>(null)

  // Recent transactions modal state
  const [showAllRecentModal, setShowAllRecentModal] = useState(false)
  const [allRecentTransactions, setAllRecentTransactions] = useState<TransactionRow[]>([])
  const [loadingAllRecent, setLoadingAllRecent] = useState(false)

  const handleOpenRecentModal = async () => {
    setShowAllRecentModal(true)
    setLoadingAllRecent(true)
    try {
      const { data } = await getTransactions({ limit: 15 })
      setAllRecentTransactions(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAllRecent(false)
    }
  }

  // Scheduling, Inactivity popup, and Year-End transition states
  const [showYearEndModal, setShowYearEndModal] = useState(false)
  const [priorYearTransactions, setPriorYearTransactions] = useState<TransactionRow[]>([])
  const [priorYear, setPriorYear] = useState<number>(new Date().getFullYear() - 1)
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [showInactivityBanner, setShowInactivityBanner] = useState(false)
  const [syncingBackground, setSyncingBackground] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Widget customization states
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [widgets, setWidgets] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('dhanrakshak_dashboard_widgets')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {}
    }
    return { stats: true, breakdown: true, recent: true, subscriptions: true }
  })

  const toggleWidget = (key: string) => {
    const updated = { ...widgets, [key]: !widgets[key] }
    setWidgets(updated)
    localStorage.setItem('dhanrakshak_dashboard_widgets', JSON.stringify(updated))
  }

  // Category Details modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string | null>(null)
  const [categoryTransactions, setCategoryTransactions] = useState<TransactionRow[]>([])
  const [loadingCategoryTxns, setLoadingCategoryTxns] = useState(false)

  const handleCategoryClick = async (categoryCode: string) => {
    setSelectedCategoryCode(categoryCode)
    setShowCategoryModal(true)
    setLoadingCategoryTxns(true)
    try {
      const { data } = await getTransactions({
        month: selectedMonth,
        category: categoryCode,
        type: 'debit',
        limit: 100,
      })
      setCategoryTransactions(data || [])
    } catch (e) {
      console.error('Error loading category transactions:', e)
    } finally {
      setLoadingCategoryTxns(false)
    }
  }

  const fetchDashboardData = useCallback(async (month: string, silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [summaryRes, transactionsRes, budgetsRes] = await withTimeout(
        Promise.all([
          getMonthlySummary(month),
          getTransactions({ limit: 5 }), // Show global recent transactions
          getBudgets(month),
        ]),
        45000, // 45-second timeout to handle Supabase cold starts
        'Dashboard data fetch'
      )

      if (summaryRes.error) throw summaryRes.error
      if (transactionsRes.error) throw transactionsRes.error

      setSummary(summaryRes.data)
      setRecentTransactions(transactionsRes.data || [])
      setMonthBudgetTotal((budgetsRes.data || []).reduce((sum, b) => sum + Number(b.amount), 0))
      if (silent) setError(null) // Clear any previous timeout error on silent success
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  const checkScheduledTasks = useCallback(async () => {
    if (!user) return
    try {
      const currentYear = new Date().getFullYear()
      // 1. Check if there are transactions from prior years
      const { data: priorTxns, error: priorErr } = await supabase
        .from('transactions')
        .select('*')
        .lt('date', `${currentYear}-01-01`)
      
      if (!priorErr && priorTxns && priorTxns.length > 0) {
        const years = priorTxns
          .map(t => t.date ? new Date(t.date).getFullYear() : null)
          .filter((y): y is number => y !== null && !isNaN(y))
        
        if (years.length > 0) {
          const minYear = Math.min(...years)
          setPriorYear(minYear)
          setPriorYearTransactions(priorTxns)
          setShowYearEndModal(true)
        }
      }

      // 2. Check last scan log to determine inactivity and auto-refresh
      const { data: scanLogs } = await supabase
        .from('email_scan_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)

      const lastScan = scanLogs && scanLogs.length > 0 ? new Date(scanLogs[0].scanned_at) : null
      setLastScanTime(lastScan)

      const now = new Date()
      // If no scans, or last scan was > 24 hours ago
      if (!lastScan || (now.getTime() - lastScan.getTime() > 24 * 60 * 60 * 1000)) {
        setShowInactivityBanner(true)
      }

      // 3. Auto-sync if last scan was before the last scheduled refresh
      if (profile) {
        const lastScheduledTime = getLastScheduledRefreshTime(dailyScanTime)
        if (!lastScan || lastScan.getTime() < lastScheduledTime.getTime()) {
          setSyncingBackground(true)
          try {
            // Use hasGoogleToken from AuthContext — the single source of truth.
            // This is a useState<boolean> that updates reactively when the token
            // is saved (on sign-in) or cleared (on expiry / sign-out).
            if (hasGoogleToken) {
              const res = await withTimeout(scanRealGmailInbox(), 30000, 'Gmail scan')
              if (res && !res.error) {
                const { data: newLogs } = await supabase
                  .from('email_scan_logs')
                  .select('*')
                  .eq('user_id', user.id)
                  .eq('status', 'success')
                  .order('scanned_at', { ascending: false })
                  .limit(1)
                if (newLogs && newLogs.length > 0) {
                  setLastScanTime(new Date(newLogs[0].scanned_at))
                  setShowInactivityBanner(false)
                }
                fetchDashboardData(selectedMonth, true)
              } else if (res?.error) {
                // If token expired, notify AuthContext so UI updates everywhere
                if (res.error.message?.includes('expired') || res.error.message?.includes('TOKEN_EXPIRED')) {
                  notifyGoogleTokenCleared()
                }
                // Background syncs fail silently — error shown on manual Sync Now
                console.warn('Background auto-sync error:', res.error.message)
              }
            }
            // Non-Google users: no automatic scan
          } catch (syncErr: any) {
            console.warn('Background sync failed:', syncErr)
          } finally {
            setSyncingBackground(false)
          }
        }
      }
    } catch (err) {
      console.error('Error running scheduler check:', err)
    }
  }, [user, selectedMonth, fetchDashboardData])

  useEffect(() => {
    document.title = 'Dashboard | Dhanrakshak'
    fetchDashboardData(selectedMonth)
    // One-time migration of localStorage merchant rules to Supabase DB
    if (user && !sessionStorage.getItem('dhanrakshak_ls_migration_done')) {
      migrateLocalStorageRulesToDB(user.id).catch(console.warn)
    }
  }, [selectedMonth, fetchDashboardData])

  useEffect(() => {
    if (user) {
      checkScheduledTasks()
    }
  }, [user, checkScheduledTasks])

  const refreshStreak = useCallback(async () => {
    if (!user) return
    const { data } = await getLoggingStreak()
    setStreakInfo(data)
  }, [user])

  // Calm consistency chip + first-run checklist bookkeeping
  useEffect(() => {
    if (!user) return
    refreshStreak()
    setChecklistDismissed(localStorage.getItem(`dhanrakshak_checklist_dismissed_${user.id}`) === 'true')
    setVisitedAnalytics(localStorage.getItem(`dhanrakshak_visited_analytics_${user.id}`) === 'true')
  }, [user, refreshStreak])

  // Month-end recap — the peak-end rule says a session that closes on a
  // summary is remembered better, and it's a good reason to open the app
  // again next month. Fires once, the first time the app is opened in a
  // new calendar month, recapping the month that just ended.
  useEffect(() => {
    if (!user) return
    const key = `dhanrakshak_last_seen_month_${user.id}`
    const lastSeen = localStorage.getItem(key)
    const current = getCurrentMonth()

    if (lastSeen && lastSeen !== current) {
      const priorMonth = (() => {
        const [y, m] = lastSeen.split('-').map(Number)
        const d = new Date(y, m - 2, 1)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      })()

      Promise.all([getMonthlySummary(lastSeen), getMonthlySummary(priorMonth)])
        .then(([recapRes, priorRes]) => {
          if (!recapRes.data || recapRes.data.total_expenses === 0) return
          const top = recapRes.data.category_breakdown[0]
          setMonthEndRecap({
            month: lastSeen,
            totalExpenses: recapRes.data.total_expenses,
            totalIncome: recapRes.data.total_income,
            topCategory: top ? { label: CATEGORIES[top.category as keyof typeof CATEGORIES]?.label || top.category, amount: top.amount } : undefined,
            priorExpenses: priorRes.data ? priorRes.data.total_expenses : null,
          })
        })
        .catch(() => {})
    }

    localStorage.setItem(key, current)
  }, [user])

  const dismissChecklist = () => {
    if (!user) return
    setChecklistDismissed(true)
    localStorage.setItem(`dhanrakshak_checklist_dismissed_${user.id}`, 'true')
  }

  // "Try demo with sample data" — arrives here via ?demo=1 from the landing
  // page CTA, right after the user finishes signing up. Auto-populates the
  // account instead of sending them hunting for the seed button in Settings.
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(location.search)
    if (params.get('demo') !== '1') return

    navigate(location.pathname, { replace: true })
    setSeedingDemo(true)
    seedSandboxData()
      .then(({ error }) => {
        if (error) throw error
        showToast('Demo data loaded — explore freely. Clear it anytime from Settings.', 'success')
        fetchDashboardData(selectedMonth)
      })
      .catch((err: any) => {
        showToast(err.message || 'Could not load demo data.', 'error')
      })
      .finally(() => setSeedingDemo(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const exportData = (format: 'csv' | 'json') => {
    if (priorYearTransactions.length === 0) return

    let content = ''
    let mimeType = ''
    let filename = ''

    if (format === 'csv') {
      const headers = 'ID,Date,Type,Amount,Category,Merchant,Description,Source,Status\n'
      const rows = priorYearTransactions.map(t => 
        `"${t.id}","${t.date}","${t.type}",${t.amount},"${t.category}","${(t.merchant || '').replace(/"/g, '""')}","${(t.description || '').replace(/"/g, '""')}","${t.source}","${t.approval_status}"`
      ).join('\n')
      content = headers + rows
      mimeType = 'text/csv;charset=utf-8;'
      filename = `Dhanrakshak_Financial_Year_${priorYear}_Export.csv`
    } else {
      content = JSON.stringify(priorYearTransactions, null, 2)
      mimeType = 'application/json;charset=utf-8;'
      filename = `Dhanrakshak_Financial_Year_${priorYear}_Export.json`
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleResetForNewYear = async () => {
    try {
      setLoading(true)
      const errorMsg = await resetAccountData()
      if (errorMsg) throw errorMsg
      setShowYearEndModal(false)
      window.location.reload()
    } catch (err: any) {
      showToast(`Failed to reset data: ${err.message || err}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleManualBannerSync = async () => {
    setSyncingBackground(true)
    setSyncError(null)
    try {
      // Use hasGoogleToken from AuthContext — same reactive source as PendingPage
      if (!hasGoogleToken) {
        setSyncError('Google account not connected. Go to Pending Alerts to connect your Google account.')
        return
      }

      const res = await scanRealGmailInbox()
      if (res.error) {
        // If token expired, update AuthContext state so the whole app knows
        if (res.error.message?.includes('expired') || res.error.message?.includes('TOKEN_EXPIRED')) {
          notifyGoogleTokenCleared()
          setSyncError('Your Google session expired. Go to Pending Alerts → click "Reconnect Google" to refresh your access.')
        } else {
          setSyncError(res.error.message || 'Sync failed. Please try again.')
        }
        return
      }

      setShowInactivityBanner(false)
      setSyncError(null)

      const txns = res.data?.transactions || []
      const autoApproved = res.data?.autoApprovedCount || 0
      const categoryTotals = new Map<string, number>()
      txns
        .filter((t: any) => t.type === 'debit')
        .forEach((t: any) => {
          categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + Number(t.amount))
        })
      let topCategory: SyncSummary['topCategory']
      if (categoryTotals.size > 0) {
        const [code, amount] = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]
        const label = CATEGORIES[code as keyof typeof CATEGORIES]?.label || code
        topCategory = { label, amount }
      }

      setSyncSummary({
        total: txns.length,
        autoApproved,
        pendingReview: txns.length - autoApproved,
        topCategory,
      })
      fetchDashboardData(selectedMonth)
    } catch (e: any) {
      setSyncError(e.message || 'Sync failed. Please try again.')
    } finally {
      setSyncingBackground(false)
    }
  }

  const handlePrevMonth = () => {
    const [year, mon] = selectedMonth.split('-').map(Number)
    const prevDate = new Date(year, mon - 2, 1)
    setSelectedMonth(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    )
  }

  const handleNextMonth = () => {
    const [year, mon] = selectedMonth.split('-').map(Number)
    const nextDate = new Date(year, mon, 1)
    setSelectedMonth(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    )
  }

  const formatMonthName = (monthStr: string) => {
    const [year, mon] = monthStr.split('-').map(Number)
    return new Date(year, mon - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    })
  }

  // Calculate savings percentage
  const savingsRate =
    summary && summary.total_income > 0
      ? Math.max(0, Math.min(100, (summary.savings / summary.total_income) * 100))
      : 0

  // "Safe to spend" — the one glanceable number that answers "am I okay?"
  // without the user having to do the income/expense/savings math themselves.
  // Only meaningful for the current month (there's no "days left" in a past one).
  const isCurrentMonth = selectedMonth === getCurrentMonth()
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeftInMonth = Math.max(1, daysInMonth - today.getDate() + 1)
  const spentSoFar = summary?.total_expenses || 0
  const budgetRemaining = monthBudgetTotal - spentSoFar
  const safeToSpendPerDay = budgetRemaining / daysLeftInMonth

  // Most-used categories this month, for Quick-Add's one-tap chips
  const topCategories = (summary?.category_breakdown || [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((c) => c.category)

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Top welcome & Month selector */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
              Hello, {getFirstName()}
            </h1>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-sm text-zinc-400">
                Here is your wealth overview for this month.
              </p>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-2 border border-border-subtle/50 text-[10px] font-semibold text-brand-300 font-mono">
                Next Refresh: {getNextRefreshTime(dailyScanTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} at {dailyScanTime}
              </span>
              {streakInfo.streak > 1 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-2 border border-border-subtle/50 text-[10px] font-semibold text-zinc-400">
                  <Flame className="h-3 w-3 shrink-0" /> {streakInfo.streak} day streak
                </span>
              )}
            </div>
          </div>

          {/* Month Navigator & Customize Controls */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfigModal(true)}
              className="hover:bg-surface-2 h-11 px-3.5 rounded-xl border border-border-subtle/50 text-xs font-semibold text-zinc-300 gap-1.5 flex items-center justify-center cursor-pointer"
              title="Configure Dashboard Widgets"
            >
              <Settings className="h-3.5 w-3.5" /> Customize
            </Button>

            <div className="flex items-center gap-2 bg-surface-1 border border-border-subtle rounded-xl p-1 shrink-0 max-w-fit shadow-inner glass-card">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevMonth}
                className="hover:bg-surface-2 h-9 w-9 p-0"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-400 hover:text-zinc-200" />
              </Button>
              <span className="px-4 text-sm font-semibold text-zinc-200 min-w-[120px] text-center">
                {formatMonthName(selectedMonth)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextMonth}
                className="hover:bg-surface-2 h-9 w-9 p-0"
                title="Next Month"
                disabled={selectedMonth === getCurrentMonth()}
              >
                <ChevronRight className="h-4 w-4 text-zinc-400 hover:text-zinc-200" />
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-sm text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        {seedingDemo && (
          <div role="status" className="rounded-2xl bg-brand-500/10 border border-brand-500/20 p-4 text-sm text-brand-400 flex items-center gap-2.5 animate-fade-in shadow-md">
            <Sparkles className="h-4 w-4 shrink-0 animate-pulse" /> Loading sample data…
          </div>
        )}

        {syncSummary && (
          <div role="status" className="rounded-2xl bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] p-4 text-sm text-[var(--status-positive-text)] flex items-start justify-between gap-3 animate-fade-in shadow-md">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {syncSummary.total === 0
                    ? 'Sync complete — no new transactions found.'
                    : `${syncSummary.total} new transaction${syncSummary.total === 1 ? '' : 's'} found.`}
                </p>
                {syncSummary.total > 0 && (
                  <p className="text-xs opacity-80 mt-1">
                    {syncSummary.autoApproved} auto-approved
                    {syncSummary.pendingReview > 0 ? `, ${syncSummary.pendingReview} waiting for your review` : ''}
                    {syncSummary.topCategory
                      ? ` · biggest category: ${syncSummary.topCategory.label} (${formatCurrency(syncSummary.topCategory.amount)})`
                      : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncSummary(null)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss sync summary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!checklistDismissed && (recentTransactions.length === 0 || monthBudgetTotal === 0) && (
          <Card className="relative overflow-hidden shadow-md animate-fade-in">
            <button
              onClick={dismissChecklist}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Dismiss checklist"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-sm font-bold text-text-primary">Get set up in 3 steps</h2>
            <p className="text-xs text-zinc-500 mt-0.5 mb-4">A quick tour of what makes Dhanrakshak useful.</p>
            <div className="space-y-3">
              {[
                {
                  done: recentTransactions.length > 0,
                  label: 'Add your first transaction',
                  hint: 'Connect Gmail on Pending Alerts, or add one manually.',
                  to: recentTransactions.length > 0 ? null : '/expenses',
                },
                {
                  done: monthBudgetTotal > 0,
                  label: 'Set a monthly budget',
                  hint: 'Pick one category to start — you can add more later.',
                  to: monthBudgetTotal > 0 ? null : '/budgets',
                },
                {
                  done: visitedAnalytics,
                  label: 'Explore your Analytics',
                  hint: 'See trends, forecasts, and where your money goes.',
                  to: visitedAnalytics ? null : '/analytics',
                },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  {step.done ? (
                    <CheckCircle2 className="h-4.5 w-4.5 text-[var(--status-positive-text)] shrink-0" />
                  ) : (
                    <Circle className="h-4.5 w-4.5 text-zinc-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {step.label}
                    </p>
                    {!step.done && <p className="text-xs text-zinc-500">{step.hint}</p>}
                  </div>
                  {step.to && (
                    <Link to={step.to}>
                      <Button size="sm" variant="secondary" className="shrink-0 text-xs">
                        Go
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {showInactivityBanner && (
          <div role="alert" className="rounded-2xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4 text-sm text-[var(--status-warning-text)] flex flex-col gap-3 animate-fade-in shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-text-primary">
                    {profile?.subscription_status === 'trial' ? 'Trial Active — Gmail Sync Unlocked' : 'Refresh Alert — Action Required'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    {profile?.subscription_status === 'trial'
                      ? `Your transaction tracker is active in full trial mode. Last sync: ${lastScanTime ? lastScanTime.toLocaleString('en-IN') : 'Never'}. Click Sync Now to fetch new alerts.`
                      : `Your transaction tracker has not refreshed in the last 24 hours (last sync: ${lastScanTime ? lastScanTime.toLocaleString('en-IN') : 'Never'}). Click Sync Now to import the latest bank alerts.`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-[var(--status-warning-text)] border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] hover:bg-[var(--status-warning-border)] hover:border-[var(--status-warning-text)]/40 transition-all text-xs justify-center gap-1.5"
                  onClick={handleManualBannerSync}
                  loading={syncingBackground}
                  disabled={syncingBackground}
                >
                  <RefreshCw className="h-3.5 w-3.5 animate-spin-slow" /> Sync Now
                </Button>
                {(profile?.subscription_status === 'trial' || (profile?.subscription_status === 'active' && profile?.subscription_plan_type === 'monthly')) && (
                  <Link to="/pricing" className="shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-brand-300 border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 hover:border-brand-500/35 transition-all text-xs justify-center font-bold gap-1.5"
                    >
                      <Crown className="h-3.5 w-3.5" /> Upgrade to Yearly
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            {syncError && (
              <div className="rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] px-3 py-2 text-xs text-[var(--status-danger-text)] flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="flex-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-status-danger shrink-0" />
                  {syncError}
                </span>
                {(syncError.includes('expired') || syncError.includes('connected')) && (
                  <Link
                    to="/pending"
                    className="shrink-0 text-xs font-semibold text-[var(--status-danger-text)] underline underline-offset-2 hover:opacity-80 transition-colors"
                  >
                    Go to Pending Alerts →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {isCurrentMonth && (
          <>
            <QuickAddWidget
              topCategories={topCategories}
              onAdded={() => {
                fetchDashboardData(selectedMonth)
                refreshStreak()
              }}
            />

            {!loading && !streakInfo.loggedToday && (
              <p className="text-xs text-zinc-500 -mt-4">
                Log an expense today to {streakInfo.streak > 0 ? 'keep' : 'start'} your streak.
              </p>
            )}

            <ReceivablesCard />
          </>
        )}

        {/* Safe-to-spend hero number — the single glanceable answer to
            "am I okay this month?", shown only for the month in progress. */}
        {!loading && isCurrentMonth && (
          <Card className="relative overflow-hidden shadow-md">
            {monthBudgetTotal === 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-surface-2 border border-border-subtle/50 flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Set a budget to see what's safe to spend</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Takes under a minute — pick one category to start.</p>
                  </div>
                </div>
                <Link to="/budgets" className="shrink-0">
                  <Button size="sm">Set a budget</Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${
                  safeToSpendPerDay >= 0
                    ? 'bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
                    : 'bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]'
                }`}>
                  <Wallet className={`h-5 w-5 ${safeToSpendPerDay >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {safeToSpendPerDay >= 0 ? 'Safe to spend' : 'Over budget by'}
                  </p>
                  <p className={`text-2xl font-bold tracking-tight ${safeToSpendPerDay >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}`}>
                    {safeToSpendPerDay >= 0
                      ? `${formatCurrency(safeToSpendPerDay)}/day`
                      : formatCurrency(Math.abs(budgetRemaining))}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {safeToSpendPerDay >= 0
                      ? `${formatCurrency(budgetRemaining)} left across ${daysLeftInMonth} day${daysLeftInMonth === 1 ? '' : 's'}`
                      : `for the rest of ${formatMonthName(selectedMonth)}`}
                  </p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Stats summary section */}
        {widgets.stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              // Skeleton for stats
              [1, 2, 3].map((i) => (
                <Card key={i} className="relative overflow-hidden h-32">
                  <div className="skeleton absolute inset-0 opacity-70" />
                </Card>
              ))
            ) : (
              <>
                {/* Income card */}
                <Card className="relative overflow-hidden border-l-4 border-l-[var(--status-positive-text)]/80 bg-surface-1 group hover:border-l-[var(--status-positive-text)] transition-all shadow-md">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <TrendingUp className="h-10 w-10 text-status-positive" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Total Income
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--status-positive-text)] animate-slide-up stagger-1">
                    {formatCurrency(summary?.total_income || 0)}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <span>Earned this month</span>
                  </div>
                </Card>

                {/* Expenses card */}
                <Card className="relative overflow-hidden border-l-4 border-l-[var(--status-warning-text)]/80 bg-surface-1 group hover:border-l-[var(--status-warning-text)] transition-all shadow-md">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <TrendingDown className="h-10 w-10 text-status-warning" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Total Expenses
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--status-warning-text)] animate-slide-up stagger-2">
                    {formatCurrency(summary?.total_expenses || 0)}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <span>Spent this month</span>
                  </div>
                </Card>

                {/* Savings card */}
                <Card className={`relative overflow-hidden border-l-4 bg-surface-1 group transition-all shadow-md sm:col-span-2 lg:col-span-1 ${
                  (summary?.savings || 0) >= 0 ? 'border-l-[var(--status-positive-text)]/80 hover:border-l-[var(--status-positive-text)]' : 'border-l-[var(--status-danger-text)]/80 hover:border-l-[var(--status-danger-text)]'
                }`}>
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Shield className="h-10 w-10 text-brand-400" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Net Savings
                  </p>
                  <p
                    className={`mt-2 text-3xl font-bold tracking-tight animate-slide-up stagger-3 ${
                      (summary?.savings || 0) >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'
                    }`}
                  >
                    {formatCurrency(summary?.savings || 0)}
                  </p>
                  {/* Savings progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-zinc-500">Savings Rate</span>
                      <span className={`font-semibold ${(summary?.savings || 0) >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}`}>
                        {savingsRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${(summary?.savings || 0) >= 0 ? 'aurora-progress-fill' : 'bg-[var(--status-danger-text)]'}`}
                        style={{ width: `${Math.min(100, savingsRate)}%` }}
                      />
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Details breakdown */}
        {(widgets.breakdown || widgets.recent) && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left panel: Category breakdown */}
            {widgets.breakdown && (
              <Card className={`${widgets.recent ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col h-auto`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Monthly Spending Breakdown</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Where your money went this month</p>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {loading ? (
                    // Skeleton breakdown
                    <div className="space-y-6 py-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between">
                            <div className="skeleton h-4 w-1/3" />
                            <div className="skeleton h-4 w-12" />
                          </div>
                          <div className="skeleton h-2 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : !summary || summary.category_breakdown.length === 0 ? (
                    <EmptyState
                      icon={<BarChart2 className="h-8 w-8 text-zinc-500" />}
                      title="No expenses tracked"
                      description="Add an expense in the selected month to see your breakdown chart."
                    />
                  ) : (
                    <div className="space-y-5 py-2">
                      {summary.category_breakdown.map((item, idx) => {
                        const cat =
                          CATEGORIES[item.category as keyof typeof CATEGORIES] || CATEGORIES.other
                        return (
                          <button
                            key={item.category}
                            onClick={() => handleCategoryClick(item.category)}
                            className="w-full text-left block space-y-1.5 p-2 -mx-2 rounded-xl transition-all duration-200 cursor-pointer hover:bg-surface-2/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700/60 animate-slide-up"
                            style={{ animationDelay: `${idx * 0.05}s` }}
                          >
                            <div className="flex items-center justify-between">
                              {/* Label & Icon */}
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{cat.emoji}</span>
                                <span className="text-sm font-medium text-zinc-200">
                                  {cat.label}
                                </span>
                                <span className="text-xs text-zinc-500 font-normal">
                                  ({item.count}txn)
                                </span>
                              </div>

                              {/* Amount & Percentage */}
                              <div className="text-right">
                                <span className="text-sm font-semibold text-zinc-200">
                                  {formatCurrency(item.amount)}
                                </span>
                                <span className="text-xs text-zinc-500 ml-2 font-normal">
                                  {item.percentage.toFixed(0)}%
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{
                                  width: `${item.percentage}%`,
                                  backgroundColor: cat.color,
                                }}
                              />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Right panel: Recent Transactions */}
            {widgets.recent && (
              <Card className={`${widgets.breakdown ? 'lg:col-span-5' : 'lg:col-span-12'} flex flex-col h-auto`} noPadding>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Recent Activity</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Your globally recent transactions</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-400 hover:text-brand-300 font-semibold pr-0"
                    onClick={handleOpenRecentModal}
                  >
                    View All
                  </Button>
                </div>

                <div className="flex-1 flex flex-col justify-center border-t border-border-subtle">
                  {loading ? (
                    // Skeleton Transactions
                    <div className="space-y-4 p-5">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="skeleton h-9 w-9 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="skeleton h-3.5 w-2/3" />
                            <div className="skeleton h-2.5 w-1/3" />
                          </div>
                          <div className="skeleton h-4 w-14" />
                        </div>
                      ))}
                    </div>
                  ) : recentTransactions.length === 0 ? (
                    <div className="p-5 flex-1 flex flex-col justify-center items-center">
                      <EmptyState
                        icon={<DollarSign className="h-8 w-8 text-zinc-500" />}
                        title="No transactions yet"
                        description="Record a transaction to see your recent activity."
                      />
                      <Link to="/expenses" className="mt-4">
                        <Button size="sm">Add First Transaction</Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-border-subtle flex-1 flex flex-col justify-between">
                      <div>
                        {recentTransactions.map((txn, idx) => {
                          const cat =
                            CATEGORIES[txn.category as keyof typeof CATEGORIES] || CATEGORIES.other
                          const isDebit = txn.type === 'debit'

                          return (
                            <div
                              key={txn.id}
                              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/40 animate-slide-up"
                              style={{ animationDelay: `${idx * 0.05}s` }}
                            >
                              {/* Category icon */}
                              <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-md"
                                style={{ backgroundColor: `${cat.color}15` }}
                              >
                                {cat.emoji}
                              </div>

                              {/* Details */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-zinc-200 truncate">
                                  {txn.description || cat.label}
                                </p>
                                <span className="text-[10px] text-zinc-500 block mt-0.5">
                                  {formatDate(txn.date)}
                                </span>
                              </div>

                              {/* Amount */}
                              <div className="text-right shrink-0">
                                <p
                                  className={`text-xs font-bold ${
                                    isDebit ? 'text-[var(--status-danger-text)]' : 'text-[var(--status-positive-text)]'
                                  }`}
                                >
                                  {isDebit ? '-' : '+'}{formatCurrencyCompact(Number(txn.amount))}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* 🔄 Subscription Intelligence Widget */}
        <ActiveSubscriptionsWidget
          recentTransactions={recentTransactions}
          loading={loading}
          isVisible={widgets.subscriptions}
        />

        {/* 📋 Recent Activity View All Modal */}
        <Modal
          isOpen={showAllRecentModal}
          onClose={() => setShowAllRecentModal(false)}
          title="Recent Activity"
          footer={
            <Button variant="secondary" onClick={() => setShowAllRecentModal(false)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">Your past 15 transaction records</p>
            {loadingAllRecent ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 animate-pulse">
                    <div className="h-4 w-1/3 bg-zinc-700 rounded" />
                    <div className="h-4 w-12 bg-zinc-700 rounded" />
                  </div>
                ))}
              </div>
            ) : allRecentTransactions.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">No transactions found.</p>
            ) : (
              <div className="divide-y divide-border-subtle/40">
                {allRecentTransactions.map((txn) => {
                  const cat = CATEGORIES[txn.category as keyof typeof CATEGORIES] || CATEGORIES.other
                  const isDebit = txn.type === 'debit'
                  return (
                    <div key={txn.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{cat.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-200 truncate">{txn.description || cat.label}</p>
                          <span className="text-[9px] text-zinc-500">
                            {new Date(txn.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          isDebit ? 'text-[var(--status-danger-text)]' : 'text-[var(--status-positive-text)]'
                        }`}
                      >
                        {isDebit ? '-' : '+'}{formatCurrency(Number(txn.amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>

        {/* 📊 Category Spending Breakdown Details Modal */}
        {showCategoryModal && selectedCategoryCode && (() => {
          const cat = CATEGORIES[selectedCategoryCode as keyof typeof CATEGORIES] || CATEGORIES.other
          const matchedSummaryItem = summary?.category_breakdown.find(item => item.category === selectedCategoryCode)
          const totalAmount = matchedSummaryItem?.amount || 0
          const totalCount = matchedSummaryItem?.count || 0
          
          const [yearStr, monStr] = selectedMonth.split('-')
          const monthDate = new Date(parseInt(yearStr, 10), parseInt(monStr, 10) - 1, 1)
          const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
          
          return (
            <Modal
              isOpen={showCategoryModal}
              onClose={() => {
                setShowCategoryModal(false)
                setSelectedCategoryCode(null)
                setCategoryTransactions([])
              }}
              title={`${cat.label} Spending`}
              footer={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCategoryModal(false)
                    setSelectedCategoryCode(null)
                    setCategoryTransactions([])
                  }}
                  className="font-bold text-xs"
                >
                  Close
                </Button>
              }
            >
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  {monthLabel} · {formatCurrency(totalAmount)} total over {totalCount} transaction
                  {totalCount > 1 ? 's' : ''}
                </p>
                {loadingCategoryTxns ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 animate-pulse">
                        <div className="space-y-2 w-1/3">
                          <div className="h-4 bg-zinc-700 rounded" />
                          <div className="h-3 bg-zinc-800 rounded w-2/3" />
                        </div>
                        <div className="h-4 w-12 bg-zinc-700 rounded" />
                      </div>
                    ))}
                  </div>
                ) : categoryTransactions.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">No transactions found for this category.</p>
                ) : (
                  <div className="divide-y divide-border-subtle/40">
                    {categoryTransactions.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between py-3">
                        <div className="flex flex-col min-w-0 pr-3">
                          <p className="text-xs font-bold text-zinc-200 truncate">
                            {txn.merchant || txn.description || 'Transaction'}
                          </p>
                          {txn.description && txn.description !== `${txn.merchant} Transaction` && (
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{txn.description}</p>
                          )}
                          <span className="text-[9px] text-zinc-500 mt-1">
                            {new Date(txn.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <span className="text-xs font-bold shrink-0 text-[var(--status-danger-text)]">
                          -{formatCurrency(Number(txn.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Modal>
          )
        })()}

        {/* Year-End Financial Transition & Reset Modal */}
        <Modal
          isOpen={showYearEndModal}
          onClose={() => setShowYearEndModal(false)}
          title="Financial Year Completed"
          footer={
            <div className="w-full space-y-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">1. Export Prior Year Records</p>
              <div className="flex gap-2.5">
                <Button
                  onClick={() => exportData('csv')}
                  className="flex-1 text-xs justify-center gap-1 bg-surface-2 border border-border-subtle hover:border-brand-500/40 text-zinc-200"
                >
                  <Download className="h-4 w-4" /> Download CSV Report
                </Button>
                <Button
                  onClick={() => exportData('json')}
                  className="flex-1 text-xs justify-center gap-1 bg-surface-2 border border-border-subtle hover:border-brand-500/40 text-zinc-200"
                >
                  <Download className="h-4 w-4" /> Download JSON Backup
                </Button>
              </div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider pt-2">2. Clear & Start Fresh for New Year</p>
              <Button
                variant="danger"
                block
                onClick={handleResetForNewYear}
                disabled={loading}
                loading={loading}
                className="w-full text-xs py-3 font-bold justify-center"
              >
                <Check className="h-4 w-4" /> Export Completed - Reset Account & Start New Year
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-sm text-zinc-300">
            <p className="leading-relaxed text-zinc-400">
              Your <strong className="text-text-primary">{priorYear} Financial Year</strong> is complete. 
              Dhanrakshak operates on a calendar-year budget cycle (Jan 1 to Dec 31). To start fresh for the current year, please export your prior records.
            </p>
            
            <div className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] p-4 text-xs text-[var(--status-warning-text)] leading-normal flex gap-2">
              <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
              <p>
                <strong>Important:</strong> Downloading your backup file is mandatory before resetting. 
                Once you confirm, Dhanrakshak will restore everything to blank (wipe prior transactions, budgets, and logs) so the scanner can work as new.
              </p>
            </div>

            <div className="bg-surface-2/40 border border-border-subtle rounded-xl p-3 text-xs flex justify-between items-center text-zinc-400">
              <span>Prior Records Found</span>
              <span className="font-semibold text-zinc-200">{priorYearTransactions.length} transaction(s)</span>
            </div>
          </div>
        </Modal>

        {/* Widget Customization Modal */}
        <Modal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          title="Customize Dashboard"
          footer={
            <Button variant="secondary" onClick={() => setShowConfigModal(false)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-zinc-400 mb-4">Toggle widgets on or off</p>

            {/* Stats Widget */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/40 border border-border-subtle/30">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-brand-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text-primary">Income, Expense & Savings Cards</p>
                  <p className="text-[10px] text-zinc-500">Summary stats at the top</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={widgets.stats}
                onChange={() => toggleWidget('stats')}
                className="h-4 w-4 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Spending Breakdown Widget */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/40 border border-border-subtle/30">
              <div className="flex items-center gap-3">
                <BarChart2 className="h-5 w-5 text-brand-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text-primary">Spending Breakdown</p>
                  <p className="text-[10px] text-zinc-500">Monthly category breakdown list</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={widgets.breakdown}
                onChange={() => toggleWidget('breakdown')}
                className="h-4 w-4 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Recent Activity Widget */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/40 border border-border-subtle/30">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-brand-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text-primary">Recent Activity List</p>
                  <p className="text-[10px] text-zinc-500">Show last 5 recorded transactions</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={widgets.recent}
                onChange={() => toggleWidget('recent')}
                className="h-4 w-4 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Subscription Widget */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/40 border border-border-subtle/30">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-brand-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text-primary">Active Subscriptions</p>
                  <p className="text-[10px] text-zinc-500">Auto-detected recurring services</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={widgets.subscriptions}
                onChange={() => toggleWidget('subscriptions')}
                className="h-4 w-4 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
              />
            </div>
          </div>
        </Modal>

        {/* Month-end recap */}
        <Modal
          isOpen={!!monthEndRecap}
          onClose={() => setMonthEndRecap(null)}
          title={monthEndRecap ? `${formatMonthName(monthEndRecap.month)} recap` : 'Recap'}
          footer={
            <Button block onClick={() => setMonthEndRecap(null)} className="justify-center">
              Got it
            </Button>
          }
        >
          {monthEndRecap && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-2/40 border border-border-subtle/30 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total spent</p>
                  <p className="text-xl font-bold text-text-primary mt-1">{formatCurrency(monthEndRecap.totalExpenses)}</p>
                </div>
                <div className="rounded-xl bg-surface-2/40 border border-border-subtle/30 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Net saved</p>
                  <p className={`text-xl font-bold mt-1 ${monthEndRecap.totalIncome - monthEndRecap.totalExpenses >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}`}>
                    {formatCurrency(monthEndRecap.totalIncome - monthEndRecap.totalExpenses)}
                  </p>
                </div>
              </div>

              {monthEndRecap.topCategory && (
                <p className="text-sm text-zinc-300">
                  Biggest category: <strong className="text-text-primary">{monthEndRecap.topCategory.label}</strong> ({formatCurrency(monthEndRecap.topCategory.amount)})
                </p>
              )}

              {monthEndRecap.priorExpenses !== null && monthEndRecap.priorExpenses > 0 && (
                <p className="text-sm text-zinc-300">
                  {monthEndRecap.totalExpenses < monthEndRecap.priorExpenses
                    ? `You spent ${formatCurrency(monthEndRecap.priorExpenses - monthEndRecap.totalExpenses)} less than the month before — nice work.`
                    : `You spent ${formatCurrency(monthEndRecap.totalExpenses - monthEndRecap.priorExpenses)} more than the month before.`}
                </p>
              )}
            </div>
          )}
        </Modal>
      </div>
    </AppLayout>
  )
}
