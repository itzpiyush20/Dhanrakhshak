// ============================================
// AnalyticsPage — Financial Intelligence Hub
// Pure CSS visual charts, conic-doughnuts, MoM trends & Wealth Insights
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts'
import { Card, Button, Badge, EmptyState } from '@/components/ui'
import { getMonthlySummary, getHistoricalAnalytics } from '@/services/transactions'
import { formatCurrency, formatCurrencyCompact, getCurrentMonth } from '@/utils'
import { CATEGORIES } from '@/constants'

interface HistoricalMonth {
  month: string
  label: string
  income: number
  expenses: number
  savings: number
}

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

export default function AnalyticsPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [historicalData, setHistoricalData] = useState<HistoricalMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalyticsData = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const [summaryRes, historicalRes] = await Promise.all([
        getMonthlySummary(month),
        getHistoricalAnalytics(6), // Last 6 months
      ])

      if (summaryRes.error) throw summaryRes.error
      if (historicalRes.error) throw historicalRes.error

      setSummary(summaryRes.data)
      setHistoricalData(historicalRes.data || [])
    } catch (err: any) {
      console.error('Error fetching analytics:', err)
      setError(err.message || 'Failed to load financial analysis.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalyticsData(selectedMonth)
  }, [selectedMonth, fetchAnalyticsData])

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

  // Generate Conic Gradient string for Doughnut chart
  const getConicGradientString = () => {
    if (!summary || summary.category_breakdown.length === 0) {
      return 'conic-gradient(#27272a 0% 100%)'
    }

    let currentAngle = 0
    const slices = summary.category_breakdown.map((item) => {
      const cat = CATEGORIES[item.category as keyof typeof CATEGORIES] || CATEGORIES.other
      const start = currentAngle
      const end = currentAngle + item.percentage
      currentAngle = end
      return `${cat.color} ${start.toFixed(1)}% ${end.toFixed(1)}%`
    })

    return `conic-gradient(${slices.join(', ')})`
  }

  // MoM Spending increase calculation
  const getMonthOverMonthTrend = () => {
    if (historicalData.length < 2) return null
    const currentIdx = historicalData.findIndex((h) => h.month === selectedMonth)
    if (currentIdx <= 0) return null // Oldest month or not found

    const prevMonthData = historicalData[currentIdx - 1]
    const curMonthData = historicalData[currentIdx]

    if (prevMonthData.expenses === 0) return null

    const diff = curMonthData.expenses - prevMonthData.expenses
    const pct = (diff / prevMonthData.expenses) * 100
    return {
      diff,
      pct,
      increased: diff > 0,
      prevLabel: prevMonthData.label,
    }
  }

  const trend = getMonthOverMonthTrend()
  const maxVal = historicalData.length
    ? Math.max(...historicalData.map((h) => Math.max(h.income, h.expenses)))
    : 0

  const savingsRate =
    summary && summary.total_income > 0
      ? (summary.savings / summary.total_income) * 100
      : 0

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Financial Intelligence</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Interactive analytics, cashflow comparisons, and intelligent wealth alerts.
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

        {/* First Row: 6-Month Income vs Expense Trend Bar Chart */}
        <Card className="flex flex-col min-h-[300px]">
          <div>
            <h2 className="text-lg font-bold text-white">Income vs Expense Trend</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Historical overview of last 6 months</p>
          </div>

          <div className="flex-1 flex flex-col justify-end mt-8">
            {loading ? (
              // Chart Skeleton
              <div className="flex items-end justify-between gap-6 h-40 pt-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex-1 flex gap-2 items-end h-full justify-center">
                    <div className="skeleton w-6 h-2/3" />
                    <div className="skeleton w-6 h-1/3" />
                  </div>
                ))}
              </div>
            ) : historicalData.length === 0 ? (
              <EmptyState
                icon="📈"
                title="Insufficient history"
                description="Record transactions over consecutive months to see historical comparisons."
              />
            ) : (
              <div className="space-y-4">
                {/* Pure CSS Bar chart */}
                <div className="flex items-end justify-between gap-4 h-48 sm:gap-6 md:gap-8 pt-4 relative select-none">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-full border-t border-dashed border-zinc-400 h-0" />
                    ))}
                  </div>

                  {/* Columns */}
                  {historicalData.map((h) => {
                    const incHeight = maxVal > 0 ? (h.income / maxVal) * 100 : 0
                    const expHeight = maxVal > 0 ? (h.expenses / maxVal) * 100 : 0

                    return (
                      <div
                        key={h.month}
                        className="flex-1 flex flex-col items-center h-full justify-end group relative"
                      >
                        {/* Interactive Tooltip on Column Hover */}
                        <div className="absolute bottom-full mb-2 bg-zinc-950 border border-zinc-800 text-[10px] p-2.5 rounded-xl shadow-xl space-y-1 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 min-w-[100px] text-left">
                          <p className="font-semibold text-zinc-300 border-b border-border-subtle/50 pb-1 mb-1">
                            {h.label}
                          </p>
                          <div className="flex items-center justify-between text-emerald-400">
                            <span>Income:</span>
                            <span className="font-bold">{formatCurrencyCompact(h.income)}</span>
                          </div>
                          <div className="flex items-center justify-between text-orange-400">
                            <span>Spent:</span>
                            <span className="font-bold">{formatCurrencyCompact(h.expenses)}</span>
                          </div>
                          <div className="flex items-center justify-between text-brand-400 border-t border-border-subtle/50 pt-1 mt-1 font-semibold">
                            <span>Savings:</span>
                            <span className={h.savings >= 0 ? 'text-brand-300' : 'text-red-400'}>
                              {formatCurrencyCompact(h.savings)}
                            </span>
                          </div>
                        </div>

                        {/* Bars container */}
                        <div className="flex gap-1 sm:gap-2 items-end h-full w-full max-w-[64px] justify-center px-1">
                          {/* Income Bar */}
                          <div
                            className="w-2.5 sm:w-4 bg-emerald-500/80 rounded-t-md hover:bg-emerald-400 transition-all duration-500 ease-out"
                            style={{ height: `${Math.max(3, incHeight)}%` }}
                          />
                          {/* Expense Bar */}
                          <div
                            className="w-2.5 sm:w-4 bg-orange-500/80 rounded-t-md hover:bg-orange-400 transition-all duration-500 ease-out"
                            style={{ height: `${Math.max(3, expHeight)}%` }}
                          />
                        </div>

                        {/* Month Label */}
                        <span className="text-[10px] text-zinc-500 font-semibold mt-2.5 group-hover:text-zinc-200 transition-colors shrink-0">
                          {h.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Chart Legends */}
                <div className="flex items-center justify-center gap-6 pt-2 text-[10px] font-semibold tracking-wide uppercase text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                    <span>Total Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500/80" />
                    <span>Total Outflow</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Second Row: Conic Doughnut Breakdown & Wealth Advising Alerts */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left panel: Category Doughnut Allocation */}
          <Card className="lg:col-span-6 flex flex-col min-h-[400px]">
            <div>
              <h2 className="text-lg font-bold text-white">Expense Allocation</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Category distribution for selected month</p>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center py-4">
              {loading ? (
                // Doughnut skeleton
                <div className="flex flex-col items-center space-y-6">
                  <div className="skeleton h-36 w-36 rounded-full" />
                  <div className="skeleton h-4 w-32" />
                </div>
              ) : !summary || summary.category_breakdown.length === 0 ? (
                <EmptyState
                  icon="🍩"
                  title="No allocation data"
                  description="Record expenses in this month to see category distribution."
                />
              ) : (
                <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-around pt-2">
                  {/* Premium Conic-Doughnut Chart */}
                  <div
                    className="h-36 w-36 sm:h-40 sm:w-40 rounded-full flex items-center justify-center shadow-lg relative"
                    style={{
                      backgroundImage: getConicGradientString(),
                    }}
                  >
                    {/* Dark center cutout */}
                    <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-surface-1 flex flex-col items-center justify-center shadow-inner">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Outflow
                      </p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {formatCurrencyCompact(summary.total_expenses)}
                      </p>
                    </div>
                  </div>

                  {/* Left legends list (Top 4 categories + other summarized) */}
                  <div className="flex-1 max-w-xs space-y-2 text-xs w-full">
                    {summary.category_breakdown.slice(0, 5).map((item) => {
                      const cat =
                        CATEGORIES[item.category as keyof typeof CATEGORIES] || CATEGORIES.other
                      return (
                        <div key={item.category} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-zinc-400 font-medium truncate max-w-[120px]">
                              {cat.label}
                            </span>
                          </div>
                          <div className="font-semibold text-zinc-200">
                            {formatCurrencyCompact(item.amount)}{' '}
                            <span className="text-zinc-500 font-normal text-[10px]">
                              ({item.percentage.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {summary.category_breakdown.length > 5 && (
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-semibold border-t border-border-subtle/30 pt-1.5">
                        <span>Other categories</span>
                        <span>
                          {formatCurrencyCompact(
                            summary.category_breakdown
                              .slice(5)
                              .reduce((sum, item) => sum + item.amount, 0)
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Right panel: Smart Wealth Insights alerts */}
          <Card className="lg:col-span-6 flex flex-col min-h-[400px]">
            <div>
              <h2 className="text-lg font-bold text-white">Wealth Advising Alerts</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Automated cashflow tips and intelligence</p>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-4 mt-6">
              {loading ? (
                // Skeletons
                [1, 2].map((i) => (
                  <div key={i} className="skeleton h-20 w-full" />
                ))
              ) : !summary || (summary.total_income === 0 && summary.total_expenses === 0) ? (
                <EmptyState
                  icon="💡"
                  title="No advice yet"
                  description="Record income and expenses for this month to trigger our personal wealth advisor."
                />
              ) : (
                <>
                  {/* MoM Expense Trend Alert */}
                  {trend && (
                    <div
                      className={`rounded-2xl border p-4 flex gap-3.5 animate-slide-up ${
                        trend.increased
                          ? 'bg-red-500/5 border-red-500/10'
                          : 'bg-emerald-500/5 border-emerald-500/10'
                      }`}
                    >
                      <span className="text-2xl mt-0.5 select-none">{trend.increased ? '⚠️' : '🎉'}</span>
                      <div className="text-xs leading-relaxed">
                        <h4 className={`font-bold ${trend.increased ? 'text-red-400' : 'text-emerald-400'}`}>
                          {trend.increased ? 'Discretionary Outflow Surge' : 'Excellent Budget Control'}
                        </h4>
                        <p className="text-zinc-400 mt-1">
                          {trend.increased
                            ? `Your outflow expanded by ${trend.pct.toFixed(0)}% (+${formatCurrency(
                                Math.abs(trend.diff)
                              )}) compared to ${trend.prevLabel}. Check your category limits stack in budgets to establish tighter caps.`
                            : `Outstanding discipline! Your monthly expenses decreased by ${Math.abs(
                                trend.pct
                              ).toFixed(0)}% compared to ${trend.prevLabel}.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Savings Rate Alert */}
                  <div
                    className={`rounded-2xl border p-4 flex gap-3.5 animate-slide-up stagger-1 ${
                      savingsRate >= 30
                        ? 'bg-brand-500/5 border-brand-500/10'
                        : savingsRate >= 10
                        ? 'bg-zinc-800/20 border-zinc-700/50'
                        : 'bg-amber-500/5 border-amber-500/10'
                    }`}
                  >
                    <span className="text-2xl mt-0.5 select-none">
                      {savingsRate >= 30 ? '🛡️' : savingsRate >= 10 ? '📈' : '💡'}
                    </span>
                    <div className="text-xs leading-relaxed">
                      <h4
                        className={`font-bold ${
                          savingsRate >= 30
                            ? 'text-brand-400'
                            : savingsRate >= 10
                            ? 'text-zinc-200'
                            : 'text-amber-400'
                        }`}
                      >
                        {savingsRate >= 30
                          ? 'High Wealth Accumulation'
                          : savingsRate >= 10
                          ? 'Healthy Saving Pattern'
                          : 'Aggressive Outflow Impact'}
                      </h4>
                      <p className="text-zinc-400 mt-1">
                        {savingsRate >= 30
                          ? `You secured a magnificent ${savingsRate.toFixed(
                              0
                            )}% savings rate (${formatCurrency(
                              summary.savings
                            )}) of your total earnings this month! Highly effective wealth retention.`
                          : savingsRate >= 10
                          ? `Your savings rate sits at ${savingsRate.toFixed(
                              0
                            )}% this month. A very stable pattern. Keep mapping discretionary purchases to maintain this line.`
                          : `You saved only ${Math.max(0, savingsRate).toFixed(
                              0
                            )}% of your income this month. Discretionary debit leaks are absorbing your cash flow. Establish category limits immediately.`}
                      </p>
                    </div>
                  </div>

                  {/* Top Spending category Insight */}
                  {summary.category_breakdown.length > 0 && (
                    <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/10 p-4 flex gap-3.5 animate-slide-up stagger-2">
                      <span className="text-2xl mt-0.5 select-none">🎯</span>
                      <div className="text-xs leading-relaxed">
                        <h4 className="font-bold text-zinc-200">Discretionary Focus Target</h4>
                        <p className="text-zinc-400 mt-1">
                          {(() => {
                            const top = summary.category_breakdown[0]
                            const cat =
                              CATEGORIES[top.category as keyof typeof CATEGORIES] ||
                              CATEGORIES.other
                            const savingsTarget = top.amount * 0.15
                            return (
                              <span>
                                <strong>{cat.emoji} {cat.label}</strong> was your largest outflow
                                absorb, eating <strong>{top.percentage.toFixed(0)}%</strong> of your
                                total expenses. Trimming this category limit by just 15% would secure an
                                extra <strong>{formatCurrency(savingsTarget)}</strong> next month!
                              </span>
                            )
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
