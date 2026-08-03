# Customizable Categories — Design

## Summary

Replace the current hardcoded, global list of 19 expense/income categories with a fully user-owned, editable system. Every user gets their own set of categories (seeded from today's 19 defaults), and can rename, recolor, delete, or create categories freely — including the original 19. As part of this work, the existing automatic merchant-rule "learning" system is also reworked: rule creation becomes an explicit user action instead of a silent side effect of saving/approving transactions.

## Background

Today, categories are a hardcoded TypeScript union (`ExpenseCategory`, `src/types/index.ts:27-47`) with metadata (label/emoji/color) in `src/constants/index.ts:8-29`. A second, independently maintained subset lives in `src/pages/BudgetsPage.tsx:19-45` (`BUDGET_ELIGIBLE_CATEGORIES`). The database column for category (`transactions.category`, `budgets.category`, `merchant_rules.preferred_category`) is already plain `TEXT` with no enum or CHECK constraint — the fixed list is enforced only by the frontend TypeScript type. Stored values are the category *keys* (`food`, `credit_card_bill_payment`), while display labels ("Food & Dining") live only in the frontend constants. There is no per-user scoping of categories today; every user sees the identical list.

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
- No foreign-key relationship from transactions to categories (category stays denormalized text; see Category Identity).

## Category Identity

The category **name is the single identity**. There is no separate key/slug column. Transactions, budgets, and merchant rules store the category's display name as plain text, and that text is kept in sync by cascade updates on rename (see Rename Cascade).

This requires a one-time data migration, because existing rows store the old slug-style keys (`food`, `credit_card_bill_payment`) rather than display names:

- The backfill migration that seeds each existing user's `categories` rows **also** rewrites all existing `transactions.category`, `budgets.category`, and `merchant_rules.preferred_category` values from old keys to display names (`food` → `Food & Dining`, `credit_card_bill_payment` → `Credit Card Bill Payment`, etc.), for every user, in the same migration.
- The migration is idempotent: seeding skips users who already have categories, and the key→name rewrite only matches the 19 known legacy keys, so re-running is a no-op.
- After migration, all stored category text is human-readable and matches a `categories.name` row exactly.

The DB column default `transactions.category DEFAULT 'other'` is updated to `'Other'` to match.

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

- `transactions.category`, `budgets.category`, and `merchant_rules.preferred_category` remain plain `TEXT` (now holding display names). Validity is enforced in application code against the user's `categories` rows, not via a DB foreign key.
- `is_default` is cosmetic only (shows a "default" badge on the original 19); it does not restrict editing or deletion.
- `is_permanent` is set only on the "Other" category. It can still be renamed and recolored, but delete is disabled in the UI (and rejected at the service layer as a backstop). **All fallback logic locates this category via the `is_permanent` flag — never by the literal string "Other"** — since the user may have renamed it.
- `budget_eligible` is an independent flag, not derived from `type`, because some expense-type categories (e.g. Insurance, Credit Card Bill Payment, Transfers) are intentionally excluded from budgeting today.

### Rename Cascade

Renaming a category updates the name in place everywhere it is referenced:

- A single Postgres RPC (`rename_category(old_name, new_name)`) atomically updates `categories.name` plus all matching `transactions.category`, `budgets.category`, and `merchant_rules.preferred_category` rows for that user in one transaction — a mid-failure can never leave half-renamed data.
- Renaming to a name that already exists for that user is **rejected** (merges are not allowed). Enforced by the `UNIQUE (user_id, name)` constraint inside the RPC's transaction, mirrored with inline validation in the UI. Because merges are blocked, the rename cascade can never violate the budgets `UNIQUE (user_id, category, month)` constraint.
- The same duplicate-name rule applies to category creation and to the category field on merchant rules (a rule must reference a category that exists for that user).

### Delete Behavior

Deleting a category (via confirm dialog — see UI/UX):

- **Transactions** using it are reassigned to the permanent fallback category (the `is_permanent` row).
- **Budgets** for it are **deleted**, not reassigned — reassigning to the fallback could collide with an existing fallback-category budget for the same month (`UNIQUE (user_id, category, month)`), and a budget on "Other" is semantically meaningless anyway.
- **Merchant rules** pointing at it are reassigned to the fallback category (they remain editable in Settings).
- All of the above happens atomically in a single Postgres RPC (`delete_category(name)`).
- The confirm dialog states the impact: "Delete '[Category]'? N transactions will be moved to '[Fallback]'; M budgets will be removed." After completion a toast confirms: "Deleted. N transactions moved to [Fallback]."

### Seeding

- New signups: a `handle_new_user` hook (or equivalent app-level bootstrap) inserts the current 19 default categories (name/emoji/color/type/budget_eligible copied from today's `CATEGORIES` + `BUDGET_ELIGIBLE_CATEGORIES` constants), with `is_default = true`, and `is_permanent = true` for "Other" only.
- Existing users: the one-time backfill migration described in Category Identity (seed rows + key→name rewrite), idempotent and safe to re-run.

## Affected Systems

- **Expense form** (`ExpenseForm.tsx`): category picker now sources options from the user's `categories` table instead of the static `CATEGORIES` constant.
- **Budgets** (`BudgetsPage.tsx`): the duplicated `BUDGET_ELIGIBLE_CATEGORIES` array is removed; the budget category dropdown filters the user's categories by `type = 'expense' AND budget_eligible = true`.
- **Filters / lists** (`ExpensesPage.tsx`, `ExpenseList.tsx`): category filter dropdown sources from the same dynamic list.
- **Analytics** (`CategoryIcon.tsx`, `ExpenseBreakdown.tsx`, `AnalyticsPage.tsx`, `services/analytics.ts`, `services/transactions.ts` `getSummary`): color/emoji lookups switch from the static `CATEGORIES` object to a fetched map keyed by category name.
- **Subscriptions / Dashboard widgets** (`ActiveSubscriptionsWidget.tsx`, `SubscriptionsPage.tsx`, `QuickAddWidget.tsx`): read from the dynamic category list.
- **AI categorization** (`aiService.ts`): the Gemini prompt is built dynamically per-user from their current category list; the AI never suggests categories outside that list.
- **Merchant normalizer** (`merchantNormalizer.ts`): its static `CANONICAL_MAP` default categories (e.g. Swiggy → food) become *suggestions by old key*; when the suggested category doesn't exist in the user's current list, the fallback category is used instead.
- **Merchant rules** (`learningEngine.ts`, `SettingsPage.tsx`, `emailScanner.ts`): see below.

## Merchant Rules Rework

- Remove automatic rule creation/update side effects:
  - `ExpenseForm.tsx:147` no longer calls `saveMerchantRuleToDb` automatically on transaction save.
  - `PendingPage.tsx:360-363` no longer auto-creates a rule on approval. Instead, after approving a pending transaction, an optional one-click affordance is shown: "Always categorize [Merchant] as [Category] →" — clicking it explicitly creates the rule.
  - `emailScanner.ts` no longer auto-approves transactions based on rule confidence (`auto_approve`/`confidence`/`times_confirmed` heuristic removed from the approval decision). It still calls `applyMerchantRulesFromDB` to pre-fill a suggested category, but every scanned transaction lands in Pending for the user to review and approve there (individually or in bulk) — never skipping Pending.
- Extend the existing Settings → Merchant Rules UI (`SettingsPage.tsx`) with a **type** field (income/expense) per rule, alongside the existing category selector, view/edit/delete, and manual "add rule" action.
- Rule category assignment must reference a category that exists for that user; rules pointing at a deleted category are reassigned to the fallback (see Delete Behavior), and the rename cascade keeps them in sync.

## UI/UX Flow

**Manage Categories** (new section under Settings):
- List of the user's categories grouped by type (Income / Expense); each row shows emoji, name, color swatch, a "Budget-eligible" badge where applicable, and a "default" badge on seeded categories.
- Each row has Edit and Delete icon-buttons, except the permanent fallback category which shows Edit only (delete disabled).
- Edit opens a form: name (text, validated against duplicates), emoji (curated picker grid), color (curated swatch palette), type (income/expense toggle), budget-eligible (on/off switch, shown only for expense type).
- Delete opens the confirm dialog described in Delete Behavior; on confirm, the RPC runs and a toast reports the outcome.
- "+ New Category" opens the same form, blank.

**Merchant Rules** (existing Settings section, extended):
- Existing view/edit/delete/manual-add UI retained.
- Add income/expense type field per rule.
- Post-approval opt-in "Always categorize as..." affordance on the Pending page (see above).

## Error Handling & Edge Cases

- Duplicate category name (create or rename): inline validation error; DB unique constraint as backstop.
- Deleting the permanent fallback category: disabled in the UI; rejected at the service layer if attempted directly.
- Deleting a category with zero usages: plain confirm, no impact messaging needed.
- Migration for existing users: idempotent (seed skips already-seeded users; key→name rewrite matches only the 19 legacy keys), safe to re-run.
- Email-scanned transaction whose suggested category no longer exists (e.g. deleted after the scan queued, or a stale `CANONICAL_MAP` key): falls back to the permanent fallback category before surfacing in Pending.
- Analytics defensive fallback: if a transaction ever references a category absent from the current list, render with a neutral default color/icon rather than failing.
- All fallback lookups resolve the `is_permanent` row, never the hardcoded string "Other".

## Testing Plan

- Unit tests: category CRUD service functions, duplicate-name validation, rename-cascade RPC (all three tables updated, atomicity on conflict), delete RPC (transactions reassigned, budgets deleted, rules reassigned), and updated `learningEngine.test.ts` asserting no automatic rule creation from `ExpenseForm`/`PendingPage`.
- Migration test: run the backfill against a copy of existing data; verify every transaction/budget/rule category value matches a `categories.name` row afterward, and that re-running is a no-op.
- Manual browser verification: create/rename/delete categories (including reassignment + toast), confirm Budgets page reflects the dynamic list and respects `budget_eligible`, confirm Analytics charts still color/label correctly, confirm Settings → Merchant Rules add/edit/delete plus the new type field, run a mock email scan and confirm suggestions land in Pending without auto-approval.
- Full regression pass on the existing test suite; the TypeScript compiler will surface most remaining references to the old static `ExpenseCategory` type once it's replaced with a dynamic/string-based model.
