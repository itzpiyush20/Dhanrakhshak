// ============================================
// BudgetsPage — Category Budget Management
// Set monthly limits and monitor spending limits
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/layouts'
import { Card, Button, Input, Select, Badge, EmptyState, ConfirmDialog } from '@/components/ui'
import { getBudgets, upsertBudget, deleteBudget } from '@/services/budgets'
import { getMonthlySummary } from '@/services/transactions'
import { formatCurrency, getCurrentMonth, withTimeout } from '@/utils'
import { CATEGORIES } from '@/constants'
import type { Database } from '@/types/database'
import { useToast, useAuth } from '@/context'

type BudgetRow = Database['public']['Tables']['budgets']['Row']

// Exclude income categories from budget targeting
const BUDGET_ELIGIBLE_CATEGORIES = [
  { key: 'food', label: 'Food & Dining', emoji: '🍔' },
  { key: 'groceries', label: 'Groceries', emoji: '🛒' },
  { key: 'transport', label: 'Transport', emoji: '🚗' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { key: 'utilities', label: 'Utilities & Bills', emoji: '💡' },
  { key: 'rent', label: 'Rent', emoji: '🏠' },
  { key: 'health', label: 'Health', emoji: '🏥' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { key: 'education', label: 'Education', emoji: '📚' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'subscriptions', label: 'Subscriptions', emoji: '🔄' },
  { key: 'other', label: 'Other Expenses', emoji: '📌' },
]

export default function BudgetsPage() {
  const { currencySymbol } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [spentMap, setSpentMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { showToast } = useToast()

  // Form states
  const [category, setCategory] = useState(BUDGET_ELIGIBLE_CATEGORIES[0].key)
  const [amount, setAmount] = useState('')

  const fetchBudgetData = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const [budgetsRes, summaryRes] = await withTimeout(
        Promise.all([
          getBudgets(month),
          getMonthlySummary(month),
        ]),
        45000,
        'Budget data fetch'
      )

      if (budgetsRes.error) throw budgetsRes.error
      if (summaryRes.error) throw summaryRes.error

      setBudgets(budgetsRes.data || [])

      // Map category spent from summary breakdown
      const spent: Record<string, number> = {}
      if (summaryRes.data?.category_breakdown) {
        summaryRes.data.category_breakdown.forEach((item) => {
          spent[item.category] = item.amount
        })
      }
      setSpentMap(spent)
    } catch (err: any) {
      console.error('Error loading budget data:', err)
      setError(err.message || 'Failed to load budgets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'Budgets | Dhanrakshak'
    fetchBudgetData(selectedMonth)
  }, [selectedMonth, fetchBudgetData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!category || !amount || Number(amount) <= 0) return

    setActionLoading(true)
    setError(null)
    try {
      const { error } = await upsertBudget(category, Number(amount), selectedMonth)
      if (error) throw error

      setAmount('')
      showToast('Limit set successfully')
      await fetchBudgetData(selectedMonth)
    } catch (err: any) {
      console.error('Error saving budget:', err)
      setError(err.message || 'Failed to save budget.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setActionLoading(true)
    setError(null)
    try {
      const { error } = await deleteBudget(id)
      if (error) throw error

      await fetchBudgetData(selectedMonth)
    } catch (err: any) {
      console.error('Error deleting budget:', err)
      setError(err.message || 'Failed to delete budget.')
    } finally {
      setActionLoading(false)
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

  // Calculate totals
  const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + (spentMap[b.category] || 0), 0)
  const remainingBudget = totalBudgeted - totalSpent

  const warningBudgets = budgets.filter((b) => {
    const spent = spentMap[b.category] || 0
    return spent >= b.amount * 0.7
  })

  // Under-budget deserves the same visual weight as a warning — an app that
  // only speaks up when you overspend trains people to avoid opening it.
  const isCurrentMonth = selectedMonth === getCurrentMonth()
  const allOnTrack = budgets.length > 0 && warningBudgets.length === 0

  // Loss-framed pace projection: "at this rate, you'll end the month over
  // budget" lands harder mid-month than a static percentage-used bar.
  const today = new Date()
  const [selYear, selMon] = selectedMonth.split('-').map(Number)
  const daysInSelectedMonth = new Date(selYear, selMon, 0).getDate()
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInSelectedMonth
  const projectPace = (spent: number) =>
    daysElapsed > 0 ? (spent / daysElapsed) * daysInSelectedMonth : spent

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header Section */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Budget Limits</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Establish monthly limits per category and monitor your limits.
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
          <div className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-sm text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        {/* Positive reinforcement — same visual weight as the warning banner
            below, shown only when every budget is genuinely on track. */}
        {allOnTrack && (
          <div className="rounded-2xl border p-4 text-xs font-semibold leading-relaxed flex items-center gap-3 animate-fade-in bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)] text-[var(--status-positive-text)]">
            <span className="text-base select-none">✅</span>
            <span>
              Nice — all {budgets.length} budget{budgets.length === 1 ? '' : 's'} on track this month, {formatCurrency(remainingBudget)} left overall.
            </span>
          </div>
        )}

        {/* Dynamic Budget Warnings / Exceeded Banners */}
        {warningBudgets.length > 0 && (
          <div className="space-y-2">
            {warningBudgets.map((b) => {
              const spent = spentMap[b.category] || 0
              const isExceeded = spent >= b.amount
              const cat = CATEGORIES[b.category as keyof typeof CATEGORIES] || CATEGORIES.other
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl border p-4 text-xs font-semibold leading-relaxed flex items-center gap-3 animate-fade-in ${
                    isExceeded
                      ? 'bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]'
                      : 'bg-[var(--status-warning-subtle)] border-[var(--status-warning-border)] text-[var(--status-warning-text)]'
                  }`}
                >
                  <span className="text-base select-none">{isExceeded ? '⚠️' : '🔔'}</span>
                  <span>
                    {isExceeded
                      ? `Budget Exceeded: Your expenses in ${cat.emoji} ${cat.label} (${formatCurrency(spent)}) have exceeded your established limit of ${formatCurrency(b.amount)}!`
                      : `Budget Limit Reached: Your expenses in ${cat.emoji} ${cat.label} (${formatCurrency(spent)}) have reached ${Math.round((spent / b.amount) * 100)}% of your established limit of ${formatCurrency(b.amount)}.`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Budget summary metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Total Budgeted
            </p>
            <p className="mt-1.5 text-2xl font-bold text-white">
              {formatCurrency(totalBudgeted)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Sum of active limit caps</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-medium">
              Spent in Budgeted
            </p>
            <p className="mt-1.5 text-2xl font-bold text-[var(--status-warning-text)]">
              {formatCurrency(totalSpent)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Expenses in budgeted categories</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Remaining Balance
            </p>
            <p
              className={`mt-1.5 text-2xl font-bold ${
                remainingBudget >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'
              }`}
            >
              {formatCurrency(remainingBudget)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {remainingBudget >= 0 ? 'Within budget limit' : 'Limit exceeded!'}
            </p>
          </Card>
        </div>

        {/* Layout details split */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left column: budgets list */}
          <Card className="lg:col-span-8 flex flex-col h-auto">
            <h2 className="text-lg font-bold text-white mb-6">Limits Overview</h2>

            <div className="flex-1 flex flex-col justify-center">
              {loading ? (
                // Skeletons
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between">
                        <div className="skeleton h-4 w-1/3" />
                        <div className="skeleton h-4 w-20" />
                      </div>
                      <div className="skeleton h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : budgets.length === 0 ? (
                <EmptyState
                  icon="🛡️"
                  title="No limits set"
                  description="Establish spending targets to keep your personal wealth secure."
                />
              ) : (
                <div className="space-y-6">
                  {budgets.map((budget, idx) => {
                    const cat =
                      CATEGORIES[budget.category as keyof typeof CATEGORIES] || CATEGORIES.other
                    const spent = spentMap[budget.category] || 0
                    const remaining = budget.amount - spent
                    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0

                    // Dynamic colors for safety status
                    let progressColor = cat.color
                    if (pct >= 90) {
                      progressColor = '#ef4444' // Red alert
                    } else if (pct >= 70) {
                      progressColor = '#f59e0b' // Amber caution
                    }

                    return (
                      <div
                        key={budget.id}
                        className="space-y-2 border-b border-border-subtle/50 pb-5 last:border-0 last:pb-0 animate-slide-up"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        {/* Upper row: Emoji + Category details */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                              style={{ backgroundColor: `${cat.color}15` }}
                            >
                              {cat.emoji}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-zinc-200">
                                  {cat.label}
                                </h3>
                                {pct >= 100 ? (
                                  <Badge variant="danger">Exceeded</Badge>
                                ) : pct >= 70 ? (
                                  <Badge variant="warning">Warning</Badge>
                                ) : (
                                  <Badge variant="success">Safe</Badge>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                Limit: <span className="text-zinc-400 font-medium">{formatCurrency(budget.amount)}</span>
                              </p>
                            </div>
                          </div>

                          {/* Spent & delete action */}
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-bold text-zinc-200">
                                {formatCurrency(spent)} <span className="text-xs font-normal text-zinc-500">spent</span>
                              </p>
                              <p
                                className={`text-xs mt-0.5 font-medium ${
                                  remaining >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'
                                }`}
                              >
                                {remaining >= 0
                                  ? `${formatCurrency(remaining)} remaining`
                                  : `${formatCurrency(Math.abs(remaining))} overspent!`}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-zinc-500 hover:text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)] h-8 w-8 p-0"
                              onClick={() => setConfirmDeleteId(budget.id)}
                              disabled={actionLoading}
                              title="Delete budget"
                            >
                              🗑️
                            </Button>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative">
                          <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${pct < 70 ? 'aurora-progress-fill' : ''}`}
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                ...(pct >= 70 ? { backgroundColor: progressColor } : {}),
                              }}
                            />
                          </div>
                        </div>

                        {/* Pace projection — only meaningful mid-month, and
                            only useful before the limit's already blown. */}
                        {isCurrentMonth && pct < 100 && (() => {
                          const projected = projectPace(spent)
                          const projectedOver = projected - budget.amount
                          if (projectedOver <= 0) return null
                          return (
                            <p className="text-[11px] text-[var(--status-warning-text)] font-medium flex items-center gap-1">
                              <span aria-hidden="true">📉</span>
                              At this pace, ends the month {formatCurrency(projectedOver)} over budget.
                            </p>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Right column: Form to add/update */}
          <Card className="lg:col-span-4 self-start">
            <h2 className="text-lg font-bold text-white mb-6">Set Limit Target</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Category Target
                </label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={actionLoading}
                  required
                >
                  {BUDGET_ELIGIBLE_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Limit Amount ({currencySymbol})
                </label>
                <Input
                  type="number"
                  placeholder="5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={actionLoading}
                  min="1"
                  required
                />
              </div>

              <Button type="submit" block loading={actionLoading} disabled={actionLoading}>
                Set Limit
              </Button>
            </form>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId) await handleDelete(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
        title="Remove budget limit"
        message="This category will no longer have a monthly limit. You can set a new one anytime."
        confirmLabel="Remove"
      />
    </AppLayout>
  )
}
