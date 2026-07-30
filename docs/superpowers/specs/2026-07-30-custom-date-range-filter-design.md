# Custom Date Range Filter

## Problem

Dashboard, Expenses, Analytics (Insights), and Budgets each have a `MonthPicker` control
(top-right of the page) that only lets a user page through whole calendar months via prev/next
arrows. There is no way to view transactions for an arbitrary span — e.g. "15 Jul to 22 Jul", or
"1 Jun to 15 Aug" spanning two months. Every fetch call in these pages is keyed off a single
`YYYY-MM` string (`selectedMonth`), and `getTransactions()` / `getMonthlySummary()` in
`src/services/transactions.ts` only know how to resolve a month string into a start/end date —
they have no concept of an explicit range.

## Goals

- Every page that currently has a `MonthPicker` (Dashboard, Expenses, Analytics, Budgets) gets
  the ability to filter by an arbitrary From/To date range, in addition to the existing month
  view.
- Month mode stays the default and behaves exactly as it does today (current month on load,
  prev/next arrows, no regression).
- Custom mode lets the user pick any From and any To date — within the same month or spanning
  multiple months.
- One shared component and one shared data-fetching path, not four independent
  reimplementations.

## Non-goals

- No cross-page sync of the selected filter — each page keeps its own independent state, same
  as `MonthPicker` today (Dashboard and Expenses can already be on different months
  simultaneously; that stays true for custom ranges too).
- No persistence of the selected range across sessions/reloads (matches current `MonthPicker`
  behavior — always resets to the current month on page load).
- No changes to Analytics' separate Trend/Allocation range dropdowns (`RangeType`) — those are
  already independent controls unaffected by this work. Only the Advisory/health-score section's
  `selectedMonth` usage is in scope.
- No calendar-popover UI library — reuses the plain `<input type="date">` pattern already used
  in `ExpenseForm.tsx`.

## Design

### 1. Component: `DateFilterPicker`

New component at `src/components/ui/DateFilterPicker.tsx`, replacing `MonthPicker` at all four
call sites. Same visual footprint (a bordered pill, top-right of the page).

```ts
export type DateFilter =
  | { mode: 'month'; month: string }        // YYYY-MM
  | { mode: 'custom'; from: string; to: string } // YYYY-MM-DD each
```

**Month mode (default)** — visually identical to today's `MonthPicker`: `‹ July 2026 ›` with
prev/next arrow buttons, next-arrow disabled once at the current month.

**Custom mode** — two `<input type="date">` fields, "From" and "To", styled like the date input
in `ExpenseForm.tsx`. Constraints via native `min`/`max`:
- "To" `min` = "From" value (can't be before From).
- "To" `max` = today (no future dates).
- "From" has no lower bound (any past date allowed).
- If "From" changes to a value after the current "To", "To" auto-adjusts to match "From".

A toggle inside the same pill (two small tab buttons, "Month" / "Custom") switches modes.
Switching Month → Custom seeds the two date inputs with the current month's first/last day (so
the visible data doesn't jump on toggle). Switching Custom → Month restores whatever month was
last active in Month mode (kept in local state, not derived from the custom range) — so flipping
back and forth doesn't lose your place.

Props mirror `MonthPicker`'s controlled shape:
```ts
interface DateFilterPickerProps {
  value: DateFilter
  onChange: (next: DateFilter) => void
  maxMonth?: string   // same meaning as MonthPicker's maxMonth, month-mode only
  className?: string
}
```

### 2. Data layer

`src/services/transactions.ts`:

- `getTransactions()`'s options gain `dateFrom?: string; dateTo?: string` (both `YYYY-MM-DD`).
  When present, they take precedence over `month` for computing the `.gte('date', ...)` /
  `.lte('date', ...)` bounds (the existing month→start/end derivation stays as the fallback path
  for `month`-only callers, so nothing already depending on `{month}` breaks).
- `getMonthlySummary(month)` is generalized to `getSummary({ dateFrom, dateTo })`, taking an
  explicit range instead of deriving one from a month string internally. A thin
  `getMonthlySummary(month)` wrapper can stay for any caller that still only has a month (keeps
  the diff small), implemented as `getSummary({ dateFrom: monthStart, dateTo: monthEnd })`.

Each page resolves its `DateFilter` value to a concrete `{dateFrom, dateTo}` pair before calling
these functions:
- `mode: 'month'` → `dateFrom = '${month}-01'`, `dateTo` = last day of that month (same
  computation `MonthPicker` callers already do today, e.g. `ExpensesPage.tsx:38-39`).
- `mode: 'custom'` → `dateFrom = from`, `dateTo = to`, used directly.

A small helper `resolveDateFilter(filter: DateFilter): { dateFrom: string; dateTo: string }` in
`src/utils` centralizes this so all four pages share one implementation.

### 3. Per-page integration

- **Expenses** (`ExpensesPage.tsx`): `selectedMonth` state → `dateFilter: DateFilter` state.
  `fetchTransactions` calls `getTransactions(resolveDateFilter(dateFilter))`. No other filter
  logic (search/type/category) changes.
- **Dashboard** (`DashboardPage.tsx`): same state swap; summary/breakdown fetch calls
  `getSummary(resolveDateFilter(dateFilter))`. Copy: "Where your money went this month" becomes
  mode-aware — "this month" in Month mode, "in this period" in Custom mode.
- **Budgets** (`BudgetsPage.tsx`): same state swap. Budget-vs-actual in Custom mode compares
  actual spend in the picked range against the **sum of budgets for every month the range
  touches** (e.g. a range spanning June 20–July 10 sums June's and July's budget targets). A
  small note in the UI ("Comparing against combined budget for Jun–Jul") makes this explicit
  when a custom range spans more than one month, so the comparison isn't misread as a single
  month's budget.
- **Analytics** (`AnalyticsPage.tsx`): same state swap, scoped only to the Advisory/health-score
  block (`monthlyTxns` at `AnalyticsPage.tsx:402` and the `generateAIInsights` context at
  `:462-495`). The filter changes from `t.date.startsWith(selectedMonth)` to
  `t.date >= dateFrom && t.date <= dateTo`. On-page copy referencing "this month" in that block
  becomes "this period" when Custom mode is active. The separate Trend/Allocation `RangeType`
  dropdowns are untouched.

### 4. Edge cases

- Empty state copy adjusts per mode: "No expenses tracked" (month) vs. "No expenses in this
  range" (custom).
- A custom range with `from > to` is prevented at the input level (native `min`/`max`), so no
  runtime validation branch is needed for it.
- Switching pages does not carry the filter — consistent with existing `MonthPicker` behavior.

## Testing

- Unit test `resolveDateFilter()` for both modes (month boundaries, including December→January
  rollover and leap-year February, mirroring the existing coverage style in
  `transactions.test.ts`).
- Manual verification in-browser: toggle Month ↔ Custom on Expenses, confirm transaction list
  updates correctly for a same-month range and a cross-month range; repeat spot-check on
  Dashboard, Budgets, and Analytics' advisory section.
