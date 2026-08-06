# Chart Drill-Down Phase 2 (Remaining Charts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the drill-down pattern built in Phase 1 (`docs/superpowers/plans/2026-08-06-chart-drilldown-inline-edit.md`) to every remaining transaction-backed chart on Analytics: Trend Chart, Credit Card Payment Trend, Merchant Leaderboard, Anomaly Alerts, Budget Burndown, Budget Visualizer, and Adherence Diagnostic.

**Architecture:** Same `openDrillDown(filter, label)` mechanism as Phase 1 — no new overlay, no new context. Two additions to `DrillDownFilter` are needed because these charts aren't all single-category: `merchant` (Merchant Leaderboard drills by merchant, not category) and `categories: string[]` match-any (Budget Visualizer's Needs/Wants/Savings buckets each span several categories via the existing `analytics_tags` system). Two charts (Trend Chart, Credit Card Payment Trend) already compute the date range each bar represents at runtime — it's just not exposed through their TypeScript types today — so those tasks widen a type rather than add new computation. Adherence Diagnostic has no per-segment breakdown at all (it's a single health-score gauge), so its "drill-down" is the whole card opening every transaction in the active period, unfiltered — the coarsest form the pattern supports, and a deliberate choice (not a gap) confirmed with the user before writing this plan.

The existing `DrillDownProvider` boundary in `AnalyticsPage.tsx` (added in Phase 1) currently wraps only two of the ten-plus chart sections on the page — Trend Chart, Credit Card Payment Trend, and the entire "advanced analysis" section (Adherence Diagnostic, Budget Visualizer, Budget Burndown, Anomaly Alerts) all render outside it today. This plan widens that boundary to cover the whole chart area, which is what makes "reusable for every chart" from the original spec actually true.

**Tech Stack:** React (Context API), TypeScript, Vitest (pure-function unit tests — same constraint as Phase 1: no component-rendering test infra in this project, so chart-click wiring is verified manually).

---

### Task 1: Extend `DrillDownFilter` — `merchant` and `categories` (match-any)

**Files:**
- Modify: `src/context/DrillDownContext.tsx`
- Modify: `src/context/DrillDownContext.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/context/DrillDownContext.test.ts`, inside the existing `describe('filterTransactionsForDrillDown', ...)` block (add these as new `it(...)` cases alongside the existing ones — do not create a new describe block):

```typescript
  it('filters by merchant', () => {
    const merchantTxns = [
      { id: '1', category: 'Food & Dining', date: '2026-08-01', merchant: 'Zomato' },
      { id: '2', category: 'Food & Dining', date: '2026-08-02', merchant: 'Swiggy' },
      { id: '3', category: 'Shopping', date: '2026-08-03', merchant: 'Zomato' },
    ]
    const result = filterTransactionsForDrillDown(merchantTxns, { merchant: 'Zomato' })
    expect(result.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('filters by categories (match-any) combined with a date range', () => {
    const catTxns = [
      { id: '1', category: 'Groceries', date: '2026-08-05' },
      { id: '2', category: 'Rent', date: '2026-08-05' },
      { id: '3', category: 'Shopping', date: '2026-08-05' },
      { id: '4', category: 'Groceries', date: '2026-07-01' },
    ]
    const result = filterTransactionsForDrillDown(catTxns, {
      categories: ['Groceries', 'Rent'],
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })
    expect(result.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('categories takes precedence over a single category field if both are somehow set', () => {
    const catTxns = [
      { id: '1', category: 'Groceries', date: '2026-08-05' },
      { id: '2', category: 'Rent', date: '2026-08-05' },
    ]
    const result = filterTransactionsForDrillDown(catTxns, { category: 'Groceries', categories: ['Rent'] })
    expect(result.map((t) => t.id)).toEqual(['2'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/context/DrillDownContext.test.ts`
Expected: FAIL — `filterTransactionsForDrillDown` doesn't yet filter by `merchant` or `categories`, and the test's transaction objects don't type-check against a filter function that doesn't accept those fields yet (TypeScript error at test-collection time, surfaced by vitest as a failure).

- [ ] **Step 3: Extend the type and the filter function**

In `src/context/DrillDownContext.tsx`, find:

```typescript
export interface DrillDownFilter {
  category?: string
  type?: 'debit' | 'credit'
  /** YYYY-MM-DD. Takes precedence over `month` when both are set — matches getTransactions()'s own precedence in src/services/transactions.ts. */
  dateFrom?: string
  /** YYYY-MM-DD */
  dateTo?: string
  /** YYYY-MM — ignored if dateFrom/dateTo are given */
  month?: string
}

/** Pure filter matcher, shared by any drill-down-capable chart. Matches on category (if given), then either an explicit date range or a month prefix (if given) — never both. */
export function filterTransactionsForDrillDown<T extends { category: string; date: string }>(
  transactions: T[],
  filter: DrillDownFilter
): T[] {
  return transactions.filter((t) => {
    if (filter.category && t.category !== filter.category) return false
    if (filter.dateFrom || filter.dateTo) {
      if (filter.dateFrom && t.date < filter.dateFrom) return false
      if (filter.dateTo && t.date > filter.dateTo) return false
    } else if (filter.month) {
      if (t.date.substring(0, 7) !== filter.month) return false
    }
    return true
  })
}
```

Replace with:

```typescript
export interface DrillDownFilter {
  category?: string
  /** Match any category in this list instead of a single one — e.g. Budget Visualizer's "Needs" bucket spans several categories via the analytics_tags system. Takes precedence over `category` if both happen to be set. */
  categories?: string[]
  /** Match on merchant instead of/in addition to category — e.g. Merchant Leaderboard drills by merchant. */
  merchant?: string
  type?: 'debit' | 'credit'
  /** YYYY-MM-DD. Takes precedence over `month` when both are set — matches getTransactions()'s own precedence in src/services/transactions.ts. */
  dateFrom?: string
  /** YYYY-MM-DD */
  dateTo?: string
  /** YYYY-MM — ignored if dateFrom/dateTo are given */
  month?: string
}

/** Pure filter matcher, shared by any drill-down-capable chart. */
export function filterTransactionsForDrillDown<T extends { category: string; date: string; merchant?: string | null }>(
  transactions: T[],
  filter: DrillDownFilter
): T[] {
  return transactions.filter((t) => {
    if (filter.categories) {
      if (!filter.categories.includes(t.category)) return false
    } else if (filter.category && t.category !== filter.category) {
      return false
    }
    if (filter.merchant && t.merchant !== filter.merchant) return false
    if (filter.type && (t as { type?: string }).type !== filter.type) return false
    if (filter.dateFrom || filter.dateTo) {
      if (filter.dateFrom && t.date < filter.dateFrom) return false
      if (filter.dateTo && t.date > filter.dateTo) return false
    } else if (filter.month) {
      if (t.date.substring(0, 7) !== filter.month) return false
    }
    return true
  })
}
```

Note: `type` was silently unused by the filter function before this change (the field existed on the interface but the function never checked it) — this task also wires it up, since Task 2 (Trend Chart) doesn't need it but a future caller reasonably could. This is a one-line, low-risk addition alongside the two fields this task actually requires.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/context/DrillDownContext.test.ts`
Expected: PASS (8 tests — the original 5 plus 3 new ones)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: no new TypeScript errors. (`DrillDownModal.tsx`'s `DrillDownListItem` type already has `merchant?: string | null`, matching the new generic constraint — no changes needed there.)

- [ ] **Step 6: Commit**

```bash
git add src/context/DrillDownContext.tsx src/context/DrillDownContext.test.ts
git commit -m "feat: extend DrillDownFilter with merchant and multi-category matching"
```

---

### Task 2: Wire `TrendChart.tsx` — click a period bar

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx` (the `TrendItem` interface only, in this task — the rest of that file is Task 8)
- Modify: `src/pages/analytics/TrendChart.tsx`

`getTrendData()` (`src/pages/AnalyticsPage.tsx:101`) already attaches `dateStr` (day buckets), `startStr`/`endStr` (week buckets), or `monthKey` (month buckets) to each returned item at runtime — the `TrendItem` interface just doesn't declare them, so they're invisible to TypeScript. This task exposes them through the type and reads whichever is present when a bar is clicked.

- [ ] **Step 1: Widen the `TrendItem` interface**

In `src/pages/AnalyticsPage.tsx`, find:

```typescript
interface TrendItem {
  label: string
  income: number
  expenses: number
  savings: number
}
```

Replace with:

```typescript
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
```

- [ ] **Step 2: Add the click-handler prop to `TrendChart`**

In `src/pages/analytics/TrendChart.tsx`, find the `TrendChartProps` interface and the component signature (search for `interface TrendChartProps` and `export function TrendChart({`). Add a new prop:

```typescript
interface TrendChartProps {
  range: RangeType
  trendData: TrendItem[]
  loading: boolean
  hasTransactions: boolean
  /** Called when a period bar/column is clicked, with that period's own item (carrying whichever of dateStr/startStr+endStr/monthKey applies) and its display label. */
  onPeriodClick?: (item: TrendItem, label: string) => void
}
```

Note: `TrendItem` isn't currently imported into this file (it's defined locally in `AnalyticsPage.tsx` and passed in as `trendData: TrendItem[]` via structural typing on `TrendChartProps`, not an explicit shared import). Before adding the widened fields to a type reference here, check how `TrendChartProps.trendData`'s type is currently declared in this file — if it's an inline `{label, income, expenses, savings}[]` shape rather than an imported `TrendItem`, widen that inline shape to match Step 1's addition instead of trying to import a type that isn't exported from `AnalyticsPage.tsx`. Read the actual current interface before editing to confirm which case applies.

- [ ] **Step 3: Make each bar/column clickable**

Find the JSX that renders each period's bar or column (search for `.map((item` or `.map((t` iterating `trendData` — the exact variable name depends on the current render code, read it before editing). Wrap the clickable region's existing `onClick` (if any — some ranges may already have a tooltip-toggle handler, similar to `CategoryTrendChart`'s `setTappedIndex` pattern) or add one:

```typescript
onClick={onPeriodClick ? () => onPeriodClick(item, item.label) : existingHandler}
```

If an existing handler is already present (e.g. a tooltip toggle), call both — the tooltip toggle should keep working, and `onPeriodClick` should fire alongside it, not replace it. Add `cursor-pointer` conditionally on `onPeriodClick` being provided, matching the pattern used in `CategoryTrendChart.tsx` (Phase 1, `src/pages/analytics/CategoryTrendChart.tsx`).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AnalyticsPage.tsx src/pages/analytics/TrendChart.tsx
git commit -m "feat: make TrendChart period bars clickable for drill-down"
```

---

### Task 3: Wire `CreditCardPaymentTrend.tsx` — click a month bar

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx` (the `ccBillPaymentTrend` memo only, in this task)
- Modify: `src/pages/analytics/CreditCardPaymentTrend.tsx`

`ccBillPaymentTrend`'s memo (`src/pages/AnalyticsPage.tsx:386`) already computes `monthKey` per bucket internally, then discards it in the final `.map()`. This task keeps it.

- [ ] **Step 1: Stop discarding `monthKey`**

Find:

```typescript
    return months.map(({ label, amount }) => ({ label, amount }))
  }, [transactions, categoryMap])
```

Replace with:

```typescript
    return months.map(({ monthKey, label, amount }) => ({ monthKey, label, amount }))
  }, [transactions, categoryMap])
```

- [ ] **Step 2: Widen `CreditCardPaymentTrendItem` and add the click prop**

In `src/pages/analytics/CreditCardPaymentTrend.tsx`, find:

```typescript
export interface CreditCardPaymentTrendItem {
  label: string
  amount: number
}

interface CreditCardPaymentTrendProps {
  data: CreditCardPaymentTrendItem[]
  loading: boolean
}
```

Replace with:

```typescript
export interface CreditCardPaymentTrendItem {
  monthKey: string
  label: string
  amount: number
}

interface CreditCardPaymentTrendProps {
  data: CreditCardPaymentTrendItem[]
  loading: boolean
  onMonthClick?: (monthKey: string, label: string) => void
}
```

- [ ] **Step 3: Make each month bar clickable**

Find the JSX rendering each `data.map(...)` bar (read the actual current render code — this chart follows the same bar-chart shape as `ExpenseBreakdown`/`CategoryTrendChart` from Phase 1). Add, on the clickable bar element:

```typescript
onClick={onMonthClick ? () => onMonthClick(d.monthKey, d.label) : undefined}
className={`... ${onMonthClick ? 'cursor-pointer hover:opacity-80' : ''}`}
```

(merge with whatever className the element already has, following the same conditional-class pattern used in `ExpenseBreakdown.tsx`'s Phase 1 legend-row wiring).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AnalyticsPage.tsx src/pages/analytics/CreditCardPaymentTrend.tsx
git commit -m "feat: make CreditCardPaymentTrend month bars clickable for drill-down"
```

---

### Task 4: Wire `MerchantLeaderboard.tsx` — click a merchant row

**Files:**
- Modify: `src/pages/analytics/MerchantLeaderboard.tsx`

- [ ] **Step 1: Add the click prop**

Find:

```typescript
interface MerchantLeaderboardProps {
  data: MerchantLeaderboardItem[]
  loading: boolean
}

export function MerchantLeaderboard({ data, loading }: MerchantLeaderboardProps) {
```

Replace with:

```typescript
interface MerchantLeaderboardProps {
  data: MerchantLeaderboardItem[]
  loading: boolean
  onMerchantClick?: (merchant: string) => void
}

export function MerchantLeaderboard({ data, loading, onMerchantClick }: MerchantLeaderboardProps) {
```

- [ ] **Step 2: Make each row clickable**

Find the JSX rendering `data.map(...)` (read the actual current row markup before editing). Add to the row's container element:

```typescript
onClick={onMerchantClick ? () => onMerchantClick(d.merchant) : undefined}
className={`... ${onMerchantClick ? 'cursor-pointer hover:opacity-75' : ''}`}
role={onMerchantClick ? 'button' : undefined}
tabIndex={onMerchantClick ? 0 : undefined}
```

(merge with the row's existing className, matching the pattern from `ExpenseBreakdown.tsx`'s Phase 1 legend-row wiring — same accessibility attributes).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/analytics/MerchantLeaderboard.tsx
git commit -m "feat: make MerchantLeaderboard rows clickable for drill-down"
```

---

### Task 5: Wire `AnomalyAlerts.tsx` — click a flagged category

**Files:**
- Modify: `src/pages/analytics/AnomalyAlerts.tsx`

Anomalies are always about the current month — `detectAnomalies()` (`src/services/aiService.ts`) hardcodes `currentMonth = now.toISOString().substring(0,7)` internally and never receives a date filter, so the drill-down filter for an anomaly row is always `{category, month: <this month>}`, computed at click time (not passed down from the anomaly item, which doesn't carry a month field).

- [ ] **Step 1: Add the click prop**

Find:

```typescript
interface AnomalyAlertsProps {
  anomalies: AnomalyItem[]
}

export function AnomalyAlerts({ anomalies }: AnomalyAlertsProps) {
```

Replace with:

```typescript
interface AnomalyAlertsProps {
  anomalies: AnomalyItem[]
  onAnomalyClick?: (category: string) => void
}

export function AnomalyAlerts({ anomalies, onAnomalyClick }: AnomalyAlertsProps) {
```

- [ ] **Step 2: Make each anomaly row clickable**

Find the JSX rendering `anomalies.map(...)` (read the actual current markup). Add to each row's container:

```typescript
onClick={onAnomalyClick ? () => onAnomalyClick(anomaly.category) : undefined}
className={`... ${onAnomalyClick ? 'cursor-pointer hover:opacity-75' : ''}`}
role={onAnomalyClick ? 'button' : undefined}
tabIndex={onAnomalyClick ? 0 : undefined}
```

(use whatever the loop variable is actually named in the existing code — confirm before editing.)

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/analytics/AnomalyAlerts.tsx
git commit -m "feat: make AnomalyAlerts rows clickable for drill-down"
```

---

### Task 6: Wire `BudgetBurndown.tsx` — click a budgeted category

**Files:**
- Modify: `src/pages/analytics/BudgetBurndown.tsx`

Each `BudgetBurndownItem` already carries `category`; the month it's scoped to is computed by the caller (`targetMonth` in `AnalyticsPage.tsx`'s `budgetBurndownData` memo) rather than stored per item, so — like Task 5 — the click handler passes up just the category, and `AnalyticsPage.tsx` (Task 8) attaches the month.

- [ ] **Step 1: Add the click prop**

Find:

```typescript
interface BudgetBurndownProps {
  data: BudgetBurndownItem[]
  loading: boolean
}

export function BudgetBurndown({ data, loading }: BudgetBurndownProps) {
```

Replace with:

```typescript
interface BudgetBurndownProps {
  data: BudgetBurndownItem[]
  loading: boolean
  onCategoryClick?: (category: string) => void
}

export function BudgetBurndown({ data, loading, onCategoryClick }: BudgetBurndownProps) {
```

- [ ] **Step 2: Make each category row clickable**

Find the JSX rendering `data.map(...)` (each item is one budgeted category's burndown row/card — read the actual current markup). Add to each row's container:

```typescript
onClick={onCategoryClick ? () => onCategoryClick(item.category) : undefined}
className={`... ${onCategoryClick ? 'cursor-pointer hover:opacity-75' : ''}`}
role={onCategoryClick ? 'button' : undefined}
tabIndex={onCategoryClick ? 0 : undefined}
```

(use the actual loop variable name from the existing code.)

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/analytics/BudgetBurndown.tsx
git commit -m "feat: make BudgetBurndown rows clickable for drill-down"
```

---

### Task 7: Wire `BudgetVisualizer.tsx` (Needs/Wants/Savings buckets) and `AdherenceDiagnostic.tsx` (whole-card)

**Files:**
- Modify: `src/pages/analytics/BudgetVisualizer.tsx`
- Modify: `src/pages/analytics/AdherenceDiagnostic.tsx`

`BudgetVisualizer` shows three buckets (Needs, Wants, Savings) as single numbers — each spans multiple categories via the `analytics_tags` system (`needsCategoryNames`/`wantsCategoryNames`/`savingsCategoryNames`, already computed in `AnalyticsPage.tsx`). This task only reports *which bucket* was clicked (`'needs' | 'wants' | 'savings'`); Task 8 resolves that to the actual category list.

`AdherenceDiagnostic` has no per-segment breakdown at all — clicking anywhere on it opens every transaction in the active period, unfiltered. This was confirmed with the user as the intended behavior for this specific chart before writing this plan.

- [ ] **Step 1: Add the click prop to `BudgetVisualizer`**

Find:

```typescript
interface BudgetVisualizerProps {
  needsSpent: number
  needsPct: number
  wantsSpent: number
  wantsPct: number
  savingsSpent: number
  finalSavingsPct: number
  totalIncome: number
  emergencyMonths: number
  isEmergencyFundReady: boolean
}

export function BudgetVisualizer({
  needsSpent,
  needsPct,
  wantsSpent,
  wantsPct,
  savingsSpent,
  finalSavingsPct,
  totalIncome,
  emergencyMonths,
  isEmergencyFundReady,
}: BudgetVisualizerProps) {
```

Replace with:

```typescript
interface BudgetVisualizerProps {
  needsSpent: number
  needsPct: number
  wantsSpent: number
  wantsPct: number
  savingsSpent: number
  finalSavingsPct: number
  totalIncome: number
  emergencyMonths: number
  isEmergencyFundReady: boolean
  onBucketClick?: (bucket: 'needs' | 'wants' | 'savings') => void
}

export function BudgetVisualizer({
  needsSpent,
  needsPct,
  wantsSpent,
  wantsPct,
  savingsSpent,
  finalSavingsPct,
  totalIncome,
  emergencyMonths,
  isEmergencyFundReady,
  onBucketClick,
}: BudgetVisualizerProps) {
```

- [ ] **Step 2: Make each of the three bucket rows clickable**

Find the three JSX blocks rendering Needs, Wants, and Savings (search for the comments `{/* Needs */}`, `{/* Wants */}`, `{/* Savings */}` or equivalent — read the actual current markup, since each bucket's row is hand-written rather than looped). Add to each bucket's outer container:

```typescript
onClick={onBucketClick ? () => onBucketClick('needs') : undefined}   // 'wants' / 'savings' respectively for the other two blocks
className={`... ${onBucketClick ? 'cursor-pointer hover:opacity-75' : ''}`}
role={onBucketClick ? 'button' : undefined}
tabIndex={onBucketClick ? 0 : undefined}
```

- [ ] **Step 3: Add the click prop to `AdherenceDiagnostic`, on the whole card**

Find:

```typescript
interface AdherenceDiagnosticProps {
  healthScore: number
  totalIncome: number
  totalDebit: number
}

export function AdherenceDiagnostic({ healthScore, totalIncome, totalDebit }: AdherenceDiagnosticProps) {
```

Replace with:

```typescript
interface AdherenceDiagnosticProps {
  healthScore: number
  totalIncome: number
  totalDebit: number
  onClick?: () => void
}

export function AdherenceDiagnostic({ healthScore, totalIncome, totalDebit, onClick }: AdherenceDiagnosticProps) {
```

Find the outer `<Card ...>` element (the component's root return) and add `onClick`, `role`, `tabIndex`, and a conditional `cursor-pointer` class to it directly — the whole card is the click target, there's no per-segment breakdown to wire.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/analytics/BudgetVisualizer.tsx src/pages/analytics/AdherenceDiagnostic.tsx
git commit -m "feat: make BudgetVisualizer buckets and AdherenceDiagnostic clickable for drill-down"
```

---

### Task 8: Widen the `DrillDownProvider` boundary and wire all 6 new handlers in `AnalyticsPage.tsx`

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx`

This is the integration task — it depends on Tasks 1–7 all being committed first, since it imports/uses every prop they added.

- [ ] **Step 1: Widen the provider boundary**

Find the current boundary (established in Phase 1):

```typescript
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
```

Read the full surrounding JSX from this point down through the end of the `showAdvanced` block (down to and including the `<ForecastPanel forecast={forecast} />` closing, per the earlier read of this file — `AIInsights`, `ScenarioSimulator`, and `ForecastPanel` are NOT drill-down targets per the Phase 1 spec's non-goals and stay exactly as they render today; they're included in this excerpt only because they sit inside the same JSX region that needs to move inside the widened provider, not because they're being wired).

Replace the whole region (from the `<TrendChart` opening through the `</DrillDownProvider>` closing, plus everything in between including the `showAdvanced` block) with the provider wrapping the entire thing:

```typescript
        <DrillDownProvider onDirtyClose={fetchAllData}>
          <TrendChartWithDrillDown range={range} trendData={trendData} loading={loading} hasTransactions={transactions.length > 0} />

          <CreditCardPaymentTrendWithDrillDown data={ccBillPaymentTrend} loading={loading} />

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
            <MerchantLeaderboardWithDrillDown data={merchantLeaderboard} loading={loading} range={range} />
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
              <div className="flex items-center justify-end gap-2 -mt-2">
                <span className="text-xs text-zinc-500">Advisory period:</span>
                <DateFilterPicker value={dateFilter} onChange={setDateFilter} />
              </div>

              {loading ? (
                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="h-60 skeleton"><div /></Card>
                  <Card className="md:col-span-2 h-60 skeleton"><div /></Card>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-3">
                  <AdherenceDiagnosticWithDrillDown healthScore={healthScore} totalIncome={totalIncome} totalDebit={totalDebit} advisoryFrom={advisoryFrom} advisoryTo={advisoryTo} />
                  <BudgetVisualizerWithDrillDown
                    needsSpent={needsSpent}
                    needsPct={needsPct}
                    wantsSpent={wantsSpent}
                    wantsPct={wantsPct}
                    savingsSpent={savingsSpent}
                    finalSavingsPct={finalSavingsPct}
                    totalIncome={totalIncome}
                    emergencyMonths={emergencyMonths}
                    isEmergencyFundReady={isEmergencyFundReady}
                    advisoryFrom={advisoryFrom}
                    advisoryTo={advisoryTo}
                    needsCategoryNames={needsCategoryNames}
                    wantsCategoryNames={wantsCategoryNames}
                    savingsCategoryNames={savingsCategoryNames}
                  />
                </div>
              )}

              {!loading && (
                <BudgetBurndownWithDrillDown data={budgetBurndownData} loading={loading} dateFilter={dateFilter} />
              )}

              {/* AI Wealth Advisory + Anomalies + Scenario Simulator */}
              {!loading && (
                <div className="space-y-6">
                  <AnomalyAlertsWithDrillDown anomalies={anomalies} />

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

          <DrillDownModal transactions={transactions} />
        </DrillDownProvider>
```

Before applying this replacement, read the actual current file content for this entire region end-to-end (it spans roughly lines 690–800, but confirm exact current line numbers, since Tasks 1–7 didn't touch `AnalyticsPage.tsx` except for `TrendItem`/`ccBillPaymentTrend` in Tasks 2–3) — match against what's really there rather than assuming the excerpt above is byte-identical to the file, and preserve any detail present in the real file that isn't shown here (this plan reproduces the structure faithfully based on an earlier full read of the file, but re-verify before editing since this is the single highest-risk edit in this plan).

- [ ] **Step 2: Define the remaining wrapper components**

Add these alongside the existing `ExpenseBreakdownWithDrillDown`/`CategoryTrendChartWithDrillDown` wrapper functions (defined in Phase 1, Task 6 — find that exact location and add these as siblings):

```typescript
function TrendChartWithDrillDown({ range, trendData, loading, hasTransactions }: { range: RangeType; trendData: TrendItem[]; loading: boolean; hasTransactions: boolean }) {
  const { openDrillDown } = useDrillDown()
  return (
    <TrendChart
      range={range}
      trendData={trendData}
      loading={loading}
      hasTransactions={hasTransactions}
      onPeriodClick={(item, label) => {
        if (item.dateStr) {
          openDrillDown({ dateFrom: item.dateStr, dateTo: item.dateStr }, label)
        } else if (item.startStr && item.endStr) {
          openDrillDown({ dateFrom: item.startStr, dateTo: item.endStr }, label)
        } else if (item.monthKey) {
          openDrillDown({ month: item.monthKey }, label)
        }
      }}
    />
  )
}

function CreditCardPaymentTrendWithDrillDown({ data, loading }: { data: CreditCardPaymentTrendItem[]; loading: boolean }) {
  const { openDrillDown } = useDrillDown()
  return (
    <CreditCardPaymentTrend
      data={data}
      loading={loading}
      onMonthClick={(monthKey, label) => openDrillDown({ category: 'Credit Card Bill Payment', month: monthKey }, `Credit Card Bill Payment — ${label}`)}
    />
  )
}

function MerchantLeaderboardWithDrillDown({ data, loading, range }: { data: MerchantLeaderboardItem[]; loading: boolean; range: RangeType }) {
  const { openDrillDown } = useDrillDown()
  return (
    <MerchantLeaderboard
      data={data}
      loading={loading}
      onMerchantClick={(merchant) => {
        const { start, end } = getRangeDates(range)
        openDrillDown({ merchant, dateFrom: toISODateLocal(start), dateTo: toISODateLocal(end) }, merchant)
      }}
    />
  )
}

function AnomalyAlertsWithDrillDown({ anomalies }: { anomalies: { category: string; thisMonth: number; baseline: number; spike: number }[] }) {
  const { openDrillDown } = useDrillDown()
  return (
    <AnomalyAlerts
      anomalies={anomalies}
      onAnomalyClick={(category) => openDrillDown({ category, month: getCurrentMonth() }, `${category} — spike this month`)}
    />
  )
}

function BudgetBurndownWithDrillDown({ data, loading, dateFilter }: { data: BudgetBurndownItem[]; loading: boolean; dateFilter: DateFilter }) {
  const { openDrillDown } = useDrillDown()
  return (
    <BudgetBurndown
      data={data}
      loading={loading}
      onCategoryClick={(category) => {
        const targetMonth = dateFilter.mode === 'month' ? dateFilter.month : resolveDateFilter(dateFilter).dateTo.slice(0, 7)
        openDrillDown({ category, month: targetMonth }, category)
      }}
    />
  )
}

function AdherenceDiagnosticWithDrillDown({ healthScore, totalIncome, totalDebit, advisoryFrom, advisoryTo }: { healthScore: number; totalIncome: number; totalDebit: number; advisoryFrom: string; advisoryTo: string }) {
  const { openDrillDown } = useDrillDown()
  return (
    <AdherenceDiagnostic
      healthScore={healthScore}
      totalIncome={totalIncome}
      totalDebit={totalDebit}
      onClick={() => openDrillDown({ dateFrom: advisoryFrom, dateTo: advisoryTo }, 'All transactions this period')}
    />
  )
}

function BudgetVisualizerWithDrillDown({
  needsSpent, needsPct, wantsSpent, wantsPct, savingsSpent, finalSavingsPct, totalIncome, emergencyMonths, isEmergencyFundReady,
  advisoryFrom, advisoryTo, needsCategoryNames, wantsCategoryNames, savingsCategoryNames,
}: {
  needsSpent: number; needsPct: number; wantsSpent: number; wantsPct: number; savingsSpent: number; finalSavingsPct: number
  totalIncome: number; emergencyMonths: number; isEmergencyFundReady: boolean
  advisoryFrom: string; advisoryTo: string
  needsCategoryNames: string[]; wantsCategoryNames: string[]; savingsCategoryNames: string[]
}) {
  const { openDrillDown } = useDrillDown()
  const bucketLabels: Record<'needs' | 'wants' | 'savings', string> = { needs: 'Needs', wants: 'Wants', savings: 'Savings' }
  const bucketCategories: Record<'needs' | 'wants' | 'savings', string[]> = {
    needs: needsCategoryNames,
    wants: wantsCategoryNames,
    savings: savingsCategoryNames,
  }
  return (
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
      onBucketClick={(bucket) => openDrillDown(
        { categories: bucketCategories[bucket], dateFrom: advisoryFrom, dateTo: advisoryTo },
        bucketLabels[bucket]
      )}
    />
  )
}
```

- [ ] **Step 3: Verify all referenced types/values are actually in scope**

Before running the build, confirm each of these is already imported/defined earlier in `AnalyticsPage.tsx` (all should be, per the file's existing structure — this step is a check, not new code):
- `RangeType`, `DateFilter` — imported types
- `TrendItem`, `MerchantLeaderboardItem`, `BudgetBurndownItem` — locally defined/imported interfaces
- `CreditCardPaymentTrendItem` — imported alongside the `CreditCardPaymentTrend` component import
- `getRangeDates`, `toISODateLocal`, `getCurrentMonth`, `resolveDateFilter` — already used elsewhere in this file
- `needsCategoryNames`, `wantsCategoryNames`, `savingsCategoryNames`, `advisoryFrom`, `advisoryTo` — already computed as local variables in the component body (confirmed at `src/pages/AnalyticsPage.tsx:292-296` and `:506`)

If any wrapper function is defined in a scope where these aren't visible, move the wrapper function definition to where they are (all of `AnalyticsPage.tsx`'s wrapper functions from Phase 1 are top-level sibling functions in the same file, not nested inside `AnalyticsPage` itself — follow that same placement, and pass anything they need as explicit props from the call site, exactly as shown in Step 2 above).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: no new TypeScript errors. This is the highest-risk task in the plan — if there are mismatches, they'll surface here. Fix by re-reading the actual current file content at the error location and adjusting the edit to match reality, preserving intent.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all suites pass — this task adds no new tests itself (no new pure logic was introduced, only JSX wiring), so this just confirms no regression.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AnalyticsPage.tsx
git commit -m "feat: wire drill-down into all remaining Analytics charts"
```

---

### Task 9: Manual verification

**Files:** none — no code changes.

Same constraint as Phase 1: no component-rendering test infrastructure in this project, so the actual click → overlay → edit → refresh flow is verified by hand.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`, sign in, navigate to Analytics with a period that has real transaction data across several categories/merchants/months.

- [ ] **Step 2: Verify each new chart's click target opens the right data**

For each of: Trend Chart (click a bar), Credit Card Payment Trend (click a month bar), Merchant Leaderboard (click a merchant row), Anomaly Alerts (click a flagged category, if any anomalies are present), Budget Burndown (click a budgeted category), Budget Visualizer (click each of Needs/Wants/Savings), and Adherence Diagnostic (click anywhere on the card) — confirm:
- The overlay opens with a sensible title.
- The listed transactions actually match what that click represents (spot-check amounts/dates/categories against the chart's own numbers).
- Edit → save removes the row and the source chart's numbers update once the overlay closes.

- [ ] **Step 3: Verify Forecast, Scenario Simulator, and AI Insights are still untouched**

Confirm no click affordances were accidentally added to these three (per the Phase 1 non-goals, unchanged in this phase).
