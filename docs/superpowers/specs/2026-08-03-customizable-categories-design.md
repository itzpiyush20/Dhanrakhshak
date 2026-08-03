# Customizable Categories — Design

## Summary

Replace the current hardcoded, global list of 19 expense/income categories with a fully user-owned, editable system. Every user gets their own set of categories (seeded from today's 19 defaults), and can rename, recolor, delete, or create categories freely — including the original 19. As part of this work, the existing automatic merchant-rule "learning" system is also reworked: rule creation becomes an explicit user action instead of a silent side effect of saving/approving transactions.

## Background

Today, categories are a hardcoded TypeScript union (`ExpenseCategory`, `src/types/index.ts:27-47`) with metadata (label/emoji/color) in `src/constants/index.ts:8-29`. A second, independently maintained subset lives in `src/pages/BudgetsPage.tsx:19-45` (`BUDGET_ELIGIBLE_CATEGORIES`). The database column for category (`transactions.category`, `budgets.category`, `merchant_rules.preferred_category`) is already plain `TEXT` with no enum or CHECK constraint — the fixed list is enforced only by the frontend TypeScript type. There is no per-user scoping of categories today; every user sees the identical list.

Separately, `src/services/learningEngine.ts` silently creates/updates rows in `merchant_rules` as a side effect of normal transaction editing (`ExpenseForm.tsx:147`), pending-transaction approval (`PendingPage.tsx:360-363`), and can cause email-scanned transactions to be auto-approved without user review (`emailScanner.ts:1013,1231`) based on a confidence heuristic. A partial "Merchant Rules" management UI already exists in `SettingsPage.tsx` (view/edit/delete/manual-add) but does not control the automatic side-effect creation, and rules have no income/expense type field.

## Goals

- Every user can create, rename, and delete any category, including the original 19 defaults.
- Categories are tagged with a type (income/expense) and an independent "budget-eligible" flag.
- Existing transactions, budgets, analytics, subscriptions, and filters continue to work without disruption.
- Merchant-rule creation becomes explicit/opt-in; no rule is ever created as a silent side effect.
- Email-scanned transactions still benefit from existing rules as category suggestions, but always land in Pending for user approval — never auto-approved.

## Non-Goals

- No subcategories (not in scope).
- No AI suggestion of brand-new categories (AI/auto-categorization stays scoped to picking from the user's existing category list).
- No change to how transactions store their category (stays plain `TEXT`, no foreign key).

## Data Model

New table `categories`, following the existing per-user + RLS pattern used throughout the schema:

```sql
categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  budget_eligible BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_permanent BOOLEAN NOT NULL DEFAULT false,  -- true only for "Other"; blocks deletion
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
)
```

- `transactions.category`, `budgets.category`, and `merchant_rules.preferred_category` remain plain `TEXT`, unchanged. Validity is enforced in application code against the user's `categories` rows, not via a DB foreign key.
- `is_default` is cosmetic only (shows a "default" badge on the original 19); it does not restrict editing or deletion.
- `is_permanent` is set only on the "Other" category. It can still be renamed and recolored, but delete is disabled in the UI (and rejected at the service layer as a backstop).
- `budget_eligible` is an independent flag, not derived from `type`, because some expense-type categories (e.g. Insurance, Credit Card Bill Payment, Transfers) are intentionally excluded from budgeting today.
- Renaming a category to a name that collides with an existing category (for that user) is rejected — enforced by the `UNIQUE (user_id, name)` constraint and mirrored with inline validation in the UI. This applies uniformly to category renames and to the category field on merchant rules.

### Seeding

- New signups: a `handle_new_user` hook (or equivalent app-level bootstrap) inserts the current 19 default categories (name/emoji/color/type/budget_eligible copied from today's `CATEGORIES` + `BUDGET_ELIGIBLE_CATEGORIES` constants), with `is_default = true`, and `is_permanent = true` for "Other" only.
- Existing users: a one-time, idempotent backfill migration inserts the same 19 rows for every existing `profiles.id` that doesn't already have categories.

## Affected Systems

- **Expense form** (`ExpenseForm.tsx`): category picker now sources options from the user's `categories` table instead of the static `CATEGORIES` constant.
- **Budgets** (`BudgetsPage.tsx`): the duplicated `BUDGET_ELIGIBLE_CATEGORIES` array is removed; the budget category dropdown filters the user's categories by `type = 'expense' AND budget_eligible = true`.
- **Filters / lists** (`ExpensesPage.tsx`, `ExpenseList.tsx`): category filter dropdown sources from the same dynamic list.
- **Analytics** (`CategoryIcon.tsx`, `ExpenseBreakdown.tsx`, `AnalyticsPage.tsx`, `services/analytics.ts`, `services/transactions.ts` `getSummary`): color/emoji lookups switch from the static `CATEGORIES` object to a fetched map keyed by category name.
- **Subscriptions / Dashboard widgets** (`ActiveSubscriptionsWidget.tsx`, `SubscriptionsPage.tsx`, `QuickAddWidget.tsx`): read from the dynamic category list.
- **AI categorization** (`aiService.ts`): the Gemini prompt is built dynamically per-user from their current category list; the AI never suggests categories outside that list.
- **Merchant rules** (`learningEngine.ts`, `merchantNormalizer.ts`, `SettingsPage.tsx`, `emailScanner.ts`): see below.

## Merchant Rules Rework

- Remove automatic rule creation/update side effects:
  - `ExpenseForm.tsx:147` no longer calls `saveMerchantRuleToDb` automatically on transaction save.
  - `PendingPage.tsx:360-363` no longer auto-creates a rule on approval. Instead, after approving a pending transaction, an optional one-click affordance is shown: "Always categorize [Merchant] as [Category] →" — clicking it explicitly creates the rule.
  - `emailScanner.ts` no longer auto-approves transactions based on rule confidence (`auto_approve`/`confidence`/`times_confirmed` heuristic removed from the approval decision). It still calls `applyMerchantRulesFromDB` to pre-fill a suggested category, but every scanned transaction lands in Pending for the user to review and approve there (individually or in bulk) — never skipping Pending.
- Extend the existing Settings → Merchant Rules UI (`SettingsPage.tsx`) with a **type** field (income/expense) per rule, alongside the existing category selector, view/edit/delete, and manual "add rule" action.
- Rule category assignment is subject to the same duplicate/validity rules as categories generally (must reference a category that exists for that user).

## UI/UX Flow

**Manage Categories** (new section under Settings):
- List of the user's categories grouped by type (Income / Expense); each row shows emoji, name, color swatch, and a "Budget-eligible" badge where applicable.
- Each row has Edit and Delete icon-buttons, except "Other" which shows Edit only (delete disabled).
- Edit opens a form: name (text, validated against duplicates), emoji (curated picker grid), color (curated swatch palette), type (income/expense toggle), budget-eligible (on/off switch, shown only for expense type).
- Delete opens a confirm dialog stating how many transactions/budgets will be reassigned: "Delete '[Category]'? N transactions and M budgets using it will be moved to 'Other'." On confirm, reassignment happens and a toast confirms: "Deleted. N transactions moved to Other."
- "+ New Category" opens the same form, blank.

**Merchant Rules** (existing Settings section, extended):
- Existing view/edit/delete/manual-add UI retained.
- Add income/expense type field per rule.
- Post-approval opt-in "Always categorize as..." affordance on the Pending page (see above).

## Error Handling & Edge Cases

- Duplicate category name (create or rename): inline validation error; DB unique constraint as backstop.
- Deleting "Other": disabled in the UI; rejected at the service layer if attempted directly.
- Deleting a category with zero usages: plain confirm, no reassignment messaging needed.
- Migration for existing users: idempotent backfill, safe to re-run.
- Email-scanned transaction whose suggested category no longer exists (e.g. deleted after the scan queued): falls back to "Other" before surfacing in Pending.
- Analytics defensive fallback: if a transaction ever references a category absent from the current list, render with a neutral default color/icon rather than failing.

## Testing Plan

- Unit tests: category CRUD service functions, duplicate-name validation, delete-reassignment logic, and updated `learningEngine.test.ts` asserting no automatic rule creation from `ExpenseForm`/`PendingPage`.
- Manual browser verification: create/rename/delete categories (including reassignment + toast), confirm Budgets page reflects the dynamic list and respects `budget_eligible`, confirm Analytics charts still color/label correctly, confirm Settings → Merchant Rules add/edit/delete plus the new type field, run a mock email scan and confirm suggestions land in Pending without auto-approval.
- Full regression pass on the existing test suite; the TypeScript compiler will surface most remaining references to the old static `ExpenseCategory` type once it's replaced with a dynamic/string-based model.
