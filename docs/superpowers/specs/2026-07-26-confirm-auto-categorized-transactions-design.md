# Confirm Auto-Categorized Transactions

## Problem

Gmail-parsed transactions can be auto-approved (`approval_status: 'approved'`) with
no human review whenever merchant-rule matching hits a confidence threshold
(`src/services/emailScanner.ts`, `src/services/learningEngine.ts`). The category
assigned in that path is whatever a merchant rule (or, as a fallback, a static
keyword map) says it should be — the user never sees or confirms it. If a rule is
wrong (e.g. a merchant was mis-categorized once and the system "learned" it), every
future transaction from that merchant is silently mis-categorized too, with nothing
surfacing it to the user for correction.

## Goals

- Every transaction the system auto-categorizes and auto-approves **from now on**
  requires a lightweight confirm step from the user before it's considered fully
  reviewed — surfaced as a popup on the Pending Alerts page, not buried in the
  backend.
- The popup shows every unconfirmed auto-categorized transaction, not just ones
  since the last visit — nothing gets missed if the user skips a day or two.
- Confirming is fast (one click per transaction if the category's right) but also
  lets them fix the category inline if it's wrong, without leaving the popup.
- Correcting a category here teaches the merchant-rule system the same way
  correcting it anywhere else in the app already does — one learning pathway, not
  two.

## Non-goals

- No retroactive confirmation requirement for transactions that already exist
  before this ships — they're backfilled as already-confirmed, so there's no
  first-run popup dumping potentially hundreds of old transactions on the user.
- No confirmation requirement for manually-entered transactions or transactions a
  user already reviewed via the existing Pending Alerts approve/reject flow — only
  the auto-approved-without-review path needs this.
- No changes to the existing pending-approval flow (`approval_status: 'pending'`)
  itself — this is a separate, additional check that only applies to transactions
  that skipped that flow entirely by being auto-approved.
- No push notification or email for unconfirmed categorizations — in-app popup
  only, consistent with how the rest of this app's reminders work (Dashboard
  cards, notification bell).

## Design

### 1. Data model

New nullable column on `transactions`, migration `supabase/007_category_confirmation.sql`:

```sql
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_confirmed_at TIMESTAMPTZ;

-- Backfill: every transaction that exists at migration time is treated as
-- already confirmed, so this feature only applies to categorizations made
-- from this point forward (per explicit product decision — no first-run
-- popup dumping the entire historical backlog on the user).
UPDATE public.transactions SET category_confirmed_at = now() WHERE category_confirmed_at IS NULL;
```

Semantics going forward:
- `category_confirmed_at` is `NULL` **only** for transactions inserted with
  `approval_status: 'approved'` by the auto-approval path in `emailScanner.ts`
  (the `confidence >= 70/80` + rule-match branches already in that file). Every
  other insert path (manual entry via `ExpenseForm.tsx`, an email-parsed
  transaction landing as `'pending'`, an explicit approve/reject via Pending
  Alerts) sets `category_confirmed_at = now()` at insert/update time — they never
  needed a silent-auto-approval confirmation in the first place.
- Once a user confirms (or corrects) a transaction in the new popup,
  `category_confirmed_at` is set to `now()` and it never appears in the popup
  again.

This is simpler and cheaper to query than inferring "was this auto-categorized
without review" from `confidence_score`/`matchReason` at read time — those aren't
reliably persisted today, and a dedicated timestamp column makes "show me
everything unconfirmed" a plain `IS NULL` filter.

### 2. Insert-time changes

In `src/services/emailScanner.ts`, wherever a transaction is built with
`approval_status: approval_status as 'approved' | 'pending' | 'rejected'` (both the
AI-parse and heuristic-parse branches), add `category_confirmed_at: approval_status
=== 'approved' ? null : new Date().toISOString()` to the inserted row. Every other
transaction-creation path in the app (`ExpenseForm.tsx`'s `createTransaction` call,
`PendingPage.tsx`'s approve action) continues to implicitly get `now()` — simplest
way to guarantee that: the DB column defaults to `now()` (`DEFAULT now()`) rather
than `NULL`, and only the two auto-approval call sites in `emailScanner.ts`
explicitly pass `null`. This means no other file in the codebase needs to change.

### 3. Popup UI

In `src/pages/PendingPage.tsx`, add a fetch on mount (alongside the existing
pending-transactions fetch) for `transactions` where `category_confirmed_at IS
NULL` for the current user. If the result is non-empty, open a new modal
(`ConfirmCategorizationModal`, following the existing `Modal` component pattern
already used elsewhere in this codebase) automatically — no extra click needed to
discover it, since Pending Alerts is already the page dedicated to "things needing
your review."

The modal lists each unconfirmed transaction as a row: merchant name, amount, date,
and a `Select` (reusing `src/components/ui/Select`) pre-filled with the
auto-assigned category, using the same `CATEGORIES` constant and options list
`ExpenseForm.tsx` already uses. Each row has a single "Confirm" button:
- If the category dropdown is unchanged, confirming just sets
  `category_confirmed_at = now()` on that transaction.
- If the user picked a different category before confirming, it updates both
  `category` and `category_confirmed_at`, and calls the same merchant-rule
  learning path `ExpenseForm.tsx` already uses on edit (`saveMerchantRule` +
  `saveMerchantRuleToDb`) so the correction improves future auto-categorization
  for that merchant — one learning pathway, not a second one specific to this
  modal.

Confirmed rows are removed from the modal's list immediately (optimistic UI); the
modal closes itself once the list is empty. A user can also close the modal without
confirming everything — it simply reopens next time they load Pending Alerts, since
unconfirmed rows persist in the DB until acted on.

### 4. Testing

- Unit test for the `emailScanner.ts` insert-time change: auto-approved
  transactions get `category_confirmed_at: null`, all other approval statuses get
  a timestamp.
- Unit test for the confirm action: confirming without changing category only
  touches `category_confirmed_at`; confirming after changing category updates
  `category` + `category_confirmed_at` + triggers the merchant-rule save.
- Manual verification: run the migration locally, seed an auto-approved
  transaction, confirm the popup appears on Pending Alerts and disappears once
  confirmed.
