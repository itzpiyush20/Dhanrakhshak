# Returnable Expenses & Insurance Premium Reminders

## Problem

Two everyday money-tracking needs aren't covered today:

1. **Money owed back to the user.** When someone pays for a shared expense (splitting
   a bill, lending cash) expecting to be paid back, there's no way to flag that
   expense as "returnable," track who owes it and by when, or get reminded to ask
   for it. It just looks like a normal, permanent expense.
2. **Insurance premiums.** Life/health insurance premiums are recurring, high-stakes
   payments with hard due dates (a missed payment can lapse a policy). The app has
   no concept of insurance at all — no way to record a policy, its premium, or its
   due date, and no reminder before it's due.

## Goals

- Mark any expense transaction as "returnable" with who owes it and when it's
  expected back; see it prominently on the Dashboard only while it's actually
  relevant (due this month, or overdue) — not for receivables due in a future
  month.
- One tap to record that the money came back: settles the receivable and logs the
  incoming amount as a transaction, so account totals stay accurate without manual
  double entry.
- Record life/health insurance policies (premium, frequency, next due date) in
  Settings; see a reminder on the Dashboard when a premium is due within 7 days or
  overdue; one tap to log the payment and roll the due date forward.
- Both features surface in the existing notification bell using the same 7-day
  window, so there's one consistent place users already check.

## Non-goals

- No push notifications, email, or SMS reminders — in-app only (Dashboard card +
  bell), per user's explicit choice.
- No partial settlement (a receivable is either fully pending or fully received —
  no split/partial payback tracking).
- No insurance provider integrations, no policy document uploads, no premium
  auto-payment.
- Quick-Add stays as-is — returnable marking is only available in the full
  Add/Edit Transaction form, since it needs extra fields (counterparty, expected
  return date) that don't belong in a 5-second entry flow.
- No changes to existing budget/category percentage logic beyond adding one new
  category (`insurance`) to the existing Needs/Wants/Savings grouping.

## Design

### 1. Data model

**`transactions` table — 3 new nullable columns** (migration
`supabase/005_returnables_and_insurance.sql`):

```sql
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_returnable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS counterparty TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS expected_return_date DATE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS return_status TEXT CHECK (return_status IN ('pending', 'received'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS settled_by_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
```

`return_status` is `NULL` for ordinary transactions, `'pending'` the moment a debit
is marked returnable, `'received'` once settled. `settled_by_transaction_id` points
at the credit transaction created when the receivable is marked received — this is
how the Dashboard knows a receivable is already settled without re-deriving it, and
lets a user follow the link from either side.

Existing `notes` column is reused for the "additional details / remarks" the user
asks for — no new column needed there.

**New `insurance_policies` table**, same RLS shape as `budgets`:

```sql
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('life', 'health')),
  premium_amount DECIMAL(12, 2) NOT NULL CHECK (premium_amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'annual')),
  next_due_date DATE NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insurance policies"
  ON public.insurance_policies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own insurance policies"
  ON public.insurance_policies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own insurance policies"
  ON public.insurance_policies FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own insurance policies"
  ON public.insurance_policies FOR DELETE USING (auth.uid() = user_id);
```

**New category**: `insurance` (🛡️) added to `CATEGORIES` in `src/constants/index.ts`
and `ExpenseCategory` in `src/types/index.ts`, grouped into `NEEDS_CATEGORIES` in
`AnalyticsPage.tsx` (a premium is not discretionary spend).

### 2. Returnable expenses

**`ExpenseForm.tsx`** — a "This is money I'll get back" checkbox, shown only when
`type === 'debit'`. Checking it reveals two more fields: **Who owes this** (text,
maps to `counterparty`) and **Expected return date** (date, maps to
`expected_return_date`, defaults to +30 days, must be ≥ transaction date). The
existing **Notes** field (not currently exposed in the form — this is the one place
it gets added) becomes visible at the same time, for the "additional details" the
user wants to attach. On submit, `createTransaction`/`updateTransaction` include
`is_returnable: true, return_status: 'pending', counterparty, expected_return_date,
notes`.

**`src/services/transactions.ts` — new functions:**

```ts
/** Returnable debits due this month or overdue, not yet received */
export async function getActiveReceivables() { /* ... */ }

/** Marks a receivable received: sets return_status + creates the payback credit */
export async function settleReceivable(transactionId: string) { /* ... */ }
```

`getActiveReceivables` queries `is_returnable = true AND return_status = 'pending'
AND expected_return_date <= <end of current month>` (this single condition covers
both "due this month" and "overdue" — anything with a due date on or before the
end of the current month, that isn't yet received, qualifies; a receivable due next
month is excluded until its own month arrives). `settleReceivable` runs both writes
(insert the credit transaction tagged `category: original.category, description:
"Returned by {counterparty}"`, then update the original row's `return_status` and
`settled_by_transaction_id`) and returns an error if either fails, so the caller
can surface a single failure state.

**Dashboard** — new `ReceivablesCard` component, rendered only when
`getActiveReceivables()` returns ≥1 row (otherwise renders nothing — no empty
state clutter). Lists counterparty, amount, due date (color-coded: red if overdue,
amber if due within 7 days, neutral otherwise), the remark if present, and a
"Mark received" button per row that calls `settleReceivable` and refetches.

### 3. Insurance premiums

**Settings page** — new "Insurance Policies" card, same list+form pattern already
used for merchant rules on that page: a compact list of existing policies (name,
type badge, premium, next due date, delete button) plus an inline add form (policy
name, type select, premium amount, frequency select, due date, remarks). New
`src/services/insurance.ts`:

```ts
export async function getInsurancePolicies() { /* select all for user, order by next_due_date */ }
export async function createInsurancePolicy(policy: InsurancePolicyInsert) { /* ... */ }
export async function deleteInsurancePolicy(id: string) { /* ... */ }
export async function markPremiumPaid(id: string) { /* create expense txn + advance next_due_date */ }
```

`markPremiumPaid` creates a `category: 'insurance'` debit transaction for
`premium_amount` dated today, then advances `next_due_date` by one interval
(`frequency`-based: +1 month / +3 months / +6 months / +1 year) and writes that
back — so the reminder naturally disappears until the next cycle.

**Dashboard** — new `InsurancePremiumCard`, same visibility rule as receivables:
renders only when a policy's `next_due_date` is within 7 days or overdue. Shows
policy name, type, premium, due date, "Mark paid" button.

### 4. Notification bell

`AppLayout.tsx`'s existing `fetchNotifications` gets two more sources, added to the
same `items` array with the same `{ message, type }` shape already used for budget
alerts:

```ts
// Receivables due within 7 days (reuses getActiveReceivables, filtered further)
// Insurance premiums due within 7 days (reuses getInsurancePolicies)
```

Overdue items push `type: 'danger'`; due-within-7-days items push `type:
'warning'` — consistent with how budget overage/approach already maps to those two
severities. This reuses the existing 5-minute sessionStorage cache, no new caching
mechanism.

## Testing

- `getActiveReceivables`/`settleReceivable`: unit tests with a mocked Supabase
  client — receivable due this month included, due next month excluded, overdue
  included, already-received excluded; settle creates the credit transaction and
  updates status atomically (both writes verified, error path when either fails).
- `markPremiumPaid`: unit test verifying `next_due_date` advances correctly for
  each frequency and that it creates a transaction in the `insurance` category.
- Manual verification: mark an expense returnable, confirm it appears/disappears
  on Dashboard based on due-month logic; mark received, confirm the credit
  transaction appears in Expenses and the receivable card updates; add an
  insurance policy with a near-term due date, confirm the Dashboard card and bell
  both show it; mark paid, confirm the due date advances and the card/bell clear.
