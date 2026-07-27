# Credit Card Bill Payment Category

## Problem

When a user pays off a credit card bill, that payment is currently just another
debit transaction, summed into "Total Expenses" like any purchase. But the
individual purchases that made up that bill were **already** counted as expenses
when they happened (parsed from the card-purchase alerts, or entered manually).
Counting the bill payment too double-books that spending — inflating Total
Expenses, distorting the Needs/Wants/Savings 50/30/20 score, and misleading any
AI-generated insight that reads from those totals.

## Goals

- A new category, "Credit Card Bill Payment", that a user can select for a
  transaction (via the existing category dropdown, same as any other category —
  no new UI beyond adding it to the list).
- Any transaction in this category is **fully excluded** from every expense total
  in the app: Dashboard, Expenses page quick stats, Analytics page allocation and
  Needs/Wants/Savings score, and AI-generated insights. It's neither a Need, a
  Want, nor Savings — it doesn't affect that breakdown at all.
- A dedicated chart on the Analytics page showing the monthly trend of credit
  card bill payments, so the money is still visible and trackable — just not
  double-counted into spend.

## Non-goals

- No automatic detection/re-categorization of past transactions that are
  actually credit card bill payments but were categorized as something else
  (e.g. "shopping") before this category existed — this is forward-looking only,
  same as every other category addition in this app. The user re-categorizes
  historical ones manually if they want to, the same way they'd fix any
  miscategorized transaction today.
- No automatic detection of which transactions are card *purchases* to compare
  against the bill payment (no "are you paying what you charged" comparison
  chart) — just the payment trend itself.
- No change to how credit/income transactions are totaled — this only affects
  debit-type transactions in this one category.
- No change to the existing category-breakdown doughnut chart's category list —
  credit card bill payments are excluded from it too (since it's a spend
  breakdown, and this category isn't counted as spend), not added as a new slice.

## Design

### 1. New category

Add `credit_card_bill_payment` to the `ExpenseCategory` union type
(`src/types/index.ts`) and to the `CATEGORIES` constant
(`src/constants/index.ts`), with a label ("Credit Card Bill Payment"), an emoji,
and a color distinct from existing categories. This makes it selectable anywhere
the category dropdown already appears (`ExpenseForm.tsx`, the Pending Alerts
review flows, the new auto-categorization confirm modal) with zero additional UI
work — every one of those already renders `Object.entries(CATEGORIES)`.

### 2. Exclusion from every expense total

Every place that currently computes a debit total gets the same one-line
addition: filter out `category === 'credit_card_bill_payment'` alongside the
existing `type === 'debit'` filter. Concretely:

- `src/services/transactions.ts` — `getMonthlySummary` (total + category
  breakdown) and `getHistoricalAnalytics` (monthly trend series).
- `src/pages/AnalyticsPage.tsx` — `getAllocationData` (breakdown for the
  selected range) and the Needs/Wants/Savings `debitTxns`/`totalDebit`
  calculation. The category is not added to `NEEDS_CATEGORIES`,
  `WANTS_CATEGORIES`, or `SAVINGS_CATEGORIES` — it's excluded from that
  breakdown entirely, not assigned a bucket.
- `src/pages/ExpensesPage.tsx` — the quick-stats "Expenses" card (client-side sum
  over the currently-loaded transactions).
- `src/pages/DashboardPage.tsx` — the post-Gmail-scan top-category summary.
- `src/services/aiService.ts` — the debit filter that feeds the AI insight
  prompt's spending figures.

This is the same filter condition applied consistently at each site — no shared
helper is introduced for it, since each site already has its own
already-established local filter/reduce logic and the codebase's existing
pattern (confirmed across all these files) is to compute totals inline at each
call site rather than through one central aggregator. Introducing a new shared
utility here would be a bigger, riskier change than the feature calls for.

### 3. New chart: monthly credit card bill payment trend

A new component on the Analytics page, `CreditCardPaymentTrend`, placed
alongside the existing `ExpenseBreakdown` (category doughnut) and `TrendChart`
(income/expenses/savings monthly trend) components in
`src/pages/analytics/`. It follows the same hand-rolled rendering approach
already used by those two (this codebase has no charting library) — a simple
bar or line trend showing the monthly sum of `credit_card_bill_payment`
transactions, built from the same underlying monthly-series data source pattern
`getHistoricalAnalytics` already provides for the existing trend chart, filtered
to this one category instead of excluding it.

## Testing

- Unit tests for each modified total-computation function
  (`getMonthlySummary`, `getHistoricalAnalytics`) confirming a
  `credit_card_bill_payment` transaction is excluded from the returned total
  while a same-amount transaction in any other category is still included.
- Manual verification: create a transaction in the new category, confirm it
  disappears from Dashboard/Expenses/Analytics totals and the Needs/Wants/Savings
  score, and confirm it appears in the new trend chart.
