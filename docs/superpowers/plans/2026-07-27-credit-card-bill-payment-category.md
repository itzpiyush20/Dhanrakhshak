# Credit Card Bill Payment Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Credit Card Bill Payment" category that's fully excluded from every expense total in the app (to avoid double-booking spend already counted when the underlying purchases happened), with its own dedicated monthly trend chart on the Analytics page.

**Architecture:** The category itself is a pure TypeScript addition (the `transactions.category` DB column has no CHECK constraint, so no migration is needed). Two shared service functions (`getMonthlySummary`, `getHistoricalAnalytics`) get an explicit exclusion filter, since they're the source of Dashboard/Budgets totals. The Analytics page computes its own totals locally from a single fetched array — rather than patching every internal loop of its several aggregation functions, we derive one filtered array once and route all total/trend/anomaly/forecast computations through it, while the new chart reads the complementary (category-only) subset.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-credit-card-bill-payment-category-design.md`

---

## Testing scope note

`src/pages/AnalyticsPage.tsx`, `src/pages/ExpensesPage.tsx`, and `src/pages/DashboardPage.tsx` have zero existing automated test coverage (confirmed — no test files exist for any of them). Tasks touching those files rely on careful self-review and an explicit manual verification step, not silently skipped. `src/services/transactions.ts` DOES have existing test coverage (`transactions.test.ts`), so tasks touching it follow TDD with real tests, matching that file's established pattern.

---

### Task 1: Add the category to types and constants

**Files:**
- Modify: `src/types/index.ts:27-46`
- Modify: `src/constants/index.ts:8-28`

No test — this mirrors how every other category (e.g. `insurance`) was added: a pure type/constant addition with no dedicated test.

- [ ] **Step 1: Add to the `ExpenseCategory` union type**

Find (currently lines 27-46):

```typescript
export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'utilities'
  | 'rent'
  | 'health'
  | 'entertainment'
  | 'education'
  | 'travel'
  | 'subscriptions'
  | 'insurance'
  | 'transfers'
  | 'salary'
  | 'freelance'
  | 'investments'
  | 'refund'
  | 'cashback'
  | 'other'
```

Add the new member right after `'insurance'`:

```typescript
export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'utilities'
  | 'rent'
  | 'health'
  | 'entertainment'
  | 'education'
  | 'travel'
  | 'subscriptions'
  | 'insurance'
  | 'credit_card_bill_payment'
  | 'transfers'
  | 'salary'
  | 'freelance'
  | 'investments'
  | 'refund'
  | 'cashback'
  | 'other'
```

- [ ] **Step 2: Add to the `CATEGORIES` constant**

Find (currently lines 8-28):

```typescript
export const CATEGORIES: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  food:           { label: 'Food & Dining',    emoji: '🍔', color: '#f97316' },
  groceries:      { label: 'Groceries',        emoji: '🛒', color: '#84cc16' },
  transport:      { label: 'Transport',         emoji: '🚗', color: '#3b82f6' },
  shopping:       { label: 'Shopping',          emoji: '🛍️', color: '#ec4899' },
  utilities:      { label: 'Utilities & Bills', emoji: '💡', color: '#eab308' },
  rent:           { label: 'Rent',              emoji: '🏠', color: '#8b5cf6' },
  health:         { label: 'Health',            emoji: '🏥', color: '#ef4444' },
  entertainment:  { label: 'Entertainment',     emoji: '🎬', color: '#f43f5e' },
  education:      { label: 'Education',         emoji: '📚', color: '#06b6d4' },
  travel:         { label: 'Travel',            emoji: '✈️', color: '#14b8a6' },
  subscriptions:  { label: 'Subscriptions',     emoji: '🔄', color: '#a855f7' },
  insurance:      { label: 'Insurance',         emoji: '🛡️', color: '#0891b2' },
  transfers:      { label: 'Transfers',         emoji: '🔁', color: '#6b7280' },
  salary:         { label: 'Salary',            emoji: '💰', color: '#10b981' },
  freelance:      { label: 'Freelance',         emoji: '💻', color: '#0ea5e9' },
  investments:    { label: 'Investments',        emoji: '📈', color: '#22c55e' },
  refund:         { label: 'Refund',            emoji: '↩️', color: '#64748b' },
  cashback:       { label: 'Cashback',          emoji: '🎁', color: '#f59e0b' },
  other:          { label: 'Other',             emoji: '📌', color: '#94a3b8' },
}
```

Add the new entry right after `insurance`:

```typescript
export const CATEGORIES: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  food:           { label: 'Food & Dining',    emoji: '🍔', color: '#f97316' },
  groceries:      { label: 'Groceries',        emoji: '🛒', color: '#84cc16' },
  transport:      { label: 'Transport',         emoji: '🚗', color: '#3b82f6' },
  shopping:       { label: 'Shopping',          emoji: '🛍️', color: '#ec4899' },
  utilities:      { label: 'Utilities & Bills', emoji: '💡', color: '#eab308' },
  rent:           { label: 'Rent',              emoji: '🏠', color: '#8b5cf6' },
  health:         { label: 'Health',            emoji: '🏥', color: '#ef4444' },
  entertainment:  { label: 'Entertainment',     emoji: '🎬', color: '#f43f5e' },
  education:      { label: 'Education',         emoji: '📚', color: '#06b6d4' },
  travel:         { label: 'Travel',            emoji: '✈️', color: '#14b8a6' },
  subscriptions:  { label: 'Subscriptions',     emoji: '🔄', color: '#a855f7' },
  insurance:      { label: 'Insurance',         emoji: '🛡️', color: '#0891b2' },
  credit_card_bill_payment: { label: 'Credit Card Bill Payment', emoji: '💳', color: '#475569' },
  transfers:      { label: 'Transfers',         emoji: '🔁', color: '#6b7280' },
  salary:         { label: 'Salary',            emoji: '💰', color: '#10b981' },
  freelance:      { label: 'Freelance',         emoji: '💻', color: '#0ea5e9' },
  investments:    { label: 'Investments',        emoji: '📈', color: '#22c55e' },
  refund:         { label: 'Refund',            emoji: '↩️', color: '#64748b' },
  cashback:       { label: 'Cashback',          emoji: '🎁', color: '#f59e0b' },
  other:          { label: 'Other',             emoji: '📌', color: '#94a3b8' },
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/constants/index.ts
git commit -m "feat: add Credit Card Bill Payment category"
```

---

### Task 2: Exclude from `getMonthlySummary`

**Files:**
- Modify: `src/services/transactions.ts:97-150`
- Test: `src/services/transactions.test.ts`

`getMonthlySummary` is used by both `DashboardPage.tsx` and `BudgetsPage.tsx` — fixing it here fixes both call sites' totals automatically.

- [ ] **Step 1: Write the failing test**

Add to `src/services/transactions.test.ts`, after the existing `import` line (`import { getLoggingStreak, getActiveReceivables, settleReceivable } from './transactions'`), change it to also import `getMonthlySummary`:

```typescript
import { getLoggingStreak, getActiveReceivables, settleReceivable, getMonthlySummary } from './transactions'
```

Then add a new `describe` block anywhere after the existing ones (e.g. at the end of the file):

```typescript
describe('getMonthlySummary', () => {
  it('excludes credit_card_bill_payment transactions from total_expenses and the category breakdown', async () => {
    mockQueryResult.mockResolvedValue({
      data: [
        { amount: 500, type: 'debit', category: 'food' },
        { amount: 15000, type: 'debit', category: 'credit_card_bill_payment' },
        { amount: 2000, type: 'credit', category: 'salary' },
      ],
      error: null,
    })
    const { data } = await getMonthlySummary('2026-07')
    expect(data!.total_expenses).toBe(500)
    expect(data!.category_breakdown.find((c) => c.category === 'credit_card_bill_payment')).toBeUndefined()
  })

  it('still totals ordinary debit transactions when there is no credit card bill payment', async () => {
    mockQueryResult.mockResolvedValue({
      data: [
        { amount: 300, type: 'debit', category: 'food' },
        { amount: 200, type: 'debit', category: 'transport' },
      ],
      error: null,
    })
    const { data } = await getMonthlySummary('2026-07')
    expect(data!.total_expenses).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/transactions.test.ts -t "getMonthlySummary"`
Expected: FAIL — the first test's `total_expenses` currently comes back as `15500` (500 + 15000), not `500`, since nothing excludes the new category yet.

- [ ] **Step 3: Add the exclusion**

Find (currently lines 97-150):

```typescript
/** Get monthly summary (income, expenses, savings) */
export async function getMonthlySummary(month: string) {
  const startDate = `${month}-01`
  const [year, mon] = month.split('-').map(Number)
  const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('approval_status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate)

  if (error || !data) return { data: null, error }

  const total_income = data
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const total_expenses = data
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  // Category breakdown for debits
  const categoryMap = new Map<string, { amount: number; count: number }>()
  data
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
    data: {
      total_income,
      total_expenses,
      savings: total_income - total_expenses,
      category_breakdown,
    },
    error: null,
  }
}
```

Change to: filter debit transactions to exclude `credit_card_bill_payment` once, and reuse that filtered list for both the total and the breakdown.

```typescript
/** Get monthly summary (income, expenses, savings) */
export async function getMonthlySummary(month: string) {
  const startDate = `${month}-01`
  const [year, mon] = month.split('-').map(Number)
  const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('approval_status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate)

  if (error || !data) return { data: null, error }

  const total_income = data
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  // Credit card bill payments are excluded from all expense totals — the
  // purchases they cover were already counted as expenses when they happened,
  // so counting the bill payment too would double-book that spend.
  const expenseTxns = data.filter((t) => t.type === 'debit' && t.category !== 'credit_card_bill_payment')

  const total_expenses = expenseTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  // Category breakdown for debits
  const categoryMap = new Map<string, { amount: number; count: number }>()
  expenseTxns.forEach((t) => {
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
    data: {
      total_income,
      total_expenses,
      savings: total_income - total_expenses,
      category_breakdown,
    },
    error: null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/transactions.test.ts -t "getMonthlySummary"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/transactions.ts src/services/transactions.test.ts
git commit -m "feat: exclude credit card bill payments from monthly summary totals"
```

---

### Task 3: Exclude from `getHistoricalAnalytics`

**Files:**
- Modify: `src/services/transactions.ts:153-206`
- Test: `src/services/transactions.test.ts`

`getHistoricalAnalytics` isn't currently called anywhere in the app (verified: no call sites exist today), but it's an exported function that could be used later — fix it now for correctness and to keep it consistent with `getMonthlySummary`.

- [ ] **Step 1: Write the failing test**

Add to `src/services/transactions.test.ts`, update the import line again:

```typescript
import { getLoggingStreak, getActiveReceivables, settleReceivable, getMonthlySummary, getHistoricalAnalytics } from './transactions'
```

Add a new `describe` block:

```typescript
describe('getHistoricalAnalytics', () => {
  it('excludes credit_card_bill_payment transactions from each month\'s expenses total', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const thisMonth = new Date().toISOString().substring(0, 7)
    mockQueryResult.mockResolvedValue({
      data: [
        { amount: 500, type: 'debit', date: `${thisMonth}-05` },
        { amount: 15000, type: 'debit', date: `${thisMonth}-10`, category: 'credit_card_bill_payment' },
      ],
      error: null,
    })
    const { data } = await getHistoricalAnalytics(1)
    expect(data).toHaveLength(1)
    expect(data![0].expenses).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/transactions.test.ts -t "getHistoricalAnalytics"`
Expected: FAIL — two problems: the query doesn't select `category` at all yet (so `t.category` is `undefined` on every row and the filter can't exclude anything), and the aggregation doesn't check `category` yet. `expenses` currently comes back as `15500`.

- [ ] **Step 3: Add `category` to the query and exclude it from the total**

Find (currently lines 153-206):

```typescript
/** Get historical monthly comparison for the last N months */
export async function getHistoricalAnalytics(monthsCount = 6) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // Generate target months list (e.g. ["2026-05", "2026-04", ...])
  const rawMonths: string[] = []
  const now = new Date()
  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    rawMonths.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const months = rawMonths

  // Get start date of the oldest month in the window
  const startDate = `${months[0]}-01`

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, date')
    .eq('user_id', user.id)
    .eq('approval_status', 'approved')
    .gte('date', startDate)

  if (error || !data) return { data: null, error }

  // Aggregate stats per month
  const monthlyData = months.map((m) => {
    const [year, mon] = m.split('-').map(Number)
    const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('en-IN', {
      month: 'short',
    })

    const monthTxns = data.filter((t) => t.date.startsWith(m))
    
    const income = monthTxns
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const expenses = monthTxns
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    return {
      month: m,
      label: `${monthLabel} ${String(year).substring(2)}`,
      income,
      expenses,
      savings: income - expenses,
    }
  })

  return { data: monthlyData, error: null }
}
```

Change the `.select()` to also fetch `category`, and change the `expenses` calculation to exclude it:

```typescript
/** Get historical monthly comparison for the last N months */
export async function getHistoricalAnalytics(monthsCount = 6) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  // Generate target months list (e.g. ["2026-05", "2026-04", ...])
  const rawMonths: string[] = []
  const now = new Date()
  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    rawMonths.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const months = rawMonths

  // Get start date of the oldest month in the window
  const startDate = `${months[0]}-01`

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, date, category')
    .eq('user_id', user.id)
    .eq('approval_status', 'approved')
    .gte('date', startDate)

  if (error || !data) return { data: null, error }

  // Aggregate stats per month
  const monthlyData = months.map((m) => {
    const [year, mon] = m.split('-').map(Number)
    const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('en-IN', {
      month: 'short',
    })

    const monthTxns = data.filter((t) => t.date.startsWith(m))
    
    const income = monthTxns
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    // Credit card bill payments are excluded — the purchases they cover were
    // already counted as expenses when they happened.
    const expenses = monthTxns
      .filter((t) => t.type === 'debit' && t.category !== 'credit_card_bill_payment')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    return {
      month: m,
      label: `${monthLabel} ${String(year).substring(2)}`,
      income,
      expenses,
      savings: income - expenses,
    }
  })

  return { data: monthlyData, error: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/transactions.test.ts -t "getHistoricalAnalytics"`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests, including the two new ones from Task 2)

- [ ] **Step 6: Commit**

```bash
git add src/services/transactions.ts src/services/transactions.test.ts
git commit -m "feat: exclude credit card bill payments from historical analytics"
```

---

### Task 4: AnalyticsPage — derive one filtered array for all totals

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx`

No automated test (no test infrastructure exists for this page — see "Testing scope note"). Verification is self-review plus the manual check in Step 4.

`AnalyticsPage.tsx` fetches one raw `transactions` array (state, populated at mount) and feeds it into several local aggregation functions: `getTrendData` (→ `trendData`), `getAllocationData` (→ `summary`), `getMoMTrend` (→ `trend`), `detectAnomalies` (→ `anomalies`), `generateForecast` (→ `forecast`), and a direct `.filter()` for the CA Advisory section (`monthlyTxns`/`debitTxns`, which also feeds the AI-insights `FinancialContext.totalExpenses`). Rather than editing every internal loop of `getTrendData` (which has 4 separate date-bucketing branches) and `getAllocationData`, derive one filtered array once and swap every one of these call sites to use it instead of the raw array — a single, low-risk change point that fixes all of them at once.

- [ ] **Step 1: Add the derived filtered array**

Find (currently around lines 351-354):

```typescript
  // 1. Cashflow Analytics Data (memoized to avoid recalculation on every render)
  const trendData = useMemo(() => getTrendData(transactions, range), [transactions, range])
  const summary = useMemo(() => getAllocationData(transactions, range), [transactions, range])
  const trend = useMemo(() => getMoMTrend(transactions), [transactions])
```

Change to add the derived array first, then use it in place of `transactions` in these three lines:

```typescript
  // Credit card bill payments are excluded from every total/trend/breakdown on
  // this page — the purchases they cover were already counted as expenses when
  // they happened, so counting the bill payment too would double-book that
  // spend. The raw `transactions` array is still used, unfiltered, by the new
  // dedicated credit-card-payment trend chart below.
  const expenseTransactions = useMemo(
    () => transactions.filter((t) => t.category !== 'credit_card_bill_payment'),
    [transactions]
  )

  // 1. Cashflow Analytics Data (memoized to avoid recalculation on every render)
  const trendData = useMemo(() => getTrendData(expenseTransactions, range), [expenseTransactions, range])
  const summary = useMemo(() => getAllocationData(expenseTransactions, range), [expenseTransactions, range])
  const trend = useMemo(() => getMoMTrend(expenseTransactions), [expenseTransactions])
```

- [ ] **Step 2: Swap the anomaly detection and forecast call sites**

Find (currently around lines 357-358):

```typescript
  const anomalies = useMemo(() => detectAnomalies(transactions), [transactions])
  const forecast = useMemo(() => generateForecast(transactions), [transactions])
```

Change to:

```typescript
  const anomalies = useMemo(() => detectAnomalies(expenseTransactions), [expenseTransactions])
  const forecast = useMemo(() => generateForecast(expenseTransactions), [expenseTransactions])
```

- [ ] **Step 3: Swap the CA Advisory / Needs-Wants-Savings source**

Find (currently around line 366):

```typescript
  const monthlyTxns = transactions.filter((t) => t.date && t.date.startsWith(selectedMonth))
```

Change to:

```typescript
  const monthlyTxns = expenseTransactions.filter((t) => t.date && t.date.startsWith(selectedMonth))
```

(This automatically fixes `debitTxns`/`totalDebit` and everything downstream of them in this section — the Needs/Wants/Savings 50/30/20 score and the `FinancialContext.totalExpenses` value fed into AI insights — since they're all derived from `monthlyTxns` further down in the same function body, which is unchanged by this task.)

- [ ] **Step 4: Type-check and self-review**

Run: `npx tsc --noEmit -p .`
Expected: PASS

Self-review: grep the file for `transactions` (not `expenseTransactions`) to confirm the only remaining raw uses are: the `useState`/`setTransactions` declaration, the Supabase fetch itself, `transactions.length` (existence checks, e.g. `hasTransactions={transactions.length > 0}` and the loading-guard at the AI-insights effect), and the `totalInvestments`/`subscriptionBurn` computations (these filter for `category === 'investments'`/`'subscriptions'` specifically — mutually exclusive with `credit_card_bill_payment`, so they don't need to change). Confirm no other total/trend/breakdown computation still reads from raw `transactions`.

Manual verification (requires a live account — do what you can, note what's left for a human): create a transaction categorized as "Credit Card Bill Payment" for the current month, reload Analytics, and confirm it does NOT appear in the income/expense trend chart's expense bar, the category breakdown, the Needs/Wants/Savings score, or the AI insights' spending figures.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AnalyticsPage.tsx
git commit -m "feat: exclude credit card bill payments from all Analytics page totals"
```

---

### Task 5: New credit card bill payment trend chart

**Files:**
- Create: `src/pages/analytics/CreditCardPaymentTrend.tsx`
- Modify: `src/pages/analytics/index.ts`
- Modify: `src/pages/AnalyticsPage.tsx`

No automated test (see "Testing scope note"). Verification is self-review plus the manual check in Step 5.

- [ ] **Step 1: Write the new chart component**

This follows the same hand-rolled bar-chart pattern as the existing `TrendChart.tsx` (no charting library in this codebase), but with a single series instead of income/expense/savings.

```typescript
// src/pages/analytics/CreditCardPaymentTrend.tsx
import { Card, EmptyState } from '@/components/ui'
import { formatCurrencyCompact } from '@/utils'
import { CreditCard } from 'lucide-react'

export interface CreditCardPaymentTrendItem {
  label: string
  amount: number
}

interface CreditCardPaymentTrendProps {
  data: CreditCardPaymentTrendItem[]
  loading: boolean
}

export function CreditCardPaymentTrend({ data, loading }: CreditCardPaymentTrendProps) {
  const hasPayments = data.some((d) => d.amount > 0)
  const maxVal = data.length ? Math.max(...data.map((d) => d.amount)) : 0

  return (
    <Card className="flex flex-col min-h-[260px] p-5">
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-brand-400 shrink-0" />
          Credit Card Bill Payments
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Tracked separately from Total Expenses — the purchases behind these
          bills were already counted when they happened.
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-end mt-6">
        {loading ? (
          <div className="flex items-end justify-between gap-6 h-32 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex-1 flex items-end h-full justify-center">
                <div className="skeleton w-6 h-1/2" />
              </div>
            ))}
          </div>
        ) : !hasPayments ? (
          <EmptyState
            icon={<CreditCard className="w-8 h-8 text-zinc-500" />}
            title="No credit card bill payments yet"
            description="Categorize a transaction as Credit Card Bill Payment to see its trend here."
          />
        ) : (
          <div className="overflow-x-auto scrollbar-none w-full pb-2">
            <div className="flex items-end justify-between gap-2.5 sm:gap-6 md:gap-8 h-40 pt-4 relative select-none min-w-[400px] md:min-w-0">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-full border-t border-dashed border-zinc-400 h-0" />
                ))}
              </div>

              {data.map((d, index) => {
                const height = maxVal > 0 ? (d.amount / maxVal) * 100 : 0
                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  >
                    <div className="absolute bottom-full mb-2 bg-zinc-950 border border-zinc-800 text-xs p-2.5 rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 min-w-[110px] text-left">
                      <p className="font-semibold text-zinc-300">{d.label}</p>
                      <p className="text-zinc-400 font-bold">{formatCurrencyCompact(d.amount)}</p>
                    </div>

                    <div className="flex items-end h-full w-full max-w-[64px] justify-center px-1">
                      <div
                        className="w-4 sm:w-6 bg-slate-500/80 rounded-t-md hover:bg-slate-400 transition-all duration-500 ease-out"
                        style={{ height: `${Math.max(3, height)}%` }}
                      />
                    </div>

                    <span className="text-xs text-zinc-500 font-semibold mt-2.5 group-hover:text-zinc-200 transition-colors shrink-0">
                      {d.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default CreditCardPaymentTrend
```

- [ ] **Step 2: Export it from the analytics barrel**

Find `src/pages/analytics/index.ts`:

```typescript
export { default as CategoryIcon } from './CategoryIcon'
export { default as PeriodSelector } from './PeriodSelector'
export { default as AdherenceDiagnostic } from './AdherenceDiagnostic'
export { default as BudgetVisualizer } from './BudgetVisualizer'
export { default as AnomalyAlerts } from './AnomalyAlerts'
export { default as AIInsights } from './AIInsights'
export { default as ScenarioSimulator } from './ScenarioSimulator'
export { default as ForecastPanel } from './ForecastPanel'
export { default as TrendChart } from './TrendChart'
export { default as ExpenseBreakdown } from './ExpenseBreakdown'
export { default as SmartWealthTips } from './SmartWealthTips'
export type { RangeType } from './PeriodSelector'
```

Add the new export:

```typescript
export { default as CategoryIcon } from './CategoryIcon'
export { default as PeriodSelector } from './PeriodSelector'
export { default as AdherenceDiagnostic } from './AdherenceDiagnostic'
export { default as BudgetVisualizer } from './BudgetVisualizer'
export { default as AnomalyAlerts } from './AnomalyAlerts'
export { default as AIInsights } from './AIInsights'
export { default as ScenarioSimulator } from './ScenarioSimulator'
export { default as ForecastPanel } from './ForecastPanel'
export { default as TrendChart } from './TrendChart'
export { default as ExpenseBreakdown } from './ExpenseBreakdown'
export { default as SmartWealthTips } from './SmartWealthTips'
export { default as CreditCardPaymentTrend } from './CreditCardPaymentTrend'
export type { RangeType } from './PeriodSelector'
```

- [ ] **Step 3: Compute the chart's data and render it in `AnalyticsPage.tsx`**

Add the import. Find (currently around lines 20-27):

```typescript
  TrendChart,
  ExpenseBreakdown,
```

(these are two lines inside a larger multi-line import from `'./analytics'` — insert the new name alongside them, matching that block's existing style):

```typescript
  TrendChart,
  ExpenseBreakdown,
  CreditCardPaymentTrend,
```

Add the data computation. Find the `expenseTransactions` derivation added in Task 4 (currently right before the `trendData`/`summary`/`trend` `useMemo`s) and add a new `useMemo` right after it, using the SAME last-6-months month-bucketing approach as `getTrendData`'s `'last-6-months'` branch, but reading from the raw (unfiltered) `transactions` array filtered to ONLY the new category:

```typescript
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
      .filter((t) => t.category === 'credit_card_bill_payment' && t.date)
      .forEach((t) => {
        const tMonth = t.date.substring(0, 7)
        const monthObj = months.find((m) => m.monthKey === tMonth)
        if (monthObj) monthObj.amount += Number(t.amount)
      })

    return months.map(({ label, amount }) => ({ label, amount }))
  }, [transactions])
```

Render the new chart. Find (currently around lines 495-501):

```typescript
        {/* Core view: trend, breakdown, one tip — enough for most check-ins */}
        <TrendChart
          range={range}
          trendData={trendData}
          loading={loading}
          hasTransactions={transactions.length > 0}
        />
```

Add the new chart right after it:

```typescript
        {/* Core view: trend, breakdown, one tip — enough for most check-ins */}
        <TrendChart
          range={range}
          trendData={trendData}
          loading={loading}
          hasTransactions={transactions.length > 0}
        />

        <CreditCardPaymentTrend data={ccBillPaymentTrend} loading={loading} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 5: Self-review and manual verification**

Self-review: confirm `ccBillPaymentTrend` reads from the raw `transactions` array (not `expenseTransactions`) — it needs the category the other computations exclude. Confirm the new chart is placed after `TrendChart` and before the `ExpenseBreakdown`/`SmartWealthTips` grid, matching the "alongside existing charts" placement from the design.

Manual verification (requires a live account): with the same test transaction from Task 4's manual check (categorized as Credit Card Bill Payment), confirm the new "Credit Card Bill Payments" chart shows a bar for the current month with that transaction's amount.

- [ ] **Step 6: Commit**

```bash
git add src/pages/analytics/CreditCardPaymentTrend.tsx src/pages/analytics/index.ts src/pages/AnalyticsPage.tsx
git commit -m "feat: add credit card bill payment trend chart to Analytics page"
```

---

### Task 6: Exclude from Expenses page quick stats

**Files:**
- Modify: `src/pages/ExpensesPage.tsx:88-94`

No automated test (see "Testing scope note").

- [ ] **Step 1: Add the exclusion**

Find (currently lines 88-94):

```typescript
  // Quick stats (from ALL transactions, not filtered)
  const totalIncome = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
```

Change to:

```typescript
  // Quick stats (from ALL transactions, not filtered) — credit card bill
  // payments are excluded from totalExpenses to avoid double-booking spend
  // already counted when the underlying purchases happened.
  const totalIncome = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'debit' && t.category !== 'credit_card_bill_payment')
    .reduce((sum, t) => sum + Number(t.amount), 0)
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Manual verification**

With the test transaction from Task 4, confirm the Expenses page's "Expenses" quick-stat card no longer includes its amount. Confirm the transaction still appears in the transaction list itself (it's excluded from the total, not hidden from the page).

- [ ] **Step 4: Commit**

```bash
git add src/pages/ExpensesPage.tsx
git commit -m "feat: exclude credit card bill payments from Expenses page totals"
```

---

### Task 7: Exclude from Dashboard post-sync summary

**Files:**
- Modify: `src/pages/DashboardPage.tsx:475-482`

No automated test (see "Testing scope note").

- [ ] **Step 1: Add the exclusion**

Find (currently lines 475-482):

```typescript
      const txns = res.data?.transactions || []
      const autoApproved = res.data?.autoApprovedCount || 0
      const categoryTotals = new Map<string, number>()
      txns
        .filter((t: any) => t.type === 'debit')
        .forEach((t: any) => {
          categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + Number(t.amount))
        })
```

Change to:

```typescript
      const txns = res.data?.transactions || []
      const autoApproved = res.data?.autoApprovedCount || 0
      const categoryTotals = new Map<string, number>()
      txns
        .filter((t: any) => t.type === 'debit' && t.category !== 'credit_card_bill_payment')
        .forEach((t: any) => {
          categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + Number(t.amount))
        })
```

(This is the "top category from this sync" summary shown right after a Gmail scan completes — excluding the new category here means a credit card bill payment can never be shown as the "top spending category" of a sync, consistent with it not counting as spend.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: exclude credit card bill payments from Dashboard sync summary"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all existing tests plus the 3 new ones from Tasks 2-3)

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Run the real production build**

Run: `npm run build`
Expected: exit 0, produces `dist/`. This is the actual command Vercel runs — always verify against this, not just `tsc --noEmit` (a prior feature in this codebase shipped a build failure that only the real build command caught).

- [ ] **Step 4: Run the linter on touched files**

Run: `npx eslint src/types/index.ts src/constants/index.ts src/services/transactions.ts src/pages/AnalyticsPage.tsx src/pages/analytics/CreditCardPaymentTrend.tsx src/pages/analytics/index.ts src/pages/ExpensesPage.tsx src/pages/DashboardPage.tsx`
Expected: PASS, or only pre-existing warnings unrelated to these changes (this codebase has pre-existing lint debt — don't chase unrelated errors, only check nothing new was introduced).

- [ ] **Step 5: Full manual walkthrough**

1. Create a transaction (or edit an existing one) and set its category to "Credit Card Bill Payment" via the category dropdown — confirm it appears in the dropdown list (Expenses page edit form, Pending Alerts review, and the auto-categorization confirm modal all render from the same `CATEGORIES` constant, so this single check covers all three).
2. Confirm the transaction is excluded from: Dashboard's total expenses, Expenses page's "Expenses" quick stat, Analytics page's income/expense trend chart, category breakdown, and Needs/Wants/Savings score.
3. Confirm the transaction appears in the new "Credit Card Bill Payments" chart on the Analytics page, in the correct month.
4. Confirm the transaction is NOT hidden from anywhere it should still be visible (the Expenses page transaction list itself, for instance) — it's excluded from totals, not from the app.
