# Merchant / remark display cleanup — design

## Problem

Several transaction lists fall back to the raw bank narration (`transactions.description`) whenever `transactions.merchant` is blank, and display that narration as if it were a merchant name:

- `AnalyticsPage.tsx` — the Top Merchants leaderboard aggregates `merchant || description || 'Unknown'`, so narration strings like `UPI/4412/SWIGGY-ORDER-BLR` become their own leaderboard rows instead of being folded into a real merchant or grouped together.
- `DrillDownModal.tsx:114` — same `merchant || description` fallback in the transaction title.
- `DashboardPage.tsx:1258-1262` — same fallback in the category drill-down modal, with the narration then repeated as a secondary line.
- `PendingPage.tsx:1147` — merchant badge falls back to `parseShortDescription(description, ...)`, a keyword-sniffing helper intended for auto-categorization, not display.
- `ExpenseList.tsx:203` and other rows never show `merchant` at all — they title the row on `description || category label`, so the merchant name is invisible even when present.

Net effect: raw narration text (a "remark", not a merchant) leaks into merchant-labeled UI, and the merchant name — when it does exist — often isn't shown at all.

## Scope

This spec is about **`description` (the raw bank narration)**, not the `notes` field (labelled "Remarks" in `ExpenseForm.tsx`, used for returnable-expense tracking). `notes` is out of scope.

Applies to all transaction list surfaces: `AnalyticsPage` (Top Merchants + its aggregation), `DrillDownModal`, `DashboardPage` (category drill-down modal), `ExpenseList`, `PendingPage`.

## Approach

Introduce one shared resolver and one shared presentational component, used everywhere a transaction is listed, so the merchant/remark rule lives in exactly one place.

Rejected alternatives:
- **Fix the data instead of the display** (backfill `merchant` via migration + normalize at ingest) — reasonable follow-up, but it's a one-way migration over user data, can't recover merchants the normalizer doesn't recognize, and doesn't remove the need for a display-layer fallback anyway.
- **Patch each call site inline** — fastest, but this is how the bug happened: `AnalyticsPage.tsx` and `DrillDownModal.tsx` already have two independent copies of the same fallback expression that silently diverged in behavior (one also renders the raw description as a second line, one doesn't).

## Design

### 1. Resolver: `src/utils/transactionIdentity.ts`

```
resolveTransactionIdentity(txn: { merchant, description, category }) → {
  title:  string   // line 1 — never raw narration
  remark: string   // line 2 — '' when nothing worth showing
}
```

`title` resolution order:
1. `txn.merchant` if non-blank.
2. Else run `txn.description` through the existing `normalizeMerchant()` (`src/services/merchantNormalizer.ts`) and use `canonical` **only when `isKnown` is `true`**. The `isKnown: false` generic-cleanup branch of `normalizeMerchant` must not be used for title resolution — it title-cases arbitrary narration text (e.g. `Upi 4412 Paytm Add Money`), which is the same bug in nicer clothing.
3. Else `'Unclassified'`.

`remark` is `txn.description`, blanked to `''` when any of:
- it's empty,
- it equals `title` (case-insensitive),
- it matches the existing noise patterns currently checked in `PendingPage.tsx`'s `parseShortDescription` (`Auto-Parsed`, `Auto Detected`, `Bank Transaction`),
- it matches the `` `${title} Transaction` `` shape already guarded at `DashboardPage.tsx:1261`.

These noise checks move out of `PendingPage.tsx` into this module so there is one copy. `parseShortDescription` itself stays in `PendingPage.tsx` unchanged — it's used for auto-categorization suggestion text, not display, and is out of scope here.

### 2. Aggregation: `AnalyticsPage.tsx` Top Merchants

The `merchantLeaderboard` memo groups by `resolveTransactionIdentity(t).title` instead of `merchant || description || 'Unknown'`. Effects:
- A narration recognized by `normalizeMerchant` (e.g. contains "swiggy") now folds into that merchant's existing total instead of creating a duplicate row.
- Everything else collapses into one `Unclassified` row instead of fragmenting into many near-duplicate narration-text rows.
- `MerchantLeaderboard.tsx` itself is unchanged — it already just renders `item.merchant` as given.

### 3. Presentation: `<TransactionIdentity>` in `src/components/ui`

```
<TransactionIdentity title={string} remark={string} size?: 'sm' | 'md' />
```

Renders a two-line stack: `title` bold on line 1, `remark` muted and truncated on line 2, line 2 omitted entirely when `remark` is `''`. Matches the existing pattern already used ad hoc at `DashboardPage.tsx:1258-1262`.

Replaces the current inline title/description JSX in:
- `DashboardPage.tsx` (category drill-down modal, lines ~1258-1262)
- `DrillDownModal.tsx` (line 114)
- `ExpenseList.tsx` (line ~203) — this surface goes from showing no merchant to showing merchant-primary/description-secondary, which is the scope-widening the user confirmed.
- `PendingPage.tsx` (line ~1147, the merchant badge + description line) — its "confidence" badge and edit-suggestion UI stay as-is; only the displayed title/remark text is swapped to use the resolver's output instead of `parseShortDescription`.

Each call site becomes: compute `resolveTransactionIdentity(txn)` once, pass `title`/`remark` into `<TransactionIdentity>`.

## Testing

- Unit tests for `resolveTransactionIdentity` covering: merchant present; merchant blank + known narration; merchant blank + unknown narration; remark equal to title; remark matching each noise pattern; remark empty.
- Unit test for the Top Merchants aggregation change (folds a recognized narration into its known merchant's total; groups unrecognized narrations under `Unclassified`).
- Existing tests referencing `merchant || description` fallback behavior (if any, e.g. in `DrillDownContext.test.ts`) reviewed and updated to match the new resolver output.
