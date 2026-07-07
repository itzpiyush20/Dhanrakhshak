// ============================================
// AnalyticsPage (Insights) — Visual & Advisory Hub
// Merged Insights and CA Advisory dashboard
// ============================================

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/layouts/AppLayout'
import { Card } from '@/components/ui'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/context/AuthContext'
import { getCurrentMonth, withTimeout } from '@/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { detectAnomalies, generateForecast, generateAIInsights } from '@/services/aiService'
import type { FinancialContext } from '@/services/aiService'
import {
  AdherenceDiagnostic,
  BudgetVisualizer,
  AnomalyAlerts,
  AIInsights,
  ScenarioSimulator,
  ForecastPanel,
  TrendChart,
  ExpenseBreakdown,
  SmartWealthTips,
  type RangeType
} from './analytics'

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

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [trendRange, setTrendRange] = useState<RangeType>('this-week')
  const [allocationRange, setAllocationRange] = useState<RangeType>('this-week')
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Progressive disclosure — a mixed-literacy audience opening 8 analytics
  // modules at once tends to bounce off the page entirely. Default to the 3
  // core ones; remember the choice once someone opts into the rest.
  const [showAdvanced, setShowAdvanced] = useState(
    () => localStorage.getItem('dhanrakshak_analytics_advanced') === 'true'
  )
  const toggleAdvanced = () => {
    setShowAdvanced((prev) => {
      const next = !prev
      localStorage.setItem('dhanrakshak_analytics_advanced', String(next))
      return next
    })
  }

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
    if (user) localStorage.setItem(`dhanrakshak_visited_analytics_${user.id}`, 'true')
  }, [user])

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

  const savingsRate =
    summary && summary.total_income > 0
      ? (summary.savings / summary.total_income) * 100
      : 0

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

  // Generate AI insights when financial data is ready — only once the
  // advanced section is actually opened, so users who never look don't
  // burn Gemini quota for a card they'll never see.
  useEffect(() => {
    if (!showAdvanced) return
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
  }, [loading, transactions.length, selectedMonth, showAdvanced])

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

        {/* Core view: trend, breakdown, one tip — enough for most check-ins */}
        <TrendChart
          trendRange={trendRange}
          setTrendRange={setTrendRange}
          trendData={trendData}
          loading={loading}
          hasTransactions={transactions.length > 0}
        />

        <div className="grid gap-6 lg:grid-cols-12">
          <ExpenseBreakdown
            allocationRange={allocationRange}
            setAllocationRange={setAllocationRange}
            summary={summary}
            loading={loading}
          />
          <SmartWealthTips
            loading={loading}
            summary={summary}
            trend={trend}
            savingsRate={savingsRate}
          />
        </div>

        {/* Progressive disclosure toggle */}
        {!loading && (
          <button
            onClick={toggleAdvanced}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border-subtle/50 bg-surface-2/40 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors"
          >
            {showAdvanced ? (
              <>Hide advanced analysis <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Show advanced analysis — health score, AI insights, forecast, anomalies <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        )}

        {showAdvanced && (
          <>
            {/* Executive Diagnostic Summary */}
            {loading ? (
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="h-60 skeleton"><div /></Card>
                <Card className="md:col-span-2 h-60 skeleton"><div /></Card>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                <AdherenceDiagnostic
                  healthScore={healthScore}
                  totalIncome={totalIncome}
                  totalDebit={totalDebit}
                />
                <BudgetVisualizer
                  needsSpent={needsSpent}
                  needsPct={needsPct}
                  wantsSpent={wantsSpent}
                  wantsPct={wantsPct}
                  savingsSpent={savingsSpent}
                  finalSavingsPct={finalSavingsPct}
                  totalIncome={totalIncome}
                  emergencyMonths={emergencyMonths}
                  isEmergencyFundReady={isEmergencyFundReady}
                />
              </div>
            )}

            {/* AI Wealth Advisory + Anomalies + Scenario Simulator */}
            {!loading && (
              <div className="space-y-6">
                <AnomalyAlerts anomalies={anomalies} />

                <div className="grid gap-6 md:grid-cols-2">
                  <AIInsights
                    aiSource={aiSource}
                    aiLoading={aiLoading}
                    aiAlerts={aiAlerts}
                    aiInsights={aiInsights}
                  />
                  <ScenarioSimulator
                    simSalary={simSalary}
                    setSimSalary={setSimSalary}
                    simWants={simWants}
                    setSimWants={setSimWants}
                    totalIncome={totalIncome}
                    wantsSpent={wantsSpent}
                    needsSpent={needsSpent}
                  />
                </div>

                <ForecastPanel forecast={forecast} />
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

