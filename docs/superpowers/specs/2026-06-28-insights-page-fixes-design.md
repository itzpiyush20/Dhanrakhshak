# Insights Page — Calculation Fixes & Layout Restructure

## Problem

The Insights page (`src/pages/AnalyticsPage.tsx`, route `/insights`) shows a Health Index, 50/30/20 cashflow split, and Emergency Reserve status that are computed incorrectly for common cases:

1. **Income Credits only counts `type='credit' AND category='salary'`** (line 377). Freelance, refund, and cashback credits — all valid categories in `src/constants/index.ts` — are excluded. This is why Income Credits showed ₹0 despite real spending in the reported screenshot.
2. **50/30/20 denominator silently switches** between `totalIncome` and `totalDebit` depending on whether income is recorded (lines 395-400). With no income logged, Needs/Wants/Savings stop being a 50/30/20 split against income and become a spending-mix percentage instead — misleading since the card still displays "Target 50%" etc.
3. **Emergency Reserve mixes time windows**: investments are summed over the trailing 6 months, divided by the *selected month's* Needs spend, with a hardcoded ₹15,000 fallback if that month has no Needs spend (lines 434-439).
4. **`transfers` is hardcoded into `WANTS_CATEGORIES`** (line 40) — internal money movement is not a discretionary want and inflates the Wants percentage.

The layout also visually overweights the Health Index (large circular badge, 1/3 of the top row) relative to the real numbers (Income, Spent), and the page requires a lot of scrolling because the Trend chart and Doughnut/Wealth Insights sections are each full-width and stacked.

## Goals

- Income Credits reflects all money credited to the user, not just salary.
- 50/30/20 / Health Index never silently compute a "spending mix" disguised as an income-relative score — show an empty state instead when income is unrecorded for the month.
- Emergency Reserve uses a stable, non-hardcoded denominator (trailing 3-month average Needs spend) and drops the ₹15,000 fallback.
- `transfers` no longer counts toward Needs/Wants/Savings.
- Top-of-page layout puts Income, Spent, Net Savings, and Health Index on equal visual footing as a KPI strip, rather than one dominating circular score card.
- Page is shorter — Trend chart and Doughnut/Wealth Insights share one row instead of two stacked full-width sections.

## Non-goals

- No new database schema, no new categories, no user-configurable category groupings.
- No changes to AI Advisory, Anomaly Detection, Scenario Simulator, or Forecast logic/sections — these stay in their current order and internal structure.
- No changes to `subscriptions` or `other` category groupings (both remain in `WANTS_CATEGORIES`).

## Design

### Calculation changes — `src/pages/AnalyticsPage.tsx`

**Income (line 377)**
```ts
// before
const incomeTxns = monthlyTxns.filter((t) => t.type === 'credit' && t.category === 'salary')
// after
const incomeTxns = monthlyTxns.filter((t) => t.type === 'credit')
```

**Category groupings (line 40)**
Remove `'transfers'` from `WANTS_CATEGORIES`. Result:
```ts
const WANTS_CATEGORIES = ['food', 'shopping', 'entertainment', 'subscriptions', 'travel', 'other']
```
`transfers` transactions are excluded from `needsSpent`, `wantsSpent`, and `savingsSpent` entirely (they were never in `NEEDS_CATEGORIES` or `SAVINGS_CATEGORIES`, so no other change needed).

**Zero-income guard**
When `totalIncome === 0`:
- The Health Index tile renders "—" instead of a numeric score, with status text "Log income to see your score".
- The 50/30/20 card renders an `EmptyState` (icon `📊`, title "No income recorded", description "Log income for the selected month to see your 50/30/20 adherence breakdown.") in place of the three bars.
- The percentage/variance/healthScore calculations are skipped (not computed against `totalDebit`) when income is 0 — `needsPct`/`wantsPct`/`finalSavingsPct` are only meaningful and only rendered when `totalIncome > 0`.

**Emergency Reserve (lines 434-439)**
Replace:
```ts
const avgMonthlyNeeds = needsSpent || 15000
```
with a trailing-3-month average of Needs spend, computed from the existing 6-month `transactions` array:
```ts
const monthsWithNeeds = (() => {
  const byMonth: Record<string, number> = {}
  transactions
    .filter((t) => t.type === 'debit' && NEEDS_CATEGORIES.includes(t.category))
    .forEach((t) => {
      const key = t.date.slice(0, 7) // YYYY-MM
      byMonth[key] = (byMonth[key] || 0) + Number(t.amount)
    })
  return Object.values(byMonth)
})()

const avgMonthlyNeeds = monthsWithNeeds.length > 0
  ? monthsWithNeeds.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, monthsWithNeeds.length)
  : needsSpent || 1 // avoid divide-by-zero only when there's truly no history anywhere
```
`totalInvestments` (6-month sum) and `emergencyMonths` calculation lines stay as-is — only the denominator source changes.

### Layout changes

**KPI strip** (replaces the 1-column score Card in the top row): a `grid grid-cols-2 md:grid-cols-4 gap-4` row of 4 tiles:
1. Income Credits
2. Total Spent
3. Net Savings (`totalIncome - totalDebit`, new computed value, colored green/red by sign)
4. Health Index (compact circular badge + Adherence Status label underneath, or "—" + nudge text per the zero-income guard above)

Each tile is a small `Card` with label + value, consistent with the existing visual style (uses existing `--status-*` CSS variables for color).

**50/30/20 + Emergency Reserve card**: unchanged internally, stays full-width directly below the KPI strip. Gets the `EmptyState` swap described above when `totalIncome === 0`.

**Unchanged section order below**: Anomaly Alerts → AI Advisory + Simulator row → 3-Month Forecast.

**Bottom row**: Trend chart (`Income vs Expense Trend`) and the Doughnut+Wealth Insights `grid lg:grid-cols-12` block become two children of one `grid gap-6 lg:grid-cols-2` row instead of two stacked full-width `Card`s. Each existing card keeps its internal content unchanged; only the outer wrapper grid changes.

## Testing

No automated test suite changes — this is a presentational/computational page with no existing component tests. Verification is manual: load `/insights` for a month with no income logged (confirm empty states appear, no ₹15,000 hardcoded number, no NaN/Infinity), and for a month with mixed credit categories (confirm Income Credits now includes freelance/refund/cashback).
