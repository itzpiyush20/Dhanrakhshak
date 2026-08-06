// ============================================
// AnalyticsPage (Insights) — Visual & Advisory Hub
// Merged Insights and CA Advisory dashboard
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { Card, DateFilterPicker } from '@/components/ui'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCategories } from '@/context/CategoriesContext'
import { getCurrentMonth, withTimeout, resolveDateFilter, formatDateFilterLabel, type DateFilter } from '@/utils'
import { toISODateLocal } from '@/utils/dateFilter'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { detectAnomalies, generateForecast, generateAIInsights } from '@/services/aiService'
import type { FinancialContext } from '@/services/aiService'
import { getBudgets } from '@/services/budgets'
import { DrillDownProvider, useDrillDown } from '@/context/DrillDownContext'
import { DrillDownModal } from '@/pages/analytics/DrillDownModal'
import {
  AdherenceDiagnostic,
  BudgetVisualizer,
  AnomalyAlerts,
  AIInsights,
  ScenarioSimulator,
  ForecastPanel,
  TrendChart,
  ExpenseBreakdown,
  CreditCardPaymentTrend,
  SmartWealthTips,
  PeriodSelector,
  MerchantLeaderboard,
  CategoryTrendChart,
  BudgetBurndown,
  type RangeType,
  type MerchantLeaderboardItem,
  type CategoryTrendMonth,
  type BudgetBurndownItem
} from './analytics'

interface TrendItem {
  label: string
  income: number
  expenses: number
  savings: number
  /** Present on day-bucketed ranges (this-week, last-week, last-15-days). */
  dateStr?: string
  /** Present on the last-month range (week buckets). */
  startStr?: string
  endStr?: string
  /** Present on the last-6-months range. */
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
    start.setDate(1)
    start.setMonth(now.getMonth() - 5)
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
      const dateStr = toISODateLocal(temp)
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
      const dateStr = toISODateLocal(temp)
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
        startStr: toISODateLocal(wStart),
        endStr: toISODateLocal(wEnd),
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
  const startStr = toISODateLocal(start)
  const endStr = toISODateLocal(end)
  
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
  const { categories, categoryMap } = useCategories()

  // 50/30/20 buckets — derived from each category's analytics_tags rather
  // than hardcoded display names, so a rename doesn't silently break these.
  const needsCategoryNames = useMemo(
    () => categories.filter((c) => c.analytics_tags?.includes('needs')).map((c) => c.name),
    [categories]
  )
  const wantsCategoryNames = useMemo(
    () => categories.filter((c) => c.analytics_tags?.includes('wants')).map((c) => c.name),
    [categories]
  )
  const savingsCategoryNames = useMemo(
    () => categories.filter((c) => c.analytics_tags?.includes('savings')).map((c) => c.name),
    [categories]
  )
  const hasTag = (categoryName: string, tag: 'income' | 'subscription' | 'credit_card_bill') =>
    categoryMap[categoryName]?.analytics_tags?.includes(tag) ?? false
  const [range, setRange] = useState<RangeType>('this-week')
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
  const [dateFilter, setDateFilter] = useState<DateFilter>({ mode: 'month', month: getCurrentMonth() })
  const [simSalary, setSimSalary] = useState<number>(0)
  const [simWants, setSimWants] = useState<number>(0)

  useEffect(() => {
    if (user) localStorage.setItem(`dhanrakshak_visited_analytics_${user.id}`, 'true')
  }, [user])

  const fetchAllData = useCallback(async () => {
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
            .gte('date', (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return toISODateLocal(d) })())
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
  }, [])

  useEffect(() => {
    document.title = 'Insights | Dhanrakshak'
    fetchAllData()
  }, [fetchAllData])

  // Credit card bill payments are excluded from every total/trend/breakdown on
  // this page — the purchases they cover were already counted as expenses when
  // they happened, so counting the bill payment too would double-book that
  // spend. The raw `transactions` array is still used, unfiltered, by the new
  // dedicated credit-card-payment trend chart added in the next task.
  const expenseTransactions = useMemo(
    () => transactions.filter((t) => !hasTag(t.category, 'credit_card_bill')),
    [transactions, categoryMap]
  )

  const ccBillPaymentTrend = useMemo(() => {
    const months: { monthKey: string; label: string; amount: number }[] = []
    const temp = new Date()
    temp.setDate(1)
    temp.setMonth(temp.getMonth() - 5)
    for (let i = 0; i < 6; i++) {
      const year = temp.getFullYear()
      const mon = temp.getMonth()
      const monthKey = `${year}-${String(mon + 1).padStart(2, '0')}`
      const label = temp.toLocaleDateString('en-IN', { month: 'short' }) + ' ' + String(year).substring(2)
      months.push({ monthKey, label, amount: 0 })
      temp.setMonth(temp.getMonth() + 1)
    }

    transactions
      .filter((t) => hasTag(t.category, 'credit_card_bill') && t.date)
      .forEach((t) => {
        const tMonth = t.date.substring(0, 7)
        const monthObj = months.find((m) => m.monthKey === tMonth)
        if (monthObj) monthObj.amount += Number(t.amount)
      })

    return months.map(({ monthKey, label, amount }) => ({ monthKey, label, amount }))
  }, [transactions, categoryMap])

  // Top merchants by spend for the selected range — falls back to the raw
  // description when a transaction has no merchant name so nothing gets
  // silently dropped from the ranking.
  const merchantLeaderboard = useMemo<MerchantLeaderboardItem[]>(() => {
    const { start, end } = getRangeDates(range)
    const startStr = toISODateLocal(start)
    const endStr = toISODateLocal(end)

    const merchantMap = new Map<string, { amount: number; count: number }>()
    expenseTransactions
      .filter((t) => t.type === 'debit' && t.date && t.date >= startStr && t.date <= endStr)
      .forEach((t) => {
        const merchant = (t.merchant && t.merchant.trim()) || (t.description && t.description.trim()) || 'Unknown'
        const existing = merchantMap.get(merchant) || { amount: 0, count: 0 }
        merchantMap.set(merchant, { amount: existing.amount + Number(t.amount), count: existing.count + 1 })
      })

    return Array.from(merchantMap.entries())
      .map(([merchant, { amount, count }]) => ({ merchant, amount, count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
  }, [expenseTransactions, range])

  // Top-5 category spend per month over the trailing 6 months — independent
  // of the range selector, since the point is to see the multi-month shape.
  const categoryTrendData = useMemo<CategoryTrendMonth[]>(() => {
    const monthKeys: string[] = []
    const monthMeta = new Map<string, { label: string; catTotals: Map<string, number> }>()
    const temp = new Date()
    temp.setDate(1)
    temp.setMonth(temp.getMonth() - 5)
    for (let i = 0; i < 6; i++) {
      const year = temp.getFullYear()
      const mon = temp.getMonth()
      const monthKey = `${year}-${String(mon + 1).padStart(2, '0')}`
      const label = temp.toLocaleDateString('en-IN', { month: 'short' }) + ' ' + String(year).substring(2)
      monthKeys.push(monthKey)
      monthMeta.set(monthKey, { label, catTotals: new Map() })
      temp.setMonth(temp.getMonth() + 1)
    }

    expenseTransactions.forEach((t) => {
      if (t.type !== 'debit' || !t.date) return
      const bucket = monthMeta.get(t.date.substring(0, 7))
      if (!bucket) return
      bucket.catTotals.set(t.category, (bucket.catTotals.get(t.category) || 0) + Number(t.amount))
    })

    const overallTotals = new Map<string, number>()
    monthMeta.forEach(({ catTotals }) => {
      catTotals.forEach((amt, cat) => overallTotals.set(cat, (overallTotals.get(cat) || 0) + amt))
    })
    const topCategories = Array.from(overallTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat)

    return monthKeys.map((monthKey) => {
      const { label, catTotals } = monthMeta.get(monthKey)!
      const segments = topCategories.map((category) => ({ category, amount: catTotals.get(category) || 0 }))
      const topSum = segments.reduce((sum, s) => sum + s.amount, 0)
      const total = Array.from(catTotals.values()).reduce((sum, v) => sum + v, 0)
      const otherAmount = total - topSum
      if (otherAmount > 0.01) segments.push({ category: '__other__', amount: otherAmount })
      return { monthKey, label, total, segments }
    })
  }, [expenseTransactions])

  // 1. Cashflow Analytics Data (memoized to avoid recalculation on every render)
  const trendData = useMemo(() => getTrendData(expenseTransactions, range), [expenseTransactions, range])
  const summary = useMemo(() => getAllocationData(expenseTransactions, range), [expenseTransactions, range])
  const trend = useMemo(() => getMoMTrend(expenseTransactions), [expenseTransactions])

  // 2. Anomaly detection & forecasting (memoized)
  const anomalies = useMemo(() => detectAnomalies(expenseTransactions), [expenseTransactions])
  const forecast = useMemo(() => generateForecast(expenseTransactions), [expenseTransactions])

  const savingsRate =
    summary && summary.total_income > 0
      ? (summary.savings / summary.total_income) * 100
      : 0

  // Budgets for the burn-down chart — fetched separately since the summary
  // query above doesn't carry limit amounts, only actuals.
  const [budgets, setBudgets] = useState<Array<{ category: string; amount: number }>>([])
  useEffect(() => {
    let cancelled = false
    const targetMonth = dateFilter.mode === 'month' ? dateFilter.month : resolveDateFilter(dateFilter).dateTo.slice(0, 7)
    getBudgets(targetMonth).then(({ data }) => {
      if (!cancelled) setBudgets((data || []).map((b) => ({ category: b.category, amount: Number(b.amount) })))
    })
    return () => { cancelled = true }
  }, [dateFilter])

  // 2. CA Advisory Computations
  const { dateFrom: advisoryFrom, dateTo: advisoryTo } = resolveDateFilter(dateFilter)
  const monthlyTxns = expenseTransactions.filter((t) => t.date && t.date >= advisoryFrom && t.date <= advisoryTo)

  // Budget burn-down — cumulative actual spend per budgeted category against
  // an even daily pace, projected forward at the current run-rate.
  const budgetBurndownData = useMemo<BudgetBurndownItem[]>(() => {
    if (budgets.length === 0) return []

    const targetMonth = dateFilter.mode === 'month' ? dateFilter.month : resolveDateFilter(dateFilter).dateTo.slice(0, 7)
    const [y, m] = targetMonth.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const isCurrentMonth = targetMonth === getCurrentMonth()
    const daysElapsed = isCurrentMonth ? Math.min(new Date().getDate(), daysInMonth) : daysInMonth

    return budgets
      .filter((b) => b.amount > 0)
      .map((b) => {
        const dailyTotals = new Array(daysInMonth).fill(0)
        monthlyTxns
          .filter((t) => t.type === 'debit' && t.category === b.category && t.date)
          .forEach((t) => {
            const day = Number(t.date.slice(8, 10))
            if (day >= 1 && day <= daysInMonth) dailyTotals[day - 1] += Number(t.amount)
          })

        const cumulative: number[] = []
        let running = 0
        dailyTotals.forEach((v) => {
          running += v
          cumulative.push(running)
        })

        const spentSoFar = cumulative[daysElapsed - 1] ?? running
        const dailyPace = daysElapsed > 0 ? spentSoFar / daysElapsed : 0
        const projectedTotal = dailyPace * daysInMonth
        const projectedOverBy = projectedTotal - b.amount

        let projectedOverDate: string | null = null
        if (dailyPace > 0 && projectedOverBy > 0) {
          const dayOfOvershoot = Math.min(daysInMonth, Math.ceil(b.amount / dailyPace))
          const d = new Date(y, m - 1, dayOfOvershoot)
          projectedOverDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        }

        return {
          category: b.category,
          budgetAmount: b.amount,
          cumulative,
          daysInMonth,
          daysElapsed,
          spentSoFar,
          projectedTotal,
          projectedOverBy,
          projectedOverDate,
        }
      })
      .sort((a, b) => b.spentSoFar / b.budgetAmount - a.spentSoFar / a.budgetAmount)
  }, [budgets, monthlyTxns, dateFilter])

  const incomeTxns = monthlyTxns.filter((t) => t.type === 'credit' && hasTag(t.category, 'income'))
  const totalIncome = incomeTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  const debitTxns = monthlyTxns.filter((t) => t.type === 'debit')
  const totalDebit = debitTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  const needsSpent = debitTxns
    .filter((t) => needsCategoryNames.includes(t.category))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const wantsSpent = debitTxns
    .filter((t) => wantsCategoryNames.includes(t.category))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const savingsSpent = debitTxns
    .filter((t) => savingsCategoryNames.includes(t.category))
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
    .filter((t) => savingsCategoryNames.includes(t.category))
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
      month: dateFilter.mode === 'month' ? dateFilter.month : formatDateFilterLabel(dateFilter),
      totalIncome,
      totalExpenses: totalDebit,
      savings: totalIncome - totalDebit,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalDebit) / totalIncome) * 100 : 0,
      needsPct,
      wantsPct,
      savingsPct: finalSavingsPct,
      healthScore,
      topCategory: summary?.category_breakdown?.[0]?.category || 'Other',
      topCategoryAmount: summary?.category_breakdown?.[0]?.amount || 0,
      topCategoryPct: summary?.category_breakdown?.[0]?.percentage || 0,
      momTrend: trend,
      subscriptionBurn: transactions
        .filter((t) => hasTag(t.category, 'subscription') && t.type === 'debit')
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
  }, [loading, transactions.length, dateFilter, showAdvanced, categoryMap])

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Unified Main Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 bg-surface-2/10 border border-border-subtle/10 rounded-2xl backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Insights</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Understand where your money went this period and whether your spending split is healthy.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0 bg-surface-2/40 border border-border-subtle/30 rounded-xl px-3 py-2">
            <span className="text-xs text-zinc-500">Range:</span>
            <PeriodSelector value={range} onChange={setRange} id="insights-range" />
          </div>
        </div>

        <Link
          to="/budgets"
          className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle/40 bg-surface-2/30 px-4 py-2.5 text-xs text-zinc-400 hover:bg-surface-2/60 hover:text-zinc-200 transition-colors"
        >
          <span>Want spending limits with overspend alerts instead?</span>
          <span className="font-semibold text-brand-400 shrink-0">Budgets →</span>
        </Link>

        {error && (
          <div className="rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-xs text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        {/* Core view: trend, breakdown, one tip — enough for most check-ins */}
        <TrendChart
          range={range}
          trendData={trendData}
          loading={loading}
          hasTransactions={transactions.length > 0}
        />

        <CreditCardPaymentTrend data={ccBillPaymentTrend} loading={loading} />

        <DrillDownProvider onDirtyClose={fetchAllData}>
          <div className="grid gap-6 lg:grid-cols-12">
            <ExpenseBreakdownWithDrillDown summary={summary} loading={loading} range={range} />
            <SmartWealthTips
              loading={loading}
              summary={summary}
              trend={trend}
              savingsRate={savingsRate}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <CategoryTrendChartWithDrillDown data={categoryTrendData} loading={loading} hasTransactions={transactions.length > 0} />
            <MerchantLeaderboard
              data={merchantLeaderboard}
              loading={loading}
            />
          </div>

          <DrillDownModal transactions={transactions} />
        </DrillDownProvider>

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
            <div className="flex items-center justify-end gap-2 -mt-2">
              <span className="text-xs text-zinc-500">Advisory period:</span>
              <DateFilterPicker value={dateFilter} onChange={setDateFilter} />
            </div>

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

            {!loading && (
              <BudgetBurndown data={budgetBurndownData} loading={loading} />
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

function ExpenseBreakdownWithDrillDown({ summary, loading, range }: { summary: SummaryData | null; loading: boolean; range: RangeType }) {
  const { openDrillDown } = useDrillDown()
  return (
    <ExpenseBreakdown
      summary={summary}
      loading={loading}
      onCategoryClick={(category) => {
        const { start, end } = getRangeDates(range)
        openDrillDown(
          { category, dateFrom: toISODateLocal(start), dateTo: toISODateLocal(end) },
          category
        )
      }}
    />
  )
}

function CategoryTrendChartWithDrillDown({ data, loading, hasTransactions }: { data: CategoryTrendMonth[]; loading: boolean; hasTransactions: boolean }) {
  const { openDrillDown } = useDrillDown()
  return (
    <CategoryTrendChart
      data={data}
      loading={loading}
      hasTransactions={hasTransactions}
      onSegmentClick={(category, monthKey) => {
        const monthLabel = data.find((m) => m.monthKey === monthKey)?.label ?? monthKey
        openDrillDown({ category, month: monthKey }, `${category} — ${monthLabel}`)
      }}
    />
  )
}

