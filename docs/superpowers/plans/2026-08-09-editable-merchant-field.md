# Editable Merchant Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Merchant` field to `ExpenseForm.tsx` so merchant name can be set or corrected both when adding a transaction manually and when editing an existing one.

**Architecture:** Export the list of known canonical brand names already defined in `merchantNormalizer.ts` as `KNOWN_MERCHANTS`, feed it into a native HTML `<datalist>` attached to a new `Merchant` `Input` in `ExpenseForm.tsx`, and wire the field's state into both the create and update transaction payloads. No database changes — `transactions.merchant` already exists.

**Tech Stack:** React 19 + TypeScript, Vitest, existing `Input` component (`src/components/ui/Input.tsx`).

---

## Task 1: Export `KNOWN_MERCHANTS` from `merchantNormalizer.ts`

**Files:**
- Modify: `src/services/merchantNormalizer.ts:97` (right after the `CANONICAL_MAP` array closes)
- Create: `src/services/merchantNormalizer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/merchantNormalizer.test.ts
import { describe, it, expect } from 'vitest'
import { KNOWN_MERCHANTS, normalizeMerchant } from './merchantNormalizer'

describe('KNOWN_MERCHANTS', () => {
  it('is a non-empty list of strings', () => {
    expect(Array.isArray(KNOWN_MERCHANTS)).toBe(true)
    expect(KNOWN_MERCHANTS.length).toBeGreaterThan(0)
    expect(KNOWN_MERCHANTS.every((m) => typeof m === 'string')).toBe(true)
  })

  it('includes well-known brands', () => {
    expect(KNOWN_MERCHANTS).toContain('Swiggy')
    expect(KNOWN_MERCHANTS).toContain('Amazon')
    expect(KNOWN_MERCHANTS).toContain('Netflix')
  })

  it('has no duplicate entries', () => {
    expect(new Set(KNOWN_MERCHANTS).size).toBe(KNOWN_MERCHANTS.length)
  })

  it('matches every canonical name that normalizeMerchant can return for a known brand', () => {
    // normalizeMerchant('swiggy') resolves through the same CANONICAL_MAP this list is built from
    const swiggy = normalizeMerchant('swiggy order')
    expect(KNOWN_MERCHANTS).toContain(swiggy.canonical)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/merchantNormalizer.test.ts`
Expected: FAIL — `KNOWN_MERCHANTS` is not exported from `./merchantNormalizer`

- [ ] **Step 3: Add the export**

In `src/services/merchantNormalizer.ts`, immediately after the `CANONICAL_MAP` array's closing `]` (currently line 97, right before the `normalizeMerchant` function's docblock), add:

```typescript

/** Flat list of canonical brand names, for autocomplete/suggestion UIs. Derived from CANONICAL_MAP so it can never drift out of sync with what normalizeMerchant() actually recognizes. */
export const KNOWN_MERCHANTS: string[] = CANONICAL_MAP.map((entry) => entry.canonical)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/merchantNormalizer.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/merchantNormalizer.ts src/services/merchantNormalizer.test.ts
git commit -m "feat: export KNOWN_MERCHANTS list from merchantNormalizer"
```

---

## Task 2: Add the Merchant field to `ExpenseForm.tsx`

**Files:**
- Modify: `src/components/expenses/ExpenseForm.tsx`

This task depends on Task 1 (`KNOWN_MERCHANTS`) being committed first.

- [ ] **Step 1: Add the import**

In `src/components/expenses/ExpenseForm.tsx`, the current imports at the top of the file read:

```typescript
import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'
import Select from '@/components/ui/Select'
import { useCategories } from '@/context/CategoriesContext'
import { useAuth } from '@/context/AuthContext'
import { createTransaction, updateTransaction } from '@/services'
import type { Database } from '@/types/database'
```

Add one import line after the `Database` type import:

```typescript
import { KNOWN_MERCHANTS } from '@/services/merchantNormalizer'
```

- [ ] **Step 2: Add merchant state**

Find the block of `useState` declarations (currently lines 40-58, starting with `const [type, ...]` and ending with `const [error, setError] = useState('')`). Add a new state line right after the `description` state:

```typescript
  const [description, setDescription] = useState(editingTransaction?.description || '')
  const [merchant, setMerchant] = useState(editingTransaction?.merchant || '')
```

- [ ] **Step 3: Include merchant in the update payload**

Find the `updateTransaction` call inside `handleSubmit` (currently around lines 84-99):

```typescript
      const { error } = await updateTransaction(editingTransaction.id, {
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        date,
        tags,
```

Add `merchant: merchant.trim() || null,` right after `description,`:

```typescript
      const { error } = await updateTransaction(editingTransaction.id, {
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        merchant: merchant.trim() || null,
        date,
        tags,
```

- [ ] **Step 4: Include merchant in the create payload**

Find the `createTransaction` call inside `handleSubmit` (currently around lines 107-122):

```typescript
      const { error } = await createTransaction({
        user_id: user.id,
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        date,
        source: 'manual',
```

Add `merchant: merchant.trim() || null,` right after `description,`:

```typescript
      const { error } = await createTransaction({
        user_id: user.id,
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        merchant: merchant.trim() || null,
        date,
        source: 'manual',
```

- [ ] **Step 5: Reset merchant on successful manual add**

Find the post-submit reset block (currently around lines 132-142):

```typescript
    if (!isEditing) {
      setAmount('')
      setDescription('')
      setTagsInput('')
```

Add `setMerchant('')` right after `setDescription('')`:

```typescript
    if (!isEditing) {
      setAmount('')
      setDescription('')
      setMerchant('')
      setTagsInput('')
```

- [ ] **Step 6: Rework the form layout — Merchant/Category row and Description/Date row**

Find this block (currently lines 178-202):

```tsx
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <Input
          label="Description"
          placeholder="What was this for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
```

Replace it with:

```tsx
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Input
              label="Merchant"
              placeholder="e.g. Swiggy"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              list="merchant-suggestions"
            />
            <datalist id="merchant-suggestions">
              {KNOWN_MERCHANTS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <Select
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Description"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
```

Note: the `<datalist>` renders no visible UI (browsers hide it) — it only needs to exist once in the DOM with an `id` matching the `Input`'s `list` attribute. Placing it right next to the `Merchant` `Input` keeps the two visually associated in the source, even though rendered position doesn't matter.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no test file exists for `ExpenseForm.tsx` today (this codebase doesn't unit-test presentational form components — `Input.tsx` and `Select.tsx` have no test files either), so this step is a regression check on the rest of the suite, not new coverage.

- [ ] **Step 8: Manually verify in the browser**

Start the dev server and sign in (or use an existing session). Open the expense form (Dashboard's Quick Add or the Expenses page's Add/Edit flow) and confirm:
- A `Merchant` field appears in row 2, to the left of `Category`.
- Typing a few letters of a known brand (e.g. "swi") shows an autocomplete suggestion ("Swiggy") via the browser's native datalist dropdown.
- Typing a name not in the list (e.g. "Ramesh Kirana Store") is still accepted — the field doesn't restrict input.
- Leaving `Merchant` blank and submitting still saves the transaction successfully (field is optional).
- Editing an existing transaction pre-fills `Merchant` with its current value; changing it and saving persists the new value (visible afterward via the `TransactionIdentity`-rendered title in the expense list).
- `Description` and `Date` now sit side by side in row 3.

- [ ] **Step 9: Commit**

```bash
git add src/components/expenses/ExpenseForm.tsx
git commit -m "feat: add editable merchant field to the expense form"
```
