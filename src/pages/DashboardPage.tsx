// ============================================
// DashboardPage — Premium Financial Dashboard
// Displays stats, spending breakdown, recent txns
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts'
import { Card, Button, Badge, EmptyState } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getTransactions, getMonthlySummary } from '@/services/transactions'
import { formatCurrency, formatCurrencyCompact, getCurrentMonth, formatDate } from '@/utils'
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
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const [summaryRes, transactionsRes] = await Promise.all([
        getMonthlySummary(month),
        getTransactions({ limit: 5 }), // Show global recent transactions
      ])

      if (summaryRes.error) throw summaryRes.error
      if (transactionsRes.error) throw transactionsRes.error

      setSummary(summaryRes.data)
      setRecentTransactions(transactionsRes.data || [])
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData(selectedMonth)
  }, [selectedMonth, fetchDashboardData])

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
              Hello{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''} 👋
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Here is your wealth overview for this month.
            </p>
          </div>

          {/* Month Navigator */}
          <div className="flex items-center gap-2 bg-surface-1 border border-border-subtle rounded-xl p-1 shrink-0 max-w-fit shadow-inner">
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

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Stats summary section */}
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
              <Card className="relative overflow-hidden border-l-4 border-l-emerald-500/80 bg-surface-1 group hover:border-l-emerald-400 transition-all shadow-md">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                  📈
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Total Income
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-400 animate-slide-up stagger-1">
                  {formatCurrency(summary?.total_income || 0)}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                  <span>Earned this month</span>
                </div>
              </Card>

              {/* Expenses card */}
              <Card className="relative overflow-hidden border-l-4 border-l-orange-500/80 bg-surface-1 group hover:border-l-orange-400 transition-all shadow-md">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                  📉
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Total Expenses
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-orange-400 animate-slide-up stagger-2">
                  {formatCurrency(summary?.total_expenses || 0)}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                  <span>Spent this month</span>
                </div>
              </Card>

              {/* Savings card */}
              <Card className="relative overflow-hidden border-l-4 border-l-brand-500/80 bg-surface-1 group hover:border-l-brand-400 transition-all shadow-md sm:col-span-2 lg:col-span-1">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                  🛡️
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Net Savings
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tracking-tight animate-slide-up stagger-3 ${
                    (summary?.savings || 0) >= 0 ? 'text-brand-400' : 'text-red-400'
                  }`}
                >
                  {formatCurrency(summary?.savings || 0)}
                </p>
                {/* Savings progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-500">Savings Rate</span>
                    <span className="font-semibold text-brand-300">
                      {savingsRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${savingsRate}%` }}
                    />
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Details breakdown */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left panel: Category breakdown */}
          <Card className="lg:col-span-7 flex flex-col min-h-[400px]">
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
                      <div key={item.category} className="space-y-1.5 animate-slide-up" style={{ animationDelay: `${idx * 0.05}s` }}>
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
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Right panel: Recent Transactions */}
          <Card className="lg:col-span-5 flex flex-col min-h-[400px]" noPadding>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Your globally recent transactions</p>
              </div>
              <Link to="/expenses">
                <Button variant="ghost" size="sm" className="text-brand-400 hover:text-brand-300 font-semibold pr-0">
                  View All
                </Button>
              </Link>
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
                                isDebit ? 'text-red-400' : 'text-emerald-400'
                              }`}
                            >
                              {isDebit ? '-' : '+'}{formatCurrencyCompact(Number(txn.amount))}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Quick Add Button */}
                  <div className="p-4 bg-surface-2/20 border-t border-border-subtle text-center">
                    <Link to="/expenses">
                      <Button variant="secondary" size="sm" block className="gap-1.5">
                        ➕ Quick Add Transaction
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
