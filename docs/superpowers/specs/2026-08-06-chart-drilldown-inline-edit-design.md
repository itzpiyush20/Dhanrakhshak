# Chart Drill-Down & Inline Edit (Phase 1)

## Problem

Analytics charts (`src/pages/analytics/*.tsx`) show aggregated numbers — a
category slice, a trend bar, a merchant total — with no way to see or
correct the transactions behind them without leaving the page, navigating
to Expenses, and manually re-finding the right rows via search/filter. If
a chart looks wrong (e.g. income undercounted, a transaction miscategorized
into the wrong slice), there's no fast way to inspect and fix it in place.

## Goals

- Clicking a chart data point (a category slice, a trend bar, etc.) opens
  an overlay showing the exact transactions that produced that number.
- Every listed transaction is editable in place, using the app's existing
  edit form — not a second, parallel edit UI.
- Editing a transaction out of the clicked segment removes it from the
  overlay's list immediately; the underlying chart refreshes once the
  overlay is closed (not live while still open, to avoid the chart
  visibly jumping around mid-edit).
- The mechanism is reusable: adding drill-down to a future chart should be
  a small, mechanical change (supply a filter object on click), not a new
  bespoke overlay per chart.
- Phase 1 proves the pattern on the category-based charts
  (`ExpenseBreakdown.tsx`, `CategoryTrendChart.tsx`). Rolling it out to the
  remaining transaction-backed charts is explicitly Phase 2 (separate
  spec/plan).

## Non-goals

- **Forecast, Scenario Simulator, and AI Insights are not wired to this at
  all.** They have no real transactions behind their numbers (projected
  months, hypothetical what-if math, generated text respectively) — there
  is nothing to drill into or edit. This isn't a gap to fill later; these
  three simply never call `openDrillDown`.
- No live/real-time chart refresh while the drill-down overlay is still
  open — only on close, per the explicit UX decision above.
- No new edit UI. The overlay reuses `ExpenseForm.tsx` exactly as
  `ExpensesPage.tsx` already does — one edit component, not two to
  maintain.
- Phase 2 (rolling this out to Budget Visualizer, Merchant Leaderboard,
  Trend chart, Credit Card Payments, Anomaly Alerts, Budget Burndown,
  Adherence Diagnostic) is out of scope for this spec/plan. Each of those
  becomes a small, mechanical addition once Phase 1's pattern exists, but
  is tracked and planned separately so this ships reviewable and small.

## Design

### 1. Filter-descriptor architecture

Rather than every chart holding/passing its own raw transaction array,
each chart only needs to describe *what was clicked* as a filter object
matching `getTransactions()`'s existing supported options
(`src/services/transactions.ts:15-23`: `month`, `dateFrom`, `dateTo`,
`type`, `category`, `status`, `limit`, `offset`). The shared drill-down
component owns fetching, listing, and editing — charts stay simple and
don't need to be restructured to carry full transaction data just to
support drill-down.

```typescript
// src/context/DrillDownContext.tsx (new)
export interface DrillDownFilter {
  category?: string
  type?: 'debit' | 'credit'
  dateFrom?: string   // YYYY-MM-DD
  dateTo?: string      // YYYY-MM-DD
  month?: string        // YYYY-MM — ignored if dateFrom/dateTo given, matches getTransactions' own precedence
}

export interface DrillDownContextValue {
  openDrillDown: (filter: DrillDownFilter, label: string) => void
}
```

`label` is the human-readable heading shown in the overlay (e.g. "Food &
Dining — Aug 2026"), supplied by the calling chart since only the chart
knows how to phrase what was clicked.

### 2. Provider + modal component

- `DrillDownProvider` (in `DrillDownContext.tsx`) wraps `AnalyticsPage`'s
  chart section. It owns: `isOpen`, the current `filter`/`label`, and a
  `dirty` boolean set to `true` the first time any edit inside the
  overlay succeeds.
- `DrillDownModal.tsx` (new, in `src/pages/analytics/`) is the actual UI:
  built on the existing `Modal` component (`sheet` mode, matching how
  other overlays in this app already behave on mobile). On open, it calls
  `getTransactions(filter)` and renders each row (amount, merchant, date,
  category, an Edit button). Clicking Edit swaps that row for an inline
  `ExpenseForm` (`editingTransaction={txn}`), reusing its existing
  `onSaved`/`onCancel` contract exactly as `ExpensesPage.tsx` does today.
- On `ExpenseForm`'s `onSaved`, the drill-down modal removes that
  transaction from its own local list (per the "removed immediately"
  decision) and sets `dirty = true` — it does **not** re-fetch the whole
  drill-down list, since the edited row's absence from the clicked
  segment is already known without a round-trip.
- On modal close (`onClose`), if `dirty`, the provider calls a
  `onDirtyClose` callback supplied by `AnalyticsPage` — which just
  re-invokes whatever fetch already populates that page's `summary` /
  `monthlyTxns` state. No new fetch logic is written for this; it reuses
  functions that already exist on `AnalyticsPage.tsx`.

### 3. Chart wiring (Phase 1 scope)

- `ExpenseBreakdown.tsx`: each category-slice legend row (and the
  corresponding conic-gradient segment) gets an `onClick` calling
  `openDrillDown({ category: item.category, dateFrom, dateTo }, cat.label)`,
  where `dateFrom`/`dateTo` come from `AnalyticsPage`'s already-active
  date filter (passed down as a prop, not recomputed).
- `CategoryTrendChart.tsx`: same filter shape, triggered per bar/category
  element depending on that chart's specific rendering (exact click target
  determined during implementation, per the chart's existing structure —
  not respecified here since it isn't being redesigned, only made
  clickable).
- Both charts already receive (or can receive) the active date range from
  `AnalyticsPage`, so no new date-range plumbing is needed.

### 4. Error handling

- Fetch failure inside the modal (network error, Supabase error) shows an
  inline error state with a Retry button inside the modal body — does not
  close the modal or affect the chart underneath.
- Edit failure (the `updateTransaction` call inside `ExpenseForm` failing)
  surfaces via the same toast mechanism `ExpenseForm` already uses
  elsewhere in the app (`showToast(..., 'error')`) — no new error UI.
- If the user closes the modal while an edit is mid-save, the existing
  `ExpenseForm` save-in-progress/disabled-button behavior already prevents
  this class of race (same as today's Expenses page edit flow).

### 5. Testing

- Unit test for the filter-building logic in `ExpenseBreakdown.tsx` /
  `CategoryTrendChart.tsx`: given a clicked category and the page's active
  date range, does it produce the correct `DrillDownFilter` object.
- Unit test for `DrillDownModal`'s remove-on-edit behavior: given a fetched
  list and a successful edit callback, does the edited transaction get
  removed from local state and `dirty` get set.
- Manual browser verification (this feature is inherently visual/
  interactive): click a category slice, confirm the correct transactions
  appear, edit one's category, confirm it disappears from the list
  immediately, close the modal, confirm the chart re-renders with updated
  numbers.
