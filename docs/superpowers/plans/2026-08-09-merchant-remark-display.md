# Merchant / Remark Display Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop raw bank narration (`transactions.description`) from being displayed as a merchant name, and present merchant + remark together wherever a remark is shown.

**Architecture:** One pure resolver (`resolveTransactionIdentity`) decides the display title and remark for a transaction, using the existing `normalizeMerchant()` service to recover a real brand name from narration when `merchant` is blank, falling back to `'Unclassified'` otherwise. One presentational component (`TransactionIdentity`) renders the resulting two-line stack. Both are wired into every transaction list: Top Merchants (aggregation), drill-down modal, dashboard category modal, expense list, and the pending-review merchant badge.

**Tech Stack:** React 19 + TypeScript, Vitest, existing `@/services/merchantNormalizer`, Tailwind.

---

## Task 1: `resolveTransactionIdentity` resolver

**Files:**
- Create: `src/utils/transactionIdentity.ts`
- Create: `src/utils/transactionIdentity.test.ts`
- Modify: `src/utils/index.ts:369-370` (add re-export)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/utils/transactionIdentity.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTransactionIdentity } from './transactionIdentity'

describe('resolveTransactionIdentity', () => {
  it('uses the merchant as title when present, description as remark', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'UPI/4412/SWIGGY-ORDER-BLR' }))
      .toEqual({ title: 'Swiggy', remark: 'UPI/4412/SWIGGY-ORDER-BLR' })
  })

  it('recovers a known brand from description when merchant is blank', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: 'UPI/4412/SWIGGY-ORDER-BLR' }))
      .toEqual({ title: 'Swiggy', remark: 'UPI/4412/SWIGGY-ORDER-BLR' })
  })

  it('recovers a known brand from description when merchant is empty string', () => {
    expect(resolveTransactionIdentity({ merchant: '', description: 'NEFT/AMAZON PAY INDIA/REF123' }))
      .toEqual({ title: 'Amazon', remark: 'NEFT/AMAZON PAY INDIA/REF123' })
  })

  it('falls back to Unclassified when merchant is blank and description matches no known brand', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: 'IMPS/998877/JOHN DOE/SBI' }))
      .toEqual({ title: 'Unclassified', remark: 'IMPS/998877/JOHN DOE/SBI' })
  })

  it('falls back to Unclassified when both merchant and description are blank', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: null }))
      .toEqual({ title: 'Unclassified', remark: '' })
  })

  it('blanks the remark when it equals the title (case-insensitive)', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'swiggy' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('blanks the remark when it matches the "{title} Transaction" shape', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Swiggy Transaction' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('blanks the remark for known noise patterns', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Auto-Parsed from email' }).remark).toBe('')
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Auto Detected transaction' }).remark).toBe('')
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Bank Transaction' }).remark).toBe('')
  })

  it('leaves the remark blank when description is blank', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: '' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('trims whitespace-only merchant and description', () => {
    expect(resolveTransactionIdentity({ merchant: '   ', description: '   ' }))
      .toEqual({ title: 'Unclassified', remark: '' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/transactionIdentity.test.ts`
Expected: FAIL — `Cannot find module './transactionIdentity'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/transactionIdentity.ts
import { normalizeMerchant } from '@/services/merchantNormalizer'

export interface ResolvedTransactionIdentity {
  /** What to show as the primary/bold label — never raw narration text. */
  title: string
  /** Secondary line — '' when there's nothing worth showing. */
  remark: string
}

const NOISE_PATTERNS = [/auto-parsed/i, /auto detected/i, /bank transaction/i]

/**
 * Resolves what to display for a transaction's identity (title) and its
 * supporting remark (raw narration), so raw bank narration never gets
 * displayed as if it were a merchant name.
 */
export function resolveTransactionIdentity(txn: {
  merchant?: string | null
  description?: string | null
}): ResolvedTransactionIdentity {
  const merchant = (txn.merchant || '').trim()
  const description = (txn.description || '').trim()

  let title = merchant
  if (!title && description) {
    const normalized = normalizeMerchant(description)
    if (normalized.isKnown) {
      title = normalized.canonical
    }
  }
  if (!title) {
    title = 'Unclassified'
  }

  let remark = description
  const lowerRemark = remark.toLowerCase()
  const lowerTitle = title.toLowerCase()
  if (
    !remark ||
    lowerRemark === lowerTitle ||
    lowerRemark === `${lowerTitle} transaction` ||
    NOISE_PATTERNS.some((pattern) => pattern.test(remark))
  ) {
    remark = ''
  }

  return { title, remark }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/transactionIdentity.test.ts`
Expected: PASS — all 10 tests green

- [ ] **Step 5: Re-export from the utils barrel**

In `src/utils/index.ts`, after the existing dateFilter re-export at the end of the file:

```typescript
export { resolveTransactionIdentity, type ResolvedTransactionIdentity } from './transactionIdentity'
```

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no existing test touches this new file

- [ ] **Step 7: Commit**

```bash
git add src/utils/transactionIdentity.ts src/utils/transactionIdentity.test.ts src/utils/index.ts
git commit -m "feat: add resolveTransactionIdentity to separate merchant title from narration remark"
```

---

## Task 2: `TransactionIdentity` display component

**Files:**
- Create: `src/components/ui/TransactionIdentity.tsx`
- Modify: `src/components/ui/index.ts`

- [ ] **Step 1: Write the component**

No test file for this task — it's a thin presentational wrapper with no branching logic beyond a null-check, consistent with other simple UI components in this directory (e.g. `Badge.tsx`) which also have no dedicated test file.

```tsx
// src/components/ui/TransactionIdentity.tsx
// ============================================
// TransactionIdentity — merchant title + remark,
// two-line stack. Never renders raw narration as
// a merchant name; remark is omitted when empty.
// ============================================

import { cn } from '@/utils'

interface TransactionIdentityProps {
  title: string
  remark: string
  size?: 'sm' | 'md'
  className?: string
}

const titleStyles: Record<'sm' | 'md', string> = {
  sm: 'text-xs font-semibold',
  md: 'text-sm font-bold',
}

const remarkStyles: Record<'sm' | 'md', string> = {
  sm: 'text-xs',
  md: 'text-xs',
}

export default function TransactionIdentity({ title, remark, size = 'md', className }: TransactionIdentityProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn(titleStyles[size], 'text-zinc-200 truncate')} title={title}>
        {title}
      </p>
      {remark && (
        <p className={cn(remarkStyles[size], 'text-zinc-500 truncate mt-0.5')} title={remark}>
          {remark}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Export it from the ui barrel**

In `src/components/ui/index.ts`, add alongside the other exports:

```typescript
export { default as TransactionIdentity } from './TransactionIdentity'
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/TransactionIdentity.tsx src/components/ui/index.ts
git commit -m "feat: add TransactionIdentity component for merchant title + remark display"
```

---

## Task 3: Top Merchants aggregation (`AnalyticsPage.tsx`)

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx:417-438`
- Create: `src/pages/AnalyticsPage.test.ts`

The `merchantLeaderboard` memo currently groups by `merchant || description || 'Unknown'`, so raw narration text creates its own leaderboard rows. Extract the grouping into a standalone, exported pure function (matching the existing pattern of `removeSavedRow` in `DrillDownModal.tsx`) so it's testable without rendering the page, then use it from the memo.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/pages/AnalyticsPage.test.ts
import { describe, it, expect } from 'vitest'
import { buildMerchantLeaderboard } from './AnalyticsPage'

describe('buildMerchantLeaderboard', () => {
  it('groups a known-brand narration under its real merchant total', () => {
    const result = buildMerchantLeaderboard([
      { type: 'debit', date: '2026-08-01', amount: 200, merchant: 'Swiggy', description: 'Swiggy order' },
      { type: 'debit', date: '2026-08-02', amount: 300, merchant: null, description: 'UPI/4412/SWIGGY-ORDER-BLR' },
    ])
    expect(result).toEqual([{ merchant: 'Swiggy', amount: 500, count: 2 }])
  })

  it('groups unrecognized narrations under a single Unclassified row', () => {
    const result = buildMerchantLeaderboard([
      { type: 'debit', date: '2026-08-01', amount: 100, merchant: null, description: 'IMPS/1/JOHN DOE' },
      { type: 'debit', date: '2026-08-02', amount: 150, merchant: null, description: 'NEFT/2/JANE DOE' },
    ])
    expect(result).toEqual([{ merchant: 'Unclassified', amount: 250, count: 2 }])
  })

  it('excludes credit transactions and rows outside the date range', () => {
    const result = buildMerchantLeaderboard([
      { type: 'credit', date: '2026-08-01', amount: 500, merchant: 'Salary', description: '' },
      { type: 'debit', date: '2026-01-01', amount: 100, merchant: 'Amazon', description: '' },
      { type: 'debit', date: '2026-08-05', amount: 200, merchant: 'Amazon', description: '' },
    ], { startStr: '2026-08-01', endStr: '2026-08-31' })
    expect(result).toEqual([{ merchant: 'Amazon', amount: 200, count: 1 }])
  })

  it('sorts by amount descending and caps at 8 rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      type: 'debit' as const,
      date: '2026-08-01',
      amount: i + 1,
      merchant: `Merchant${i}`,
      description: '',
    }))
    const result = buildMerchantLeaderboard(rows)
    expect(result).toHaveLength(8)
    expect(result[0]).toEqual({ merchant: 'Merchant9', amount: 10, count: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/AnalyticsPage.test.ts`
Expected: FAIL — `buildMerchantLeaderboard` is not exported from `./AnalyticsPage`

- [ ] **Step 3: Extract and export the pure function, then use it in the memo**

Replace `src/pages/AnalyticsPage.tsx:417-438` (the `merchantLeaderboard` comment + memo) with:

```typescript
  /** Pure: groups debit transactions in [startStr, endStr] by resolved merchant identity. Extracted so it's testable without rendering the page. Defaults to the full range when no bounds are passed (used by the memo below, which always passes explicit bounds). */
  export function buildMerchantLeaderboard(
    txns: Array<{ type: string; date: string | null; amount: number; merchant?: string | null; description?: string | null }>,
    bounds?: { startStr: string; endStr: string }
  ): MerchantLeaderboardItem[] {
    const merchantMap = new Map<string, { amount: number; count: number }>()
    txns
      .filter((t) => {
        if (t.type !== 'debit' || !t.date) return false
        if (!bounds) return true
        return t.date >= bounds.startStr && t.date <= bounds.endStr
      })
      .forEach((t) => {
        const { title } = resolveTransactionIdentity(t)
        const existing = merchantMap.get(title) || { amount: 0, count: 0 }
        merchantMap.set(title, { amount: existing.amount + Number(t.amount), count: existing.count + 1 })
      })

    return Array.from(merchantMap.entries())
      .map(([merchant, { amount, count }]) => ({ merchant, amount, count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
  }

  // Top merchants by spend for the selected range — recognized brands hiding
  // in raw narration are folded into their real merchant's total; anything
  // else collapses into a single "Unclassified" row instead of leaking
  // narration text into the ranking.
  const merchantLeaderboard = useMemo<MerchantLeaderboardItem[]>(() => {
    const { start, end } = getRangeDates(range)
    return buildMerchantLeaderboard(expenseTransactions, {
      startStr: toISODateLocal(start),
      endStr: toISODateLocal(end),
    })
  }, [expenseTransactions, range])
```

Note: `buildMerchantLeaderboard` must be a top-level exported function (not nested inside the component), since it's imported directly by the test file. Place it just above the `AnalyticsPage` component function, not inside it.

Add the import at the top of `src/pages/AnalyticsPage.tsx` (near the other `@/utils` import on line 13):

```typescript
import { resolveTransactionIdentity } from '@/utils'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/AnalyticsPage.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/AnalyticsPage.tsx src/pages/AnalyticsPage.test.ts
git commit -m "fix: Top Merchants folds recognized narration into real merchants, buckets the rest as Unclassified"
```

---

## Task 4: Drill-down modal transaction title

**Files:**
- Modify: `src/pages/analytics/DrillDownModal.tsx:113-115,122`

The transaction title currently falls back to raw `txn.description`. Swap to the resolver and render both lines with `TransactionIdentity`.

- [ ] **Step 1: Update imports**

In `src/pages/analytics/DrillDownModal.tsx`, change line 2 from:

```typescript
import { Modal, Button, EmptyState } from '@/components/ui'
```

to:

```typescript
import { Modal, Button, EmptyState, TransactionIdentity } from '@/components/ui'
```

Add to the existing `@/utils` import — there isn't one yet in this file (it currently imports `formatCurrency, formatDate` from `@/utils` on line 5). Update line 5 from:

```typescript
import { formatCurrency, formatDate } from '@/utils'
```

to:

```typescript
import { formatCurrency, formatDate, resolveTransactionIdentity } from '@/utils'
```

- [ ] **Step 2: Replace the title block**

Replace lines 111-126 (the row `<div>` for a non-editing transaction) — specifically the title paragraph at lines 113-115 and the aria-label at line 122 — with the block below. `{formatDate(txn.date)} · {txn.category}` stays as its own line beneath `TransactionIdentity` so date/category context isn't lost:

```tsx
            ) : (
              <div key={txn.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-1 p-3">
                <div className="min-w-0 flex-1">
                  <TransactionIdentity {...resolveTransactionIdentity(txn)} size="sm" />
                  <p className="text-xs text-zinc-500 mt-0.5">{formatDate(txn.date)} · {txn.category}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-bold ${txn.type === 'credit' ? 'text-[var(--status-positive-text)]' : 'text-zinc-200'}`}>
                    {formatCurrency(txn.amount)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleEditClick(txn.id)} aria-label={`Edit ${resolveTransactionIdentity(txn).title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
```

- [ ] **Step 3: Run the existing DrillDownModal test to check for regressions**

Run: `npx vitest run src/pages/analytics/DrillDownModal.test.ts`
Expected: PASS — that test only covers `removeSavedRow`, unaffected by this change

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/analytics/DrillDownModal.tsx
git commit -m "fix: drill-down modal never shows raw narration as the transaction title"
```

---

## Task 5: Dashboard category modal

**Files:**
- Modify: `src/pages/DashboardPage.tsx:49,1255-1267`

- [ ] **Step 1: Update imports**

In `src/pages/DashboardPage.tsx`, line 49 currently reads:

```typescript
import { formatCurrency, formatCurrencyCompact, getCurrentMonth, formatDate, withTimeout, resolveDateFilter, formatDateFilterLabel, getMonthsInRange, type DateFilter } from '@/utils'
```

Change to:

```typescript
import { formatCurrency, formatCurrencyCompact, getCurrentMonth, formatDate, withTimeout, resolveDateFilter, formatDateFilterLabel, getMonthsInRange, resolveTransactionIdentity, type DateFilter } from '@/utils'
```

Line 9 currently reads:

```typescript
import { Card, Button, EmptyState, Modal, DateFilterPicker } from '@/components/ui'
```

Change to:

```typescript
import { Card, Button, EmptyState, Modal, DateFilterPicker, TransactionIdentity } from '@/components/ui'
```

- [ ] **Step 2: Replace the category-modal row title**

Replace the block at `src/pages/DashboardPage.tsx:1255-1267` (currently):

```tsx
                    {categoryTransactions.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between py-3">
                        <div className="flex flex-col min-w-0 pr-3">
                          <p className="text-xs font-bold text-zinc-200 truncate" title={txn.merchant || txn.description || 'Transaction'}>
                            {txn.merchant || txn.description || 'Transaction'}
                          </p>
                          {txn.description && txn.description !== `${txn.merchant} Transaction` && (
                            <p className="text-xs text-zinc-500 truncate mt-0.5">{txn.description}</p>
                          )}
                          <span className="text-xs text-zinc-500 mt-1">
```

with:

```tsx
                    {categoryTransactions.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between py-3">
                        <div className="flex flex-col min-w-0 pr-3">
                          <TransactionIdentity {...resolveTransactionIdentity(txn)} size="sm" />
                          <span className="text-xs text-zinc-500 mt-1">
```

(Leave the rest of that block — the date formatting through the closing tags — unchanged; only the title/description paragraphs are replaced by the single `TransactionIdentity` line.)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Manually verify in the browser**

Start the dev server, open the Dashboard, click into a category's spending to open the modal, and confirm: transactions with a merchant show the merchant name bold with narration below it in muted text; transactions with no merchant show either a recovered brand name or "Unclassified" — never raw narration as the bold title.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "fix: dashboard category modal never shows raw narration as the transaction title"
```

---

## Task 6: Expense list rows

**Files:**
- Modify: `src/components/expenses/ExpenseList.tsx:6,200-204`

This is the scope-widening case: `ExpenseList` currently never shows `merchant` at all (title is `description || cat.label`). It now shows merchant-primary / description-secondary, consistent with every other list.

- [ ] **Step 1: Update imports**

Line 6 currently:

```typescript
import { Card, Badge, Button, EmptyState, ConfirmDialog } from '@/components/ui'
```

Change to:

```typescript
import { Card, Badge, Button, EmptyState, ConfirmDialog, TransactionIdentity } from '@/components/ui'
```

Line 8 currently:

```typescript
import { formatCurrency, formatDate } from '@/utils'
```

Change to:

```typescript
import { formatCurrency, formatDate, resolveTransactionIdentity } from '@/utils'
```

- [ ] **Step 2: Replace the row title**

Inside the `transactions.map((txn) => { ... })` block, replace lines 200-204:

```tsx
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {txn.description || cat.label}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
```

with:

```tsx
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <TransactionIdentity {...resolveTransactionIdentity(txn)} size="md" />
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
```

This drops the `cat.label` fallback for the primary title (now `'Unclassified'` when there's no merchant and no recognizable narration) — the category is still visible immediately below via the existing `<Badge>{cat.label}</Badge>`, so category context isn't lost, just no longer duplicated into the title slot.

Update the two `aria-label`s in the same map block that reference `txn.description || cat.label` (lines 188, 238, 249 — the checkbox, edit button, and delete button labels) to use the resolved title instead. Add this line right after `const isDebit = txn.type === 'debit'` inside the map callback:

```typescript
          const isDebit = txn.type === 'debit'
          const { title: txnTitle } = resolveTransactionIdentity(txn)
```

Then change:
- `aria-label={\`Select transaction ${txn.description || cat.label}\`}` → `aria-label={\`Select transaction ${txnTitle}\`}`
- `aria-label={\`Edit ${txn.description || cat.label}\`}` → `aria-label={\`Edit ${txnTitle}\`}`
- `aria-label={\`Delete ${txn.description || cat.label}\`}` → `aria-label={\`Delete ${txnTitle}\`}`

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Manually verify in the browser**

Start the dev server, open the Expenses page, and confirm each row shows the merchant name (or "Unclassified") bold, with the narration/remark muted underneath when present, and the category badge still visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/expenses/ExpenseList.tsx
git commit -m "feat: expense list shows merchant name with narration as a secondary remark"
```

---

## Task 7: Pending-review merchant badge

**Files:**
- Modify: `src/pages/PendingPage.tsx:1145-1148`

The merchant badge currently falls back to `parseShortDescription(...)` — a keyword-guessing helper meant for auto-categorization suggestions, not display. Swap the fallback to the resolver's title, which is either the real merchant, a recovered known brand, or `'Unclassified'`.

- [ ] **Step 1: Update imports**

Find the existing `@/utils` import in `src/pages/PendingPage.tsx` and add `resolveTransactionIdentity` to it (follow whatever names are already destructured there — add `resolveTransactionIdentity` to that same import list).

- [ ] **Step 2: Replace the badge fallback**

Replace:

```tsx
                        <Badge variant="warning" className="truncate max-w-[150px] whitespace-nowrap font-bold flex items-center gap-1" title={txn.merchant || ''}>
                          <Store className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>{txn.merchant || parseShortDescription(txn.description || '', '', '')}</span>
                        </Badge>
```

with:

```tsx
                        <Badge variant="warning" className="truncate max-w-[150px] whitespace-nowrap font-bold flex items-center gap-1" title={resolveTransactionIdentity(txn).title}>
                          <Store className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>{resolveTransactionIdentity(txn).title}</span>
                        </Badge>
```

Leave the description detail chip (the `FileText` chip using `localFields.description || parseShortDescription(...)`) and the `applyMerchantRules` confidence logic untouched — those are auto-categorization suggestion surfaces, out of scope for this display fix.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Manually verify in the browser**

Start the dev server, open Pending Review with at least one merchant-less transaction in the queue, and confirm the amber merchant badge shows a recovered brand name or "Unclassified" instead of guessed narration text.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PendingPage.tsx
git commit -m "fix: pending-review merchant badge never shows guessed narration text"
```

---

## Task 8: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file green, including the new `transactionIdentity.test.ts` and `AnalyticsPage.test.ts`

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS — no new lint errors introduced

- [ ] **Step 3: Run the TypeScript build check**

Run: `npx tsc -b`
Expected: PASS — no type errors across the modified files
