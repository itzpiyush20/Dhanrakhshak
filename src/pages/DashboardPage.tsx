// ============================================
// DashboardPage — Premium Financial Dashboard
// Displays stats, spending breakdown, recent txns
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts'
import { Card, Button, EmptyState } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'
import { getTransactions, getMonthlySummary } from '@/services/transactions'
import {
  supabase,
  resetAccountData,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  scanRealGmailInbox,
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

export default function DashboardPage() {
  const { user, profile, hasGoogleToken, notifyGoogleTokenCleared, dailyScanTime } = useAuth()
  const { showToast } = useToast()

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
      const [summaryRes, transactionsRes] = await withTimeout(
        Promise.all([
          getMonthlySummary(month),
          getTransactions({ limit: 5 }), // Show global recent transactions
        ]),
        45000, // 45-second timeout to handle Supabase cold starts
        'Dashboard data fetch'
      )

      if (summaryRes.error) throw summaryRes.error
      if (transactionsRes.error) throw transactionsRes.error

      setSummary(summaryRes.data)
      setRecentTransactions(transactionsRes.data || [])
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
      showToast('✅ Sync complete! Dashboard updated.', 'success')
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

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Top welcome & Month selector */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Hello, {getFirstName()}
            </h1>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-sm text-zinc-400">
                Here is your wealth overview for this month.
              </p>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-2 border border-border-subtle/50 text-[10px] font-semibold text-brand-300 font-mono">
                📅 Next Refresh: {getNextRefreshTime(dailyScanTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} at {dailyScanTime}
              </span>
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
              ⚙️ Customize
            </Button>

            <div className="flex items-center gap-2 bg-surface-1 border border-border-subtle rounded-xl p-1 shrink-0 max-w-fit shadow-inner glass-card">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevMonth}
                className="hover:bg-surface-2 h-9 w-9 p-0"
                title="Previous Month"
              >
                ◀️
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
                ▶️
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-sm text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        {showInactivityBanner && (
          <div role="alert" className="rounded-2xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4 text-sm text-[var(--status-warning-text)] flex flex-col gap-3 animate-fade-in shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
                <div>
                  <p className="font-bold text-white">
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
                  className="text-[var(--status-warning-text)] border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] hover:bg-[var(--status-warning-border)] hover:border-[var(--status-warning-text)]/40 transition-all text-xs justify-center"
                  onClick={handleManualBannerSync}
                  loading={syncingBackground}
                  disabled={syncingBackground}
                >
                  🔄 Sync Now
                </Button>
                {(profile?.subscription_status === 'trial' || (profile?.subscription_status === 'active' && profile?.subscription_plan_type === 'monthly')) && (
                  <Link to="/pricing" className="shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-brand-300 border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 hover:border-brand-500/35 transition-all text-xs justify-center font-bold"
                    >
                      👑 Upgrade to Yearly
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            {syncError && (
              <div className="rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] px-3 py-2 text-xs text-[var(--status-danger-text)] flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="flex-1">⚠️ {syncError}</span>
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
                  <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                    📈
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
                  <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                    📉
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
                  <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                    🛡️
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
                    <h2 className="text-lg font-bold text-white">Monthly Spending Breakdown</h2>
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
                      icon="📊"
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
                    <h2 className="text-lg font-bold text-white">Recent Activity</h2>
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
                        icon="💸"
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
        {widgets.subscriptions && !loading && recentTransactions.length > 0 && (() => {
          const now = new Date()
          const subs: Array<{ merchant: string; amount: number; daysToRenewal: number; category: string }> = []
          const seen = new Set<string>()
          const debits = recentTransactions.filter(t => t.type === 'debit')

          // Group by merchant
          const grouped: Record<string, typeof debits> = {}
          debits.forEach(t => {
            if (!t.merchant) return
            const key = t.merchant.trim().toLowerCase()
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(t)
          })

          // Detect recurring patterns (monthly ±10d, or subscription category)
          for (const [key, txns] of Object.entries(grouped)) {
            if (seen.has(key)) continue
            txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            const latest = txns[0]
            const isSubCat = ['subscriptions', 'utilities'].includes(latest.category)
            let isRecurring = isSubCat

            if (!isRecurring && txns.length >= 2) {
              const d1 = new Date(txns[0].date), d2 = new Date(txns[1].date)
              const diffDays = Math.round(Math.abs(d1.getTime() - d2.getTime()) / 86400000)
              const amtVar = Math.abs(Number(txns[0].amount) - Number(txns[1].amount)) / (Number(txns[0].amount) || 1)
              if (diffDays >= 22 && diffDays <= 40 && amtVar < 0.15) isRecurring = true
            }

            if (isRecurring) {
              const lastBilled = new Date(latest.date)
              const daysSince = Math.round((now.getTime() - lastBilled.getTime()) / 86400000)
              if (daysSince < 60) {
                const nextRenewal = new Date(lastBilled.getTime() + 30 * 86400000)
                const daysToRenewal = Math.ceil((nextRenewal.getTime() - now.getTime()) / 86400000)
                const avgAmt = txns.reduce((s, t) => s + Number(t.amount), 0) / txns.length
                seen.add(key)
                subs.push({ merchant: latest.merchant || 'Recurring', amount: Math.round(avgAmt), daysToRenewal, category: latest.category })
              }
            }
          }

          subs.sort((a, b) => a.daysToRenewal - b.daysToRenewal)
          const monthlyBurn = subs.reduce((s, sub) => s + sub.amount, 0)

          if (subs.length === 0) return null

          return (
            <Card className="mt-2" id="subscription-widget">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    🔄 <span>Active Subscriptions</span>
                    <span className="text-xs font-normal text-zinc-500 ml-1">auto-detected</span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Monthly subscription burn: <span className="text-white font-semibold">{formatCurrency(monthlyBurn)}</span></p>
                </div>
                <Link to="/subscriptions" className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors">
                  Manage →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {subs.slice(0, 6).map((sub, idx) => {
                  const renewsColor = sub.daysToRenewal <= 3 ? 'text-[var(--status-danger-text)] bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]' :
                    sub.daysToRenewal <= 7 ? 'text-[var(--status-warning-text)] bg-[var(--status-warning-subtle)] border-[var(--status-warning-border)]' :
                    'text-[var(--status-positive-text)] bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
                  const cat = CATEGORIES[sub.category as keyof typeof CATEGORIES] || CATEGORIES.subscriptions
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-xl bg-surface-2/50 border border-border-subtle/60 px-3 py-2.5 hover:bg-surface-2 transition-colors">
                      <span className="text-xl shrink-0">{cat.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{sub.merchant}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{formatCurrency(sub.amount)}/mo</p>
                      </div>
                      <div className={`text-[10px] font-bold rounded-lg px-2 py-1 border shrink-0 ${renewsColor}`}>
                        {sub.daysToRenewal <= 0 ? 'Due!' : sub.daysToRenewal === 1 ? '1 day' : `${sub.daysToRenewal}d`}
                      </div>
                    </div>
                  )
                })}
              </div>
              {subs.length > 6 && (
                <p className="text-xs text-zinc-500 mt-3 text-center">+{subs.length - 6} more · <Link to="/subscriptions" className="text-brand-400 hover:underline">View all</Link></p>
              )}
            </Card>
          )
        })()}

        {/* 📋 Recent Activity View All Modal */}
        {showAllRecentModal && (

          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-fade-in overflow-y-auto" role="dialog" aria-modal="true" aria-label="Recent Transactions List">
            <div className="w-full max-w-xl bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col max-h-[90vh] overflow-y-auto animate-scale-up">
              
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border-subtle/30 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-xl">
                    💸
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Recent Activity</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">Your past 15 transaction records</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAllRecentModal(false)}
                  className="h-8 w-8 rounded-full border border-border-subtle/50 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-2 transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              {/* Content list */}
              <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
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
                              <span className="text-[9px] text-zinc-500">{new Date(txn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            </div>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${isDebit ? 'text-[var(--status-danger-text)]' : 'text-[var(--status-positive-text)]'}`}>
                            {isDebit ? '-' : '+'}{formatCurrency(Number(txn.amount))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-border-subtle/30 pt-4 flex justify-end">
                <Button variant="secondary" onClick={() => setShowAllRecentModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 📊 Category Breakdown Details Modal */}
        {showCategoryModal && selectedCategoryCode && (() => {
          const cat = CATEGORIES[selectedCategoryCode as keyof typeof CATEGORIES] || CATEGORIES.other
          const matchedSummaryItem = summary?.category_breakdown.find(item => item.category === selectedCategoryCode)
          const totalAmount = matchedSummaryItem?.amount || 0
          const totalCount = matchedSummaryItem?.count || 0
          
          // Parse month label (e.g. "June 2026")
          const [yearStr, monStr] = selectedMonth.split('-')
          const monthDate = new Date(parseInt(yearStr, 10), parseInt(monStr, 10) - 1, 1)
          const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
          
          return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-fade-in overflow-y-auto" role="dialog" aria-modal="true" aria-label={`${cat.label} Transactions list`}>
              <div className="w-full max-w-xl bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col max-h-[90vh] overflow-y-auto animate-scale-up text-zinc-100">
                
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border-subtle/30 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border flex items-center justify-center text-xl" style={{ backgroundColor: `${cat.color}15`, borderColor: `${cat.color}40`, borderStyle: 'solid', borderWidth: '1px' }}>
                      {cat.emoji}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{cat.label} Spending</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">{monthLabel} · {formatCurrency(totalAmount)} total over {totalCount} transaction{totalCount > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowCategoryModal(false)
                      setSelectedCategoryCode(null)
                      setCategoryTransactions([])
                    }}
                    className="h-8 w-8 rounded-full border border-border-subtle/50 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-2 transition-colors cursor-pointer"
                    aria-label="Close dialog"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>

                {/* Content list */}
                <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
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
                      {categoryTransactions.map((txn) => {
                        return (
                          <div key={txn.id} className="flex items-center justify-between py-3">
                            <div className="flex flex-col min-w-0 pr-3">
                              <p className="text-xs font-bold text-zinc-200 truncate">
                                {txn.merchant || txn.description || 'Transaction'}
                              </p>
                              {txn.description && txn.description !== `${txn.merchant} Transaction` && (
                                <p className="text-[10px] text-zinc-500 truncate mt-0.5">{txn.description}</p>
                              )}
                              <span className="text-[9px] text-zinc-500 mt-1">
                                {new Date(txn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <span className="text-xs font-bold shrink-0 text-[var(--status-danger-text)]">
                              -{formatCurrency(Number(txn.amount))}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-border-subtle/30 pt-4 flex justify-end">
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
                </div>

              </div>
            </div>
          )
        })()}

      {/* Year-End Financial Transition & Reset Modal */}
      {showYearEndModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="yearend-title">
          <div className="w-full max-w-lg bg-surface-1/95 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col max-h-[90vh] overflow-y-auto animate-scale-up text-left">
            <div className="flex items-center gap-3 border-b border-border-subtle pb-4 mb-4">
              <span className="text-3xl text-brand-400" aria-hidden="true">🔄</span>
              <div>
                <h2 id="yearend-title" className="text-lg font-bold text-white">Financial Year Completed</h2>
                <p className="text-xs text-zinc-400 uppercase tracking-widest font-semibold mt-0.5">
                  Year End Transition Process
                </p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-zinc-300">
              <p className="leading-relaxed text-zinc-400">
                Your <strong className="text-white">{priorYear} Financial Year</strong> is complete. 
                Dhanrakshak operates on a calendar-year budget cycle (Jan 1 to Dec 31). To start fresh for the current year, please export your prior records.
              </p>
              
              <div className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] p-4 text-xs text-[var(--status-warning-text)] leading-normal flex gap-2">
                <span className="text-base shrink-0">⚠️</span>
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

            <div className="space-y-3 mt-6 pt-4 border-t border-border-subtle">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">1. Export Prior Year Records</p>
              <div className="flex gap-2.5">
                <Button
                  onClick={() => exportData('csv')}
                  className="flex-1 text-xs justify-center gap-1 bg-surface-2 border border-border-subtle hover:border-brand-500/40 text-zinc-200"
                >
                  📥 Download CSV Report
                </Button>
                <Button
                  onClick={() => exportData('json')}
                  className="flex-1 text-xs justify-center gap-1 bg-surface-2 border border-border-subtle hover:border-brand-500/40 text-zinc-200"
                >
                  📥 Download JSON Backup
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
                🚀 Export Completed - Reset Account & Start New Year
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Widget Customization Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-fade-in overflow-y-auto" role="dialog" aria-modal="true" aria-label="Configure Dashboard Widgets">
          <div className="w-full max-w-md bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl animate-scale-up text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-subtle/30 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⚙️</span>
                <div>
                  <h3 className="text-base font-bold text-white">Customize Dashboard</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Toggle widgets on or off</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="h-8 w-8 rounded-full border border-border-subtle/50 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-2 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Stats Widget */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/40 border border-border-subtle/30">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💳</span>
                  <div>
                    <p className="text-xs font-bold text-white">Income, Expense & Savings Cards</p>
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
                  <span className="text-xl">📊</span>
                  <div>
                    <p className="text-xs font-bold text-white">Spending Breakdown</p>
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
                  <span className="text-xl">💸</span>
                  <div>
                    <p className="text-xs font-bold text-white">Recent Activity List</p>
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
                  <span className="text-xl">🔄</span>
                  <div>
                    <p className="text-xs font-bold text-white">Active Subscriptions</p>
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

            <div className="border-t border-border-subtle/30 mt-6 pt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setShowConfigModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppLayout>
  )
}
