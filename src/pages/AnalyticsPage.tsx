// ============================================
// AnalyticsPage (Insights) — Visual & Advisory Hub
// Merged Insights and CA Advisory dashboard
// ============================================

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/layouts/AppLayout'
import { Card, EmptyState, Badge } from '@/components/ui'
import { supabase } from '@/services/supabase'
import { formatCurrency, formatCurrencyCompact, getCurrentMonth, withTimeout } from '@/utils'
import { CATEGORIES } from '@/constants'
import { generateAIInsights, detectAnomalies, generateForecast } from '@/services/aiService'
import type { FinancialContext } from '@/services/aiService'

type RangeType = 'this-week' | 'last-week' | 'last-15-days' | 'last-month' | 'last-6-months';

interface TrendItem {
  label: string
  income: number
  expenses: number
  savings: number
  dateStr?: string
  monthKey?: string
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

// Group default categories into 50/30/20 definitions
const NEEDS_CATEGORIES = ['groceries', 'utilities', 'transport', 'rent', 'health', 'education']
const WANTS_CATEGORIES = ['food', 'shopping', 'entertainment', 'subscriptions', 'travel', 'other', 'transfers']
const SAVINGS_CATEGORIES = ['investments']

const getRangeDates = (range: RangeType) => {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  if (range === 'this-week') {
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day // Monday start
    start.setDate(now.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else if (range === 'last-week') {
    const day = now.getDay()
    const diff = (day === 0 ? -6 : 1 - day) - 7 // Previous Monday start
    start.setDate(now.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else if (range === 'last-15-days') {
    start.setDate(now.getDate() - 14)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (range === 'last-month') {
    start.setDate(now.getDate() - 29)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (range === 'last-6-months') {
    start.setMonth(now.getMonth() - 5)
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  }
  return { start, end }
}

const getTrendData = (txns: any[], range: RangeType): TrendItem[] => {
  const { start } = getRangeDates(range)
  
  if (range === 'this-week' || range === 'last-week') {
    const days: TrendItem[] = []
    const temp = new Date(start)
    for (let i = 0; i < 7; i++) {
      const dateStr = temp.toISOString().split('T')[0]
      const label = temp.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
      days.push({ dateStr, label, income: 0, expenses: 0, savings: 0 })
      temp.setDate(temp.getDate() + 1)
    }
    txns.forEach((t) => {
      const dayObj = days.find((d) => d.dateStr === t.date)
      if (dayObj) {
        const amt = Number(t.amount)
        if (t.type === 'credit') {
          dayObj.income += amt
        } else {
          dayObj.expenses += amt
        }
        dayObj.savings = dayObj.income - dayObj.expenses
      }
    })
    return days
  }
  
  if (range === 'last-15-days') {
    const days: TrendItem[] = []
    const temp = new Date(start)
    for (let i = 0; i < 15; i++) {
      const dateStr = temp.toISOString().split('T')[0]
      const label = temp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      days.push({ dateStr, label, income: 0, expenses: 0, savings: 0 })
      temp.setDate(temp.getDate() + 1)
    }
    txns.forEach((t) => {
      const dayObj = days.find((d) => d.dateStr === t.date)
      if (dayObj) {
        const amt = Number(t.amount)
        if (t.type === 'credit') {
          dayObj.income += amt
        } else {
          dayObj.expenses += amt
        }
        dayObj.savings = dayObj.income - dayObj.expenses
      }
    })
    return days
  }
  
  if (range === 'last-month') {
    const weeks = [
      { label: 'Week 1', startOffset: 0, endOffset: 6, income: 0, expenses: 0, savings: 0 },
      { label: 'Week 2', startOffset: 7, endOffset: 13, income: 0, expenses: 0, savings: 0 },
      { label: 'Week 3', startOffset: 14, endOffset: 20, income: 0, expenses: 0, savings: 0 },
      { label: 'Week 4', startOffset: 21, endOffset: 29, income: 0, expenses: 0, savings: 0 },
    ]
    
    const weekRanges = weeks.map((w) => {
      const wStart = new Date(start)
      wStart.setDate(start.getDate() + w.startOffset)
      const wEnd = new Date(start)
      wEnd.setDate(start.getDate() + w.endOffset)
      return {
        label: w.label,
        startStr: wStart.toISOString().split('T')[0],
        endStr: wEnd.toISOString().split('T')[0],
        income: 0,
        expenses: 0,
        savings: 0,
      }
    })
    
    txns.forEach((t) => {
      const tDate = t.date
      if (!tDate) return
      const week = weekRanges.find((w) => tDate >= w.startStr && tDate <= w.endStr)
      if (week) {
        const amt = Number(t.amount)
        if (t.type === 'credit') {
          week.income += amt
        } else {
          week.expenses += amt
        }
        week.savings = week.income - week.expenses
      }
    })
    return weekRanges
  }
  
  if (range === 'last-6-months') {
    const monthsList: TrendItem[] = []
    const temp = new Date(start)
    for (let i = 0; i < 6; i++) {
      const year = temp.getFullYear()
      const mon = temp.getMonth()
      const monthKey = `${year}-${String(mon + 1).padStart(2, '0')}`
      const label = temp.toLocaleDateString('en-IN', { month: 'short' }) + ' ' + String(year).substring(2)
      monthsList.push({ monthKey, label, income: 0, expenses: 0, savings: 0 })
      temp.setMonth(temp.getMonth() + 1)
    }
    
    txns.forEach((t) => {
      if (!t.date) return
      const tMonth = t.date.substring(0, 7)
      const monthObj = monthsList.find((m) => m.monthKey === tMonth)
      if (monthObj) {
        const amt = Number(t.amount)
        if (t.type === 'credit') {
          monthObj.income += amt
        } else {
          monthObj.expenses += amt
        }
        monthObj.savings = monthObj.income - monthObj.expenses
      }
    })
    return monthsList
  }
  
  return []
}

const getAllocationData = (txns: any[], range: RangeType): SummaryData => {
  const { start, end } = getRangeDates(range)
  const startStr = start.toISOString().split('T')[0]
  const endStr = end.toISOString().split('T')[0]
  
  const filtered = txns.filter((t) => t.date && t.date >= startStr && t.date <= endStr)
  
  const total_income = filtered
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
    
  const total_expenses = filtered
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
    
  const categoryMap = new Map<string, { amount: number; count: number }>()
  filtered
    .filter((t) => t.type === 'debit')
    .forEach((t) => {
      const existing = categoryMap.get(t.category) || { amount: 0, count: 0 }
      categoryMap.set(t.category, {
        amount: existing.amount + Number(t.amount),
        count: existing.count + 1,
      })
    })
    
  const category_breakdown = Array.from(categoryMap.entries())
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      percentage: total_expenses > 0 ? (amount / total_expenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    
  return {
    total_income,
    total_expenses,
    savings: total_income - total_expenses,
    category_breakdown,
  }
}

const getMoMTrend = (allTxns: any[]) => {
  const monthlyStats = getTrendData(allTxns, 'last-6-months')
  if (monthlyStats.length < 2) return null
  
  const prevMonthData = monthlyStats[monthlyStats.length - 2]
  const curMonthData = monthlyStats[monthlyStats.length - 1]
  
  if (!prevMonthData || !curMonthData || prevMonthData.expenses === 0) return null
  
  const diff = curMonthData.expenses - prevMonthData.expenses
  const pct = (diff / prevMonthData.expenses) * 100
  return {
    diff,
    pct,
    increased: diff > 0,
    prevLabel: prevMonthData.label,
  }
}

const getTrendDescription = (trendData: TrendItem[], range: RangeType) => {
  if (range === 'this-week') {
    return 'Daily income and expense trend for the current week'
  }
  if (range === 'last-week') {
    return 'Daily income and expense trend for the previous week'
  }
  if (range === 'last-15-days') {
    return 'Daily income and expense trend for the last 15 days'
  }
  if (range === 'last-month') {
    return 'Weekly income and expense trend for the last 30 days'
  }
  if (range === 'last-6-months') {
    const count = trendData.length
    return `Historical overview of last ${count} months`
  }
  return 'Historical financial overview'
}

export default function AnalyticsPage() {
  const [trendRange, setTrendRange] = useState<RangeType>('this-week')
  const [allocationRange, setAllocationRange] = useState<RangeType>('this-week')
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // AI Insights State
  const [aiInsights, setAiInsights] = useState<string[]>([])
  const [aiAlerts, setAiAlerts] = useState<string[]>([])
  const [aiSource, setAiSource] = useState<'gemini' | 'rule-based' | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Advisory Month Picker & Simulator State
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [simSalary, setSimSalary] = useState<number>(0)
  const [simWants, setSimWants] = useState<number>(0)

  useEffect(() => {
    document.title = 'Insights | Dhanrakshak'
    
    async function fetchAllData() {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('User not authenticated')

        const { data, error: queryError } = await withTimeout(
          Promise.resolve(
            supabase
              .from('transactions')
              .select('id, amount, type, category, date, merchant, description')
              .eq('user_id', user.id)
              .eq('approval_status', 'approved')
              .gte('date', (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().split('T')[0] })())
              .order('date', { ascending: true })
          ) as Promise<any>,
          45000,
          'Insights data fetch'
        )

        if (queryError) throw queryError
        setTransactions(data || [])
      } catch (err: any) {
        console.error('Error fetching insights data:', err)
        setError(err.message || 'Failed to load financial analysis.')
      } finally {
        setLoading(false)
      }
    }

    fetchAllData()
  }, [])

  // 1. Cashflow Analytics Data (memoized to avoid recalculation on every render)
  const trendData = useMemo(() => getTrendData(transactions, trendRange), [transactions, trendRange])
  const summary = useMemo(() => getAllocationData(transactions, allocationRange), [transactions, allocationRange])
  const trend = useMemo(() => getMoMTrend(transactions), [transactions])

  // 2. Anomaly detection & forecasting (memoized)
  const anomalies = useMemo(() => detectAnomalies(transactions), [transactions])
  const forecast = useMemo(() => generateForecast(transactions), [transactions])

  const maxVal = trendData.length
    ? Math.max(...trendData.map((h) => Math.max(h.income, h.expenses)))
    : 0

  const savingsRate =
    summary && summary.total_income > 0
      ? (summary.savings / summary.total_income) * 100
      : 0

  // Conic Gradient for doughnut
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

  // 2. CA Advisory Computations
  const monthlyTxns = transactions.filter((t) => t.date && t.date.startsWith(selectedMonth))
  const incomeTxns = monthlyTxns.filter((t) => t.type === 'credit' && t.category === 'salary')
  const totalIncome = incomeTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  const debitTxns = monthlyTxns.filter((t) => t.type === 'debit')
  const totalDebit = debitTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  const needsSpent = debitTxns
    .filter((t) => NEEDS_CATEGORIES.includes(t.category))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const wantsSpent = debitTxns
    .filter((t) => WANTS_CATEGORIES.includes(t.category))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const savingsSpent = debitTxns
    .filter((t) => SAVINGS_CATEGORIES.includes(t.category))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const denominator = totalIncome > 0 ? totalIncome : totalDebit || 1
  const needsPct = Math.round((needsSpent / denominator) * 100)
  const wantsPct = Math.round((wantsSpent / denominator) * 100)
  const savingsPct = totalIncome > 0 
    ? Math.round(((totalIncome - needsSpent - wantsSpent) / totalIncome) * 100)
    : Math.round((savingsSpent / denominator) * 100)

  const finalSavingsPct = Math.max(0, savingsPct)

  const needsVariance = Math.abs(needsPct - 50)
  const wantsVariance = Math.abs(wantsPct - 30)
  const savingsVariance = Math.abs(finalSavingsPct - 20)
  const totalVariance = needsVariance + wantsVariance + savingsVariance
  const healthScore = Math.max(10, 100 - Math.round(totalVariance * 1.5))

  const alerts: string[] = []
  const insights: string[] = []

  if (needsPct > 55) {
    alerts.push(`High Fixed Obligations: Essential Needs represent ${needsPct}% of your cash flow, exceeding the 50% target.`)
    insights.push(`Your essential obligations (rent, bills, utilities) are taking up a large portion of your cash flow. Consider reviewing utility tariffs, negotiating rent, or deferring non-essential transport to release liquid reserves.`)
  } else {
    insights.push(`Excellent essential spend optimization. Needs are well-controlled at ${needsPct}%, leaving plenty of headroom.`)
  }

  if (wantsPct > 35) {
    alerts.push(`Elevated Discretionary Outflow: Wants represent ${wantsPct}% of your budget, eating into your compounding potential.`)
    insights.push(`Your discretionary wants (dining, shopping, entertainment) represent ${wantsPct}% of your cash flow. Reducing eating out or shopping by just 10% would significantly buffer your savings account.`)
  } else {
    insights.push(`Good balance in leisure spending. Wants are kept under wraps at ${wantsPct}%.`)
  }

  if (finalSavingsPct < 15) {
    alerts.push(`Underfunded Savings Rate: Net savings rate is ${finalSavingsPct}%, below the 20% growth threshold.`)
    insights.push(`Your current savings rate of ${finalSavingsPct}% is below the 20% golden target. Directing at least 10% of salary credits towards automated mutual fund SIPs immediately upon receipt prevents impulsive spending.`)
  } else {
    insights.push(`Phenomenal wealth creation velocity! You are saving a solid ${finalSavingsPct}% of your income. Compounding is working in your favor.`)
  }

  const avgMonthlyNeeds = needsSpent || 15000
  const totalInvestments = transactions
    .filter((t) => t.category === 'investments')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const emergencyMonths = Number((totalInvestments / avgMonthlyNeeds).toFixed(1))
  const isEmergencyFundReady = emergencyMonths >= 6

  // Set default simulation inputs once data is loaded
  useEffect(() => {
    if (totalIncome > 0 && simSalary === 0) {
      setSimSalary(totalIncome)
    }
    if (wantsSpent > 0 && simWants === 0) {
      setSimWants(wantsSpent)
    }
  }, [totalIncome, wantsSpent])

  const simulatedSavings = Math.max(0, simSalary - needsSpent - simWants)
  const simSavingsPct = simSalary > 0 ? Math.round((simulatedSavings / simSalary) * 100) : 0

  // Generate AI insights when financial data is ready
  useEffect(() => {
    if (loading || transactions.length === 0) return
    if (totalIncome === 0 && totalDebit === 0) return

    const ctx: FinancialContext = {
      month: selectedMonth,
      totalIncome,
      totalExpenses: totalDebit,
      savings: totalIncome - totalDebit,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalDebit) / totalIncome) * 100 : 0,
      needsPct,
      wantsPct,
      savingsPct: finalSavingsPct,
      healthScore,
      topCategory: summary?.category_breakdown?.[0]?.category || 'other',
      topCategoryAmount: summary?.category_breakdown?.[0]?.amount || 0,
      topCategoryPct: summary?.category_breakdown?.[0]?.percentage || 0,
      momTrend: trend,
      subscriptionBurn: transactions
        .filter((t) => t.category === 'subscriptions' && t.type === 'debit')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0),
      emergencyMonths,
      categoryBreakdown: summary?.category_breakdown || [],
    }

    setAiLoading(true)
    generateAIInsights(ctx)
      .then(({ insights, alerts, source }) => {
        setAiInsights(insights)
        setAiAlerts(alerts)
        setAiSource(source)
      })
      .catch(() => {
        setAiInsights([])
        setAiAlerts([])
      })
      .finally(() => setAiLoading(false))
  }, [loading, transactions.length, selectedMonth])

  const scoreColor =
    healthScore >= 80 ? 'text-[var(--status-positive-text)]' :
    healthScore >= 55 ? 'text-[var(--status-warning-text)]' :
    'text-[var(--status-danger-text)]'

  const scoreBg =
    healthScore >= 80 ? 'border-[var(--status-positive-border)] bg-[var(--status-positive-subtle)]' :
    healthScore >= 55 ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)]' :
    'border-[var(--status-danger-border)] bg-[var(--status-danger-subtle)]'

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Unified Main Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 bg-surface-2/10 border border-border-subtle/10 rounded-2xl backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Insights</h1>
            <p className="mt-1 text-xs text-zinc-400">
              CA-verified budget diagnostics, cashflow trend analytics, and smart wealth advisors unified.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <span className="text-xs text-zinc-500">Selected Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-surface-1 border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-xs text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 1: Executive Diagnostic Summary (Highest Priority) */}
        {/* ========================================================================= */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="h-60 skeleton"><div /></Card>
            <Card className="md:col-span-2 h-60 skeleton"><div /></Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Scorecard Display */}
            <Card className={`border md:col-span-1 flex flex-col items-center justify-center p-6 text-center shadow-lg ${scoreBg}`}>
              <div className="relative flex items-center justify-center h-28 w-28 rounded-full border-4 border-dashed border-zinc-700/60 mb-4 bg-surface-1/40">
                <span className={`text-4xl font-extrabold tracking-tight ${scoreColor}`}>
                  {healthScore}
                </span>
                <span className="absolute bottom-1 text-[9px] uppercase tracking-wider font-bold text-zinc-500">
                  Health Index
                </span>
              </div>
              
              <h2 className="text-md font-bold text-zinc-200">Adherence Diagnostic</h2>
              <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider mt-1.5 border border-zinc-800 rounded-full px-3 py-0.5">
                Platform Verified
              </p>

              <div className="w-full mt-6 space-y-2 text-xs">
                <div className="flex justify-between border-b border-border-subtle/30 pb-2">
                  <span className="text-zinc-500">Income Credits</span>
                  <span className="font-semibold text-zinc-200">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="flex justify-between border-b border-border-subtle/30 pb-2">
                  <span className="text-zinc-500">Total Spent</span>
                  <span className="font-semibold text-zinc-200">{formatCurrency(totalDebit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Adherence Status</span>
                  <span className={`font-bold ${scoreColor}`}>
                    {healthScore >= 80 ? 'Excellent Balance' : healthScore >= 55 ? 'Needs Adjustment' : 'Highly Imbalanced'}
                  </span>
                </div>
              </div>
            </Card>

            {/* 50/30/20 Ratio Card */}
            <Card className="md:col-span-2 border-border-subtle bg-surface-1 shadow-md flex flex-col justify-between p-5">
              <div>
                <h2 className="text-base font-bold text-zinc-200 mb-4">50/30/20 Cashflow Distribution</h2>
                <div className="space-y-4">
                  {/* Needs */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        📦 Needs (Target 50%)
                      </span>
                      <span className="text-zinc-200 font-medium">
                        {formatCurrency(needsSpent)} ({needsPct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--status-info-text)] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, needsPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Wants */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        🍔 Wants (Target 30%)
                      </span>
                      <span className="text-zinc-200 font-medium">
                        {formatCurrency(wantsSpent)} ({wantsPct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--status-warning-text)] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, wantsPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Savings */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        📈 Savings / Investments (Target 20%)
                      </span>
                      <span className="text-zinc-200 font-medium">
                        {formatCurrency(totalIncome > 0 ? (totalIncome - needsSpent - wantsSpent) : savingsSpent)} ({finalSavingsPct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--status-positive-text)] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, finalSavingsPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Reserve Check */}
              <div className="mt-6 p-4 rounded-2xl bg-surface-2/40 border border-border-subtle/30 flex items-center justify-between text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-zinc-300 flex items-center gap-1.5">🛡️ Emergency Reserve Status</span>
                  <span className="text-zinc-500 text-[10px]">
                    Current Reserve covers <strong>{emergencyMonths} months</strong> of average essentials.
                  </span>
                </div>
                <div>
                  <Badge variant={isEmergencyFundReady ? 'success' : 'warning'}>
                    {isEmergencyFundReady ? 'Funded (6mo+)' : 'Needs Buffering'}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: AI Wealth Advisory + Anomalies + Scenario Simulator */}
        {/* ========================================================================= */}
        {!loading && (
          <div className="space-y-6">

            {/* Anomaly Alerts — show only when anomalies detected */}
            {anomalies.length > 0 && (
              <Card className="border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🔥</span>
                  <h2 className="text-base font-bold text-[var(--status-warning-text)]">Spending Anomaly Alerts</h2>
                  <Badge variant="warning" className="ml-auto text-[10px]">AI Detected</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {anomalies.map((anomaly, i) => {
                    const cat = CATEGORIES[anomaly.category as keyof typeof CATEGORIES] || CATEGORIES.other
                    return (
                      <div key={i} className="rounded-xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-[var(--status-warning-text)]">{cat.emoji} {cat.label}</span>
                          <Badge variant="warning">+{anomaly.spike.toFixed(0)}%</Badge>
                        </div>
                        <p className="text-xs text-zinc-300">
                          <span className="font-semibold text-white">{formatCurrency(anomaly.thisMonth)}</span> this month vs{' '}
                          <span className="text-[var(--status-warning-text)]">{formatCurrency(anomaly.baseline)}</span> baseline
                        </p>
                        <p className="text-[10px] text-[var(--status-warning-text)] mt-1">
                          {formatCurrency(anomaly.thisMonth - anomaly.baseline)} above your 3-month average
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* AI Advisory + Simulator row */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border-subtle bg-surface-1 shadow-md p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-base font-bold text-zinc-200">📝 Wealth Advisory Recommendations</h2>
                  {aiSource && (
                    <span className={`ml-auto text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full border ${
                      aiSource === 'gemini'
                        ? 'text-brand-400 border-brand-500/30 bg-brand-500/10'
                        : 'text-zinc-500 border-zinc-700 bg-zinc-800/50'
                    }`}>
                      {aiSource === 'gemini' ? '✦ AI' : 'Rule-based'}
                    </span>
                  )}
                </div>

                {aiLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-20 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <>
                    {aiAlerts.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {aiAlerts.map((alert, i) => (
                          <div key={i} className="flex gap-2 p-3 text-xs bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] rounded-xl">
                            <span aria-hidden="true">🚨</span>
                            <span>{alert}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {aiInsights.length > 0 ? aiInsights.map((insight, i) => (
                        <div key={i} className="p-3 bg-surface-2/30 border border-border-subtle/20 rounded-xl text-xs text-zinc-300 leading-relaxed italic relative">
                          <span className="text-zinc-600 text-3xl font-serif absolute top-1 right-2 pointer-events-none select-none">"</span>
                          <span>{insight}</span>
                        </div>
                      )) : (
                        <EmptyState icon="💡" title="No advice yet" description="Record income and expenses for the selected month to trigger the wealth advisor." />
                      )}
                    </div>
                  </>
                )}
              </Card>

              {/* Scenario Simulator — unchanged */}
              <Card className="border-border-subtle bg-surface-1 shadow-md flex flex-col justify-between p-5">
                <div>
                  <h2 className="text-base font-bold text-zinc-200 mb-2">📊 Budget Scenario Simulator</h2>
                  <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                    Slide your income or discretionary wants to simulate your monthly savings targets.
                  </p>

                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-zinc-400 font-semibold">Simulated Monthly Income</span>
                        <span className="font-bold text-brand-300">{formatCurrency(simSalary)}</span>
                      </div>
                      <input
                        type="range"
                        min={Math.max(10000, totalIncome - 50000)}
                        max={totalIncome + 100000 || 200000}
                        step={5000}
                        value={simSalary}
                        onChange={(e) => setSimSalary(Number(e.target.value))}
                        className="w-full accent-brand-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-zinc-400 font-semibold">Simulated Leisure / Wants Outflow</span>
                        <span className="font-bold text-[var(--status-warning-text)]">{formatCurrency(simWants)}</span>
                      </div>
                      <input
                        type="range"
                        min={1000}
                        max={Math.max(10000, wantsSpent + 30000)}
                        step={1000}
                        value={simWants}
                        onChange={(e) => setSimWants(Number(e.target.value))}
                        className="w-full accent-brand-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-4 border border-brand-500/20 bg-brand-500/5 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold">Simulated Monthly Savings</span>
                    <span className="font-extrabold text-[var(--status-positive-text)] text-sm">
                      {formatCurrency(simulatedSavings)} ({simSavingsPct}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    {simSavingsPct >= 20
                      ? `🟢 Adheres fully to the 20% compounding baseline. At this rate, your emergency reserve is secure.`
                      : `🔴 Below the 20% savings baseline. Try reducing wants or finding tax deductions to buffer savings.`}
                  </p>
                </div>
              </Card>
            </div>

            {/* Cash Flow Forecast */}
            {forecast.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-white">📅 3-Month Cash Flow Forecast</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Based on your last 6 months of spending patterns</p>
                  </div>
                  <Badge variant="info" className="ml-auto text-[10px]">Predictive</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {forecast.map((f, i) => (
                    <div key={i} className={`rounded-2xl border p-5 ${
                      f.forecastSavings >= 0
                        ? 'bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
                        : 'bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-white">{f.label}</span>
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">
                          {f.confidence}% confidence
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Expected Income</span>
                          <span className="text-[var(--status-positive-text)] font-semibold">{formatCurrency(f.forecastIncome)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Expected Expenses</span>
                          <span className="text-[var(--status-warning-text)] font-semibold">{formatCurrency(f.forecastExpenses)}</span>
                        </div>
                        <div className="flex justify-between border-t border-zinc-700/50 pt-2 mt-2">
                          <span className="text-zinc-400 font-semibold">Net Savings</span>
                          <span className={`font-bold text-sm ${
                            f.forecastSavings >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'
                          }`}>
                            {f.forecastSavings >= 0 ? '+' : ''}{formatCurrency(f.forecastSavings)}
                          </span>
                        </div>
                      </div>
                      {/* Mini confidence bar */}
                      <div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${f.confidence}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-4 text-center">
                  Forecast uses weighted moving average of your last 6 months. Confidence decreases for months further ahead.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 3: Visual Cashflow Trends (Bar Chart) */}
        {/* ========================================================================= */}
        <Card className="flex flex-col min-h-[300px] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Income vs Expense Trend</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{getTrendDescription(trendData, trendRange)}</p>
            </div>
            
            <select
              value={trendRange}
              onChange={(e) => setTrendRange(e.target.value as RangeType)}
              className="bg-surface-2 border border-zinc-700 text-zinc-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer shadow-sm hover:border-zinc-600 transition-colors"
            >
              <option value="this-week">This Week</option>
              <option value="last-week">Last Week</option>
              <option value="last-15-days">Last 15 Days</option>
              <option value="last-month">Last Month</option>
              <option value="last-6-months">Last 6 Months</option>
            </select>
          </div>

          <div className="flex-1 flex flex-col justify-end mt-8">
            {loading ? (
              <div className="flex items-end justify-between gap-6 h-40 pt-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex-1 flex gap-2 items-end h-full justify-center">
                    <div className="skeleton w-6 h-2/3" />
                    <div className="skeleton w-6 h-1/3" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon="📈"
                title="Insufficient history"
                description="Record transactions over consecutive months to see historical comparisons."
              />
            ) : (
                  <div className="space-y-4">
                    {/* Pure CSS Bar chart */}
                    <div className="overflow-x-auto scrollbar-none w-full pb-2">
                      <div className="flex items-end justify-between gap-2.5 sm:gap-6 md:gap-8 h-48 pt-4 relative select-none min-w-[500px] md:min-w-0">
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-full border-t border-dashed border-zinc-400 h-0" />
                          ))}
                        </div>

                        {trendData.map((h, index) => {
                          const incHeight = maxVal > 0 ? (h.income / maxVal) * 100 : 0
                          const expHeight = maxVal > 0 ? (h.expenses / maxVal) * 100 : 0

                          return (
                            <div
                              key={index}
                              className="flex-1 flex flex-col items-center h-full justify-end group relative"
                            >
                              <div className="absolute bottom-full mb-2 bg-zinc-950 border border-zinc-800 text-[10px] p-2.5 rounded-xl shadow-xl space-y-1 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 min-w-[120px] text-left">
                                <p className="font-semibold text-zinc-300 border-b border-border-subtle/50 pb-1 mb-1">
                                  {h.label}
                                </p>
                                <div className="flex items-center justify-between text-[var(--status-positive-text)]">
                                  <span>Income:</span>
                                  <span className="font-bold">{formatCurrencyCompact(h.income)}</span>
                                </div>
                                <div className="flex items-center justify-between text-[var(--status-warning-text)]">
                                  <span>Spent:</span>
                                  <span className="font-bold">{formatCurrencyCompact(h.expenses)}</span>
                                </div>
                                <div className="flex items-center justify-between text-brand-400 border-t border-border-subtle/50 pt-1 mt-1 font-semibold">
                                  <span>Savings:</span>
                                  <span className={h.savings >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}>
                                    {formatCurrencyCompact(h.savings)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex gap-1 sm:gap-2 items-end h-full w-full max-w-[64px] justify-center px-1">
                                <div
                                  className="w-2.5 sm:w-4 bg-[var(--status-positive-text)]/80 rounded-t-md hover:bg-[var(--status-positive-text)] transition-all duration-500 ease-out"
                                  style={{ height: `${Math.max(3, incHeight)}%` }}
                                />
                                <div
                                  className="w-2.5 sm:w-4 bg-[var(--status-warning-text)]/80 rounded-t-md hover:bg-[var(--status-warning-text)] transition-all duration-500 ease-out"
                                  style={{ height: `${Math.max(3, expHeight)}%` }}
                                />
                              </div>

                              <span className="text-[10px] text-zinc-500 font-semibold mt-2.5 group-hover:text-zinc-200 transition-colors shrink-0">
                                {h.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 pt-2 text-[10px] font-semibold tracking-wide uppercase text-zinc-500">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-positive-text)]/80" />
                        <span>Total Income</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-warning-text)]/80" />
                        <span>Total Outflow</span>
                      </div>
                    </div>
                  </div>
                )}
          </div>
        </Card>

        {/* ========================================================================= */}
        {/* SECTION 4: Expense Doughnut Allocation & Smart Wealth Advising Alerts */}
        {/* ========================================================================= */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Expense Allocation Doughnut */}
          <Card className="lg:col-span-6 flex flex-col min-h-[400px] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Expense Allocation</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Category distribution for selected period</p>
              </div>

              <select
                value={allocationRange}
                onChange={(e) => setAllocationRange(e.target.value as RangeType)}
                className="bg-surface-2 border border-zinc-700 text-zinc-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer shadow-sm hover:border-zinc-600 transition-colors"
              >
                <option value="this-week">This Week</option>
                <option value="last-week">Last Week</option>
                <option value="last-15-days">Last 15 Days</option>
                <option value="last-month">Last Month</option>
                <option value="last-6-months">Last 6 Months</option>
              </select>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center py-4">
              {loading ? (
                <div className="flex flex-col items-center space-y-6">
                  <div className="skeleton h-36 w-36 rounded-full" />
                  <div className="skeleton h-4 w-32" />
                </div>
              ) : !summary || summary.total_expenses === 0 ? (
                <EmptyState
                  icon="🍩"
                  title="No allocation data"
                  description="Record expenses in this period to see category distribution."
                />
              ) : (
                <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-around pt-2">
                  <div
                    className="h-36 w-36 sm:h-40 sm:w-40 rounded-full flex items-center justify-center shadow-lg relative shrink-0"
                    style={{
                      backgroundImage: getConicGradientString(),
                    }}
                  >
                    <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-surface-1 flex flex-col items-center justify-center shadow-inner">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Outflow
                      </p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {formatCurrencyCompact(summary.total_expenses)}
                      </p>
                    </div>
                  </div>

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

          {/* Smart Wealth insights */}
          <Card className="lg:col-span-6 flex flex-col min-h-[400px] p-5">
            <div>
              <h2 className="text-lg font-bold text-white">Smart Wealth Insights</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Automated cashflow tips and intelligence</p>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-4 mt-6">
              {loading ? (
                [1, 2].map((i) => (
                  <div key={i} className="skeleton h-20 w-full" />
                ))
              ) : !summary || (summary.total_income === 0 && summary.total_expenses === 0) ? (
                <EmptyState
                  icon="💡"
                  title="No advice yet"
                  description="Record income and expenses for this period to trigger our personal wealth advisor."
                />
              ) : (
                <>
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

                  <div
                    className={`rounded-2xl border p-4 flex gap-3.5 animate-slide-up stagger-1 ${
                      savingsRate >= 30
                        ? 'bg-emerald-500/5 border-emerald-500/10'
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
                            ? 'text-emerald-400'
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
                            )}) of your total earnings in this period! Highly effective wealth retention.`
                          : savingsRate >= 10
                          ? `Your savings rate sits at ${savingsRate.toFixed(
                              0
                            )}% in this period. A very stable pattern. Keep mapping discretionary purchases to maintain this line.`
                          : `You saved only ${Math.max(0, savingsRate).toFixed(
                              0
                            )}% of your income in this period. Discretionary debit leaks are absorbing your cash flow. Establish category limits immediately.`}
                      </p>
                    </div>
                  </div>

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
                                extra <strong>{formatCurrency(savingsTarget)}</strong> next period!
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
