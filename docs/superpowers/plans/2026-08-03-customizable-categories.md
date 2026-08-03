# Customizable Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user editable categories (create/rename/recolor/delete, seeded from today's 19 defaults) plus explicit-only merchant-rule creation, per `docs/superpowers/specs/2026-08-03-customizable-categories-design.md`.

**Architecture:** New `categories` table (name = identity, per-user, RLS) with atomic `rename_category` / `delete_category` Postgres RPCs and a one-time key→display-name data migration. Frontend gets a `CategoriesContext` that replaces every read of the static `CATEGORIES` constant. Merchant-rule auto-creation side effects are removed; email scanning never auto-approves.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres + RLS, no ORM), Vitest.

**Conventions:** Test runner is Vitest — run with `npx vitest run <file>`. Type-check with `npx tsc --noEmit`. Commit after every task's green state. All new services follow the existing `{ data, error }` return pattern (see `src/services/budgets.ts`).

---

### Task 1: Database migration — `categories` table, RPCs, seed, backfill

**Files:**
- Create: `supabase/008_custom_categories.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================
-- 008: Customizable categories
-- Per-user categories table, seed defaults, key→name data
-- migration, atomic rename/delete RPCs, merchant_rules.rule_type.
-- Idempotent: safe to re-run.
-- ============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  budget_eligible BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "categories_select_own" ON public.categories
    FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "categories_insert_own" ON public.categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "categories_update_own" ON public.categories
    FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "categories_delete_own" ON public.categories
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Seed function: the 19 defaults (display names as identity)
CREATE OR REPLACE FUNCTION public.seed_default_categories(uid UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM categories WHERE user_id = uid) THEN
    RETURN;  -- idempotent: never re-seed
  END IF;
  INSERT INTO categories (user_id, name, emoji, color, type, budget_eligible, is_default, is_permanent, sort_order) VALUES
    (uid, 'Food & Dining',            '🍔', '#f97316', 'expense', true,  true, false, 1),
    (uid, 'Groceries',                '🛒', '#84cc16', 'expense', true,  true, false, 2),
    (uid, 'Transport',                '🚗', '#3b82f6', 'expense', true,  true, false, 3),
    (uid, 'Shopping',                 '🛍️', '#ec4899', 'expense', true,  true, false, 4),
    (uid, 'Utilities & Bills',        '💡', '#eab308', 'expense', true,  true, false, 5),
    (uid, 'Rent',                     '🏠', '#8b5cf6', 'expense', true,  true, false, 6),
    (uid, 'Health',                   '🏥', '#ef4444', 'expense', true,  true, false, 7),
    (uid, 'Entertainment',            '🎬', '#f43f5e', 'expense', true,  true, false, 8),
    (uid, 'Education',                '📚', '#06b6d4', 'expense', true,  true, false, 9),
    (uid, 'Travel',                   '✈️', '#14b8a6', 'expense', true,  true, false, 10),
    (uid, 'Subscriptions',            '🔄', '#a855f7', 'expense', true,  true, false, 11),
    (uid, 'Insurance',                '🛡️', '#0891b2', 'expense', false, true, false, 12),
    (uid, 'Credit Card Bill Payment', '💳', '#475569', 'expense', false, true, false, 13),
    (uid, 'Transfers',                '🔁', '#6b7280', 'expense', false, true, false, 14),
    (uid, 'Salary',                   '💰', '#10b981', 'income',  false, true, false, 15),
    (uid, 'Freelance',                '💻', '#0ea5e9', 'income',  false, true, false, 16),
    (uid, 'Investments',              '📈', '#22c55e', 'expense', false, true, false, 17),
    (uid, 'Refund',                   '↩️', '#64748b', 'income',  false, true, false, 18),
    (uid, 'Cashback',                 '🎁', '#f59e0b', 'income',  false, true, false, 19),
    (uid, 'Other',                    '📌', '#94a3b8', 'expense', true,  true, true,  20);
END $$;

-- 3. Seed on signup: attach to existing profile-creation flow
CREATE OR REPLACE FUNCTION public.handle_new_profile_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_categories(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_profile_created_seed_categories ON public.profiles;
CREATE TRIGGER on_profile_created_seed_categories
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_categories();

-- 4. Backfill existing users + one-time key→display-name rewrite
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.profiles LOOP
    PERFORM public.seed_default_categories(p.id);
  END LOOP;
END $$;

-- Rewrite legacy slug keys to display names in all three referencing tables.
-- Only matches the 19 known legacy keys, so re-running is a no-op.
WITH legacy(old_key, new_name) AS (
  VALUES
    ('food','Food & Dining'), ('groceries','Groceries'), ('transport','Transport'),
    ('shopping','Shopping'), ('utilities','Utilities & Bills'), ('rent','Rent'),
    ('health','Health'), ('entertainment','Entertainment'), ('education','Education'),
    ('travel','Travel'), ('subscriptions','Subscriptions'), ('insurance','Insurance'),
    ('credit_card_bill_payment','Credit Card Bill Payment'), ('transfers','Transfers'),
    ('salary','Salary'), ('freelance','Freelance'), ('investments','Investments'),
    ('refund','Refund'), ('cashback','Cashback'), ('other','Other')
)
UPDATE public.transactions t SET category = l.new_name
FROM legacy l WHERE t.category = l.old_key;

WITH legacy(old_key, new_name) AS (
  VALUES
    ('food','Food & Dining'), ('groceries','Groceries'), ('transport','Transport'),
    ('shopping','Shopping'), ('utilities','Utilities & Bills'), ('rent','Rent'),
    ('health','Health'), ('entertainment','Entertainment'), ('education','Education'),
    ('travel','Travel'), ('subscriptions','Subscriptions'), ('insurance','Insurance'),
    ('credit_card_bill_payment','Credit Card Bill Payment'), ('transfers','Transfers'),
    ('salary','Salary'), ('freelance','Freelance'), ('investments','Investments'),
    ('refund','Refund'), ('cashback','Cashback'), ('other','Other')
)
UPDATE public.budgets b SET category = l.new_name
FROM legacy l WHERE b.category = l.old_key;

WITH legacy(old_key, new_name) AS (
  VALUES
    ('food','Food & Dining'), ('groceries','Groceries'), ('transport','Transport'),
    ('shopping','Shopping'), ('utilities','Utilities & Bills'), ('rent','Rent'),
    ('health','Health'), ('entertainment','Entertainment'), ('education','Education'),
    ('travel','Travel'), ('subscriptions','Subscriptions'), ('insurance','Insurance'),
    ('credit_card_bill_payment','Credit Card Bill Payment'), ('transfers','Transfers'),
    ('salary','Salary'), ('freelance','Freelance'), ('investments','Investments'),
    ('refund','Refund'), ('cashback','Cashback'), ('other','Other')
)
UPDATE public.merchant_rules m SET preferred_category = l.new_name
FROM legacy l WHERE m.preferred_category = l.old_key;

ALTER TABLE public.transactions ALTER COLUMN category SET DEFAULT 'Other';

-- 5. merchant_rules: income/expense type
ALTER TABLE public.merchant_rules
  ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'expense'
  CHECK (rule_type IN ('income','expense'));

-- 6. Atomic rename RPC (merges blocked by UNIQUE(user_id,name))
CREATE OR REPLACE FUNCTION public.rename_category(old_name TEXT, new_name TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE user_id = uid AND name = old_name) THEN
    RAISE EXCEPTION 'Category "%" not found', old_name;
  END IF;
  -- UNIQUE(user_id,name) raises here if new_name already exists → whole txn rolls back
  UPDATE categories SET name = new_name WHERE user_id = uid AND name = old_name;
  UPDATE transactions SET category = new_name WHERE user_id = uid AND category = old_name;
  UPDATE budgets SET category = new_name WHERE user_id = uid AND category = old_name;
  UPDATE merchant_rules SET preferred_category = new_name WHERE user_id = uid AND preferred_category = old_name;
END $$;

-- 7. Atomic delete RPC: transactions→fallback, budgets deleted, rules→fallback
CREATE OR REPLACE FUNCTION public.delete_category(cat_name TEXT)
RETURNS TABLE (moved_transactions INT, deleted_budgets INT, fallback_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  fb TEXT;
  tx_count INT;
  budget_count INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM categories WHERE user_id = uid AND name = cat_name AND is_permanent) THEN
    RAISE EXCEPTION 'The fallback category cannot be deleted';
  END IF;
  SELECT name INTO fb FROM categories WHERE user_id = uid AND is_permanent LIMIT 1;
  IF fb IS NULL THEN RAISE EXCEPTION 'No fallback category found'; END IF;

  UPDATE transactions SET category = fb WHERE user_id = uid AND category = cat_name;
  GET DIAGNOSTICS tx_count = ROW_COUNT;
  DELETE FROM budgets WHERE user_id = uid AND category = cat_name;
  GET DIAGNOSTICS budget_count = ROW_COUNT;
  UPDATE merchant_rules SET preferred_category = fb WHERE user_id = uid AND preferred_category = cat_name;
  DELETE FROM categories WHERE user_id = uid AND name = cat_name;

  RETURN QUERY SELECT tx_count, budget_count, fb;
END $$;
```

- [ ] **Step 2: Apply the migration**

Run it against the Supabase project the same way migrations 003–007 were applied (Supabase SQL editor or `supabase db push` per the project's existing workflow). Verify with:

```sql
SELECT count(*) FROM categories;                       -- 20 × number of users
SELECT count(*) FROM transactions WHERE category = 'food';  -- 0
SELECT count(*) FROM transactions WHERE category = 'Food & Dining';  -- old 'food' rows
```

- [ ] **Step 3: Verify RPCs manually in SQL editor** (as an authenticated user via the app later, or with `SET request.jwt.claims` locally). At minimum confirm both functions compile: `SELECT proname FROM pg_proc WHERE proname IN ('rename_category','delete_category');` returns 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/008_custom_categories.sql
git commit -m "feat(db): categories table, seed/backfill migration, rename/delete RPCs"
```

---

### Task 2: Loosen the `ExpenseCategory` type + DB types

**Files:**
- Modify: `src/types/index.ts:27-47`
- Modify: `src/types/database.ts` (add `categories` table types, `merchant_rules.rule_type`)

- [ ] **Step 1: Replace the union with a string alias** in `src/types/index.ts`:

```ts
/**
 * Category identity is now the user-defined display name (dynamic, per-user).
 * Kept as a type alias so existing annotations keep compiling.
 */
export type ExpenseCategory = string

export type CategoryType = 'income' | 'expense'

/** A user-defined category row */
export interface Category {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  type: CategoryType
  budget_eligible: boolean
  is_default: boolean
  is_permanent: boolean
  sort_order: number
  created_at: string
}
```

(Delete the old 20-value union entirely. `Transaction.category` / `Budget.category` / `CategoryBreakdown.category` keep their `ExpenseCategory` annotation and now accept any string.)

- [ ] **Step 2: Add DB types** in `src/types/database.ts`, following the existing table-type shape in that file: a `categories` entry with Row/Insert/Update mirroring the SQL columns from Task 1, and `rule_type: string` added to the `merchant_rules` Row/Insert/Update types.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (loosening a union to `string` cannot break existing assignments; if any errors appear they are pre-existing — note them, don't fix unrelated ones).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/types/database.ts
git commit -m "refactor(types): ExpenseCategory becomes dynamic string, add Category types"
```

---

### Task 3: Categories service (TDD)

**Files:**
- Create: `src/services/categories.ts`
- Create: `src/services/categories.test.ts`
- Modify: `src/services/index.ts` (add barrel export)

- [ ] **Step 1: Write the failing tests** — `src/services/categories.test.ts`. Mirror the mocking style used in `src/services/learningEngine.test.ts` (read it first; it mocks `./supabase`). Core shape:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const fromMock = vi.fn()
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  },
}))

import { getCategories, createCategory, updateCategoryStyle, renameCategory, deleteCategory } from './categories'

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
})

describe('renameCategory', () => {
  it('calls the rename_category RPC with old and new names', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    const { error } = await renameCategory('Food & Dining', 'Eating Out')
    expect(rpcMock).toHaveBeenCalledWith('rename_category', {
      old_name: 'Food & Dining',
      new_name: 'Eating Out',
    })
    expect(error).toBeNull()
  })

  it('surfaces a duplicate-name error from the RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint' } })
    const { error } = await renameCategory('A', 'B')
    expect(error).not.toBeNull()
  })
})

describe('deleteCategory', () => {
  it('calls the delete_category RPC and returns impact counts', async () => {
    rpcMock.mockResolvedValue({
      data: [{ moved_transactions: 4, deleted_budgets: 1, fallback_name: 'Other' }],
      error: null,
    })
    const { data, error } = await deleteCategory('Travel')
    expect(rpcMock).toHaveBeenCalledWith('delete_category', { cat_name: 'Travel' })
    expect(data).toEqual({ moved_transactions: 4, deleted_budgets: 1, fallback_name: 'Other' })
    expect(error).toBeNull()
  })
})

describe('getCategoryUsage', () => {
  it('counts transactions and budgets referencing the category', async () => {
    const chain = (count: number) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ count, error: null }),
    })
    fromMock.mockImplementationOnce(() => chain(4)).mockImplementationOnce(() => chain(1))
    const { data } = await (await import('./categories')).getCategoryUsage('Travel')
    expect(data).toEqual({ transactions: 4, budgets: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/categories.test.ts`
Expected: FAIL — module `./categories` not found.

- [ ] **Step 3: Implement** `src/services/categories.ts`:

```ts
// ============================================
// Categories Service — per-user category CRUD
// Rename/delete go through atomic Postgres RPCs.
// ============================================

import { supabase } from './supabase'
import type { Category, CategoryType } from '@/types'

export async function getCategories() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  return { data: data as Category[] | null, error }
}

export async function createCategory(input: {
  name: string
  emoji: string
  color: string
  type: CategoryType
  budget_eligible: boolean
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, ...input })
    .select()
    .single()

  return { data: data as Category | null, error }
}

/** Update emoji/color/type/budget_eligible — everything except the name. */
export async function updateCategoryStyle(
  id: string,
  patch: Partial<Pick<Category, 'emoji' | 'color' | 'type' | 'budget_eligible'>>
) {
  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  return { data: data as Category | null, error }
}

/** Atomic rename: cascades to transactions, budgets, merchant_rules via RPC. */
export async function renameCategory(oldName: string, newName: string) {
  const { error } = await supabase.rpc('rename_category', {
    old_name: oldName,
    new_name: newName,
  })
  return { error }
}

/** Atomic delete: transactions→fallback, budgets removed, rules→fallback. */
export async function deleteCategory(name: string) {
  const { data, error } = await supabase.rpc('delete_category', { cat_name: name })
  const row = Array.isArray(data) ? data[0] : data
  return {
    data: row as { moved_transactions: number; deleted_budgets: number; fallback_name: string } | null,
    error,
  }
}

/** Usage counts shown in the delete-confirmation dialog. */
export async function getCategoryUsage(name: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('User not authenticated') }

  const [tx, budgets] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('category', name),
    supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('category', name),
  ])

  return {
    data: { transactions: tx.count ?? 0, budgets: budgets.count ?? 0 },
    error: tx.error || budgets.error,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/categories.test.ts`
Expected: PASS. (If the `getCategoryUsage` mock shape fights the real supabase chain, simplify that test to assert `from` was called with `transactions` and `budgets` — don't contort the implementation to satisfy a mock.)

- [ ] **Step 5: Export from the barrel** — add to `src/services/index.ts`:

```ts
export { getCategories, createCategory, updateCategoryStyle, renameCategory, deleteCategory, getCategoryUsage } from './categories'
```

- [ ] **Step 6: Commit**

```bash
git add src/services/categories.ts src/services/categories.test.ts src/services/index.ts
git commit -m "feat(categories): service with atomic rename/delete RPC calls"
```

---

### Task 4: CategoriesContext — dynamic replacement for the static `CATEGORIES` constant

**Files:**
- Create: `src/context/CategoriesContext.tsx`
- Modify: `src/context/index.ts` (or wherever `useToast`/`useAuth` are exported — follow that file's pattern)
- Modify: the app root where providers nest (find `<AuthProvider>` usage, likely `src/App.tsx` or `src/main.tsx`) — wrap children with `<CategoriesProvider>` inside `AuthProvider`.
- Modify: `src/constants/index.ts` — keep `CATEGORIES` for now (removed in Task 10) but add curated pickers + neutral fallback.

- [ ] **Step 1: Add curated palettes and fallback style** to `src/constants/index.ts`:

```ts
/** Neutral style for transactions whose category no longer exists */
export const CATEGORY_STYLE_FALLBACK = { emoji: '📌', color: '#94a3b8' }

/** Curated emoji choices for the category form */
export const CATEGORY_EMOJI_CHOICES = [
  '🍔','🛒','🚗','🛍️','💡','🏠','🏥','🎬','📚','✈️',
  '🔄','🛡️','💳','🔁','💰','💻','📈','↩️','🎁','📌',
  '🎮','🐾','👶','🏋️','🎓','🎵','☕','🍺','💊','🧾',
  '🎂','🌱','🔧','📱','👔','💇','🏦','🙏','🎗️','🚌',
]

/** Curated color swatches for the category form */
export const CATEGORY_COLOR_CHOICES = [
  '#f97316','#84cc16','#3b82f6','#ec4899','#eab308','#8b5cf6',
  '#ef4444','#f43f5e','#06b6d4','#14b8a6','#a855f7','#0891b2',
  '#475569','#6b7280','#10b981','#0ea5e9','#22c55e','#64748b',
  '#f59e0b','#94a3b8','#d946ef','#7c3aed','#059669','#b91c1c',
]
```

- [ ] **Step 2: Implement the context** — `src/context/CategoriesContext.tsx`:

```tsx
// ============================================
// CategoriesContext — the user's dynamic category list.
// Replaces the old static CATEGORIES constant everywhere.
// ============================================

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { getCategories } from '@/services/categories'
import { useAuth } from '@/context/AuthContext'
import { CATEGORY_STYLE_FALLBACK } from '@/constants'
import type { Category } from '@/types'

interface CategoriesContextValue {
  categories: Category[]
  loading: boolean
  /** name → category row; missing names fall back to a neutral style */
  categoryMap: Record<string, Category>
  /** The is_permanent row ("Other" unless renamed) — delete fallback target */
  fallbackCategory: Category | null
  /** Style lookup that never throws: unknown names get the neutral style */
  getStyle: (name: string) => { emoji: string; color: string; label: string }
  refresh: () => Promise<void>
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null)

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setCategories([]); setLoading(false); return }
    const { data } = await getCategories()
    setCategories(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c])),
    [categories]
  )

  const fallbackCategory = useMemo(
    () => categories.find((c) => c.is_permanent) ?? null,
    [categories]
  )

  const getStyle = useCallback(
    (name: string) => {
      const c = categoryMap[name]
      return c
        ? { emoji: c.emoji, color: c.color, label: c.name }
        : { ...CATEGORY_STYLE_FALLBACK, label: name }
    },
    [categoryMap]
  )

  return (
    <CategoriesContext.Provider value={{ categories, loading, categoryMap, fallbackCategory, getStyle, refresh }}>
      {children}
    </CategoriesContext.Provider>
  )
}

export function useCategories() {
  const ctx = useContext(CategoriesContext)
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider')
  return ctx
}
```

- [ ] **Step 3: Wire the provider** — find where `AuthProvider` wraps the app (`Grep "AuthProvider" src/`), nest `<CategoriesProvider>` directly inside it, and export `useCategories`/`CategoriesProvider` from the same barrel that exports `useAuth` (`src/context/index.ts` if present).

- [ ] **Step 4: Type-check and existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context/CategoriesContext.tsx src/context/index.ts src/constants/index.ts src/App.tsx
git commit -m "feat(categories): CategoriesContext with dynamic map, fallback, curated palettes"
```

---

### Task 5: Manage Categories UI in Settings

**Files:**
- Create: `src/components/settings/CategoryManager.tsx`
- Create: `src/components/settings/CategoryFormModal.tsx`
- Modify: `src/pages/SettingsPage.tsx` (render `<CategoryManager />` as a new section, near the Merchant Rules section)

- [ ] **Step 1: Implement `CategoryFormModal.tsx`** — shared create/edit form:

```tsx
// ============================================
// CategoryFormModal — create or edit one category.
// Curated emoji + color pickers; duplicate names rejected inline.
// ============================================

import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'
import { CATEGORY_EMOJI_CHOICES, CATEGORY_COLOR_CHOICES } from '@/constants'
import { createCategory, updateCategoryStyle, renameCategory } from '@/services/categories'
import { useCategories } from '@/context'
import type { Category, CategoryType } from '@/types'

interface Props {
  /** null → create mode */
  editing: Category | null
  onClose: () => void
  onSaved: () => void
}

export default function CategoryFormModal({ editing, onClose, onSaved }: Props) {
  const { categories } = useCategories()
  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? CATEGORY_EMOJI_CHOICES[0])
  const [color, setColor] = useState(editing?.color ?? CATEGORY_COLOR_CHOICES[0])
  const [type, setType] = useState<CategoryType>(editing?.type ?? 'expense')
  const [budgetEligible, setBudgetEligible] = useState(editing?.budget_eligible ?? false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required'); return }
    const duplicate = categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== editing?.id
    )
    if (duplicate) { setError(`A category named "${trimmed}" already exists`); return }

    setLoading(true)
    setError('')
    if (editing) {
      if (trimmed !== editing.name) {
        const { error: renameErr } = await renameCategory(editing.name, trimmed)
        if (renameErr) { setError(renameErr.message); setLoading(false); return }
      }
      const { error: styleErr } = await updateCategoryStyle(editing.id, {
        emoji, color, type, budget_eligible: type === 'expense' ? budgetEligible : false,
      })
      if (styleErr) { setError(styleErr.message); setLoading(false); return }
    } else {
      const { error: createErr } = await createCategory({
        name: trimmed, emoji, color, type,
        budget_eligible: type === 'expense' ? budgetEligible : false,
      })
      if (createErr) { setError(createErr.message); setLoading(false); return }
    }
    setLoading(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-surface-1 border border-border-subtle p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold mb-4">{editing ? 'Edit Category' : 'New Category'}</h3>
        {error && (
          <div role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-3 text-sm text-[var(--status-danger-text)]">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Icon</span>
            <div className="grid grid-cols-8 gap-1.5">
              {CATEGORY_EMOJI_CHOICES.map((em) => (
                <button
                  key={em} type="button" onClick={() => setEmoji(em)}
                  aria-label={`Icon ${em}`} aria-pressed={emoji === em}
                  className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center border ${
                    emoji === em ? 'border-brand-500 bg-brand-500/15' : 'border-border-subtle/50 bg-surface-2/40'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Color</span>
            <div className="grid grid-cols-8 gap-1.5">
              {CATEGORY_COLOR_CHOICES.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  aria-label={`Color ${c}`} aria-pressed={color === c}
                  className={`h-9 w-9 rounded-lg border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-zinc-300 mb-1.5">Type</span>
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    type === t ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border-subtle/50 text-zinc-400'
                  }`}
                >
                  {t === 'expense' ? '🔴 Expense' : '🟢 Income'}
                </button>
              ))}
            </div>
          </div>

          {type === 'expense' && (
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox" checked={budgetEligible}
                onChange={(e) => setBudgetEligible(e.target.checked)}
                className="rounded border-zinc-700 bg-surface-2 text-brand-500 focus:ring-brand-500/25 h-4 w-4"
              />
              Can have a monthly budget
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>{editing ? 'Save' : 'Create'}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `CategoryManager.tsx`** — list + delete flow:

```tsx
// ============================================
// CategoryManager — Settings section listing the user's
// categories with create / edit / delete (confirm + impact).
// ============================================

import { useState } from 'react'
import { Button, Badge, ConfirmDialog } from '@/components/ui'
import { deleteCategory, getCategoryUsage } from '@/services/categories'
import { useCategories, useToast } from '@/context'
import CategoryFormModal from './CategoryFormModal'
import type { Category } from '@/types'

export default function CategoryManager() {
  const { categories, refresh } = useCategories()
  const { showToast } = useToast()
  const [modal, setModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null })
  const [confirming, setConfirming] = useState<{ cat: Category; transactions: number; budgets: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const expense = categories.filter((c) => c.type === 'expense')
  const income = categories.filter((c) => c.type === 'income')

  const askDelete = async (cat: Category) => {
    const { data } = await getCategoryUsage(cat.name)
    setConfirming({ cat, transactions: data?.transactions ?? 0, budgets: data?.budgets ?? 0 })
  }

  const doDelete = async () => {
    if (!confirming) return
    setBusy(true)
    const { data, error } = await deleteCategory(confirming.cat.name)
    setBusy(false)
    setConfirming(null)
    if (error) { showToast(error.message, 'error'); return }
    showToast(
      data && data.moved_transactions > 0
        ? `Deleted. ${data.moved_transactions} transaction${data.moved_transactions === 1 ? '' : 's'} moved to ${data.fallback_name}.`
        : 'Category deleted.',
      'success'
    )
    await refresh()
  }

  const renderRow = (cat: Category) => (
    <div key={cat.id} className="flex items-center gap-3 py-2.5 border-b border-border-subtle/40 last:border-0">
      <span className="text-xl w-8 text-center">{cat.emoji}</span>
      <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} aria-hidden />
      <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
      {cat.budget_eligible && <Badge>Budget</Badge>}
      {cat.is_default && <Badge>Default</Badge>}
      <Button variant="ghost" aria-label={`Edit ${cat.name}`} onClick={() => setModal({ open: true, editing: cat })}>Edit</Button>
      {!cat.is_permanent && (
        <Button variant="ghost" aria-label={`Delete ${cat.name}`} onClick={() => askDelete(cat)}>Delete</Button>
      )}
    </div>
  )

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Categories</h2>
        <Button onClick={() => setModal({ open: true, editing: null })}>+ New Category</Button>
      </div>

      <h3 className="text-xs font-semibold text-zinc-400 mt-3 mb-1">Expenses</h3>
      {expense.map(renderRow)}
      <h3 className="text-xs font-semibold text-zinc-400 mt-4 mb-1">Income</h3>
      {income.map(renderRow)}

      {modal.open && (
        <CategoryFormModal
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={async () => { setModal({ open: false, editing: null }); await refresh() }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          open
          title={`Delete "${confirming.cat.name}"?`}
          message={
            confirming.transactions + confirming.budgets > 0
              ? `${confirming.transactions} transaction${confirming.transactions === 1 ? '' : 's'} will be moved to the fallback category` +
                (confirming.budgets > 0 ? ` and ${confirming.budgets} budget${confirming.budgets === 1 ? '' : 's'} will be removed.` : '.')
              : 'This category is not used by any transactions or budgets.'
          }
          confirmLabel="Delete"
          loading={busy}
          onConfirm={doDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  )
}
```

**Note:** Before writing, read `src/components/ui/ConfirmDialog` (and `Badge`) to match their actual prop names — BudgetsPage already uses `ConfirmDialog`, copy its usage pattern. Adjust the snippet's props accordingly; the behavior contract (title, impact message, confirm/cancel) is what matters.

- [ ] **Step 3: Mount in SettingsPage** — in `src/pages/SettingsPage.tsx`, import `CategoryManager` and render it as its own card/section immediately above the existing Merchant Rules section, matching the page's existing section markup.

- [ ] **Step 4: Verify in browser** — start the dev server (preview tooling), go to Settings: create a category, edit its color, rename it, delete an unused one (plain confirm), delete one with transactions (impact message + toast). Confirm "Other" has no Delete button.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ src/pages/SettingsPage.tsx
git commit -m "feat(categories): Manage Categories UI in Settings"
```

---

### Task 6: Point all category pickers/lookups at the dynamic list

**Files:**
- Modify: `src/components/expenses/ExpenseForm.tsx:24-27,40`
- Modify: `src/pages/BudgetsPage.tsx:19-45,47,428`
- Modify: `src/pages/ExpensesPage.tsx` + `src/components/expenses/ExpenseList.tsx` (filter dropdown)
- Modify: `src/pages/analytics/CategoryIcon.tsx`, `src/pages/analytics/ExpenseBreakdown.tsx`, `src/pages/AnalyticsPage.tsx`
- Modify: `src/components/dashboard/QuickAddWidget.tsx`, `src/components/dashboard/ActiveSubscriptionsWidget.tsx`, `src/pages/SubscriptionsPage.tsx`, `src/pages/PendingPage.tsx` (category dropdowns + label lookups)

For every file: `Grep "CATEGORIES" src/` to find each usage, then apply the same mechanical transformation:

- [ ] **Step 1: ExpenseForm** — delete the module-level `categoryOptions` (lines 24-27); inside the component:

```tsx
const { categories, fallbackCategory } = useCategories()
const categoryOptions = categories.map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` }))
const [category, setCategory] = useState(editingTransaction?.category || fallbackCategory?.name || 'Other')
```

Also update the form-reset line 134 from `setCategory('other')` to `setCategory(fallbackCategory?.name || 'Other')`.

- [ ] **Step 2: BudgetsPage** — delete `BUDGET_ELIGIBLE_CATEGORIES` (lines 19-45) and the `CATEGORIES` import; derive:

```tsx
const { categories, getStyle } = useCategories()
const budgetEligible = categories.filter((c) => c.type === 'expense' && c.budget_eligible)
```

Initialize the form state with `budgetEligible[0]?.name ?? ''` (guard the empty case), build the dropdown from `budgetEligible`, and replace any `CATEGORIES[...]` label/emoji lookups with `getStyle(name)`.

- [ ] **Step 3: All remaining files** — replace every `CATEGORIES[x]?.label / .emoji / .color` pattern with `getStyle(x).label / .emoji / .color` from `useCategories()`, and every `Object.entries(CATEGORIES)` dropdown build with the `categories.map(...)` pattern from Step 1. For non-component modules (e.g. `services/analytics.ts`) that only need colors/labels for chart output, pass the map in from the calling component rather than importing context into a service.

- [ ] **Step 4: Type-check + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, and `Grep "from '@/constants'" src/ | grep CATEGORIES` shows no remaining consumer outside `src/constants/index.ts` itself (Task 10 deletes the constant).

- [ ] **Step 5: Verify in browser** — add an expense with a custom category, set a budget (only budget-eligible categories listed), check Analytics colors, filters on Expenses page.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "refactor(categories): all pickers and lookups use dynamic CategoriesContext"
```

---

### Task 7: Remove automatic merchant-rule creation (TDD on learningEngine)

**Files:**
- Modify: `src/services/learningEngine.ts:152-204` (`applyMerchantRulesFromDB` — never auto-approve)
- Modify: `src/components/expenses/ExpenseForm.tsx:142-151` (delete the auto-learn block)
- Modify: `src/pages/PendingPage.tsx:348-366` (replace silent learn with opt-in affordance)
- Modify: `src/services/learningEngine.test.ts`

- [ ] **Step 1: Write/adjust the failing test** in `src/services/learningEngine.test.ts` — add:

```ts
describe('applyMerchantRulesFromDB — no auto-approval', () => {
  it('returns pending even for a 100%-confidence exact match', async () => {
    // arrange a mocked rules fetch returning an exact-match rule with
    // auto_approve: true, confidence: 100, times_confirmed: 10
    // (reuse the file's existing supabase mock pattern)
    const result = await applyMerchantRulesFromDB('u1', 'Swiggy', 'order snippet', 'Other')
    expect(result.category).toBe('Food & Dining')
    expect(result.approval_status).toBe('pending')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/services/learningEngine.test.ts` — the exact match currently returns `'approved'`.

- [ ] **Step 3: Implement** — in `applyMerchantRulesFromDB`, delete both `isAutoApprove` computations and hardcode `approval_status: 'pending'` in both return sites (exact match, line ~175, and partial match, line ~192). Keep category suggestion, confidence, and matchReason unchanged.

- [ ] **Step 4: Run tests** — `npx vitest run src/services/learningEngine.test.ts` — PASS.

- [ ] **Step 5: Remove the ExpenseForm auto-learn block** — delete lines 142-151 (`// Learn manual categorization rules...` through the closing brace) and the now-unused `saveMerchantRule`, `cleanMerchantName`, `saveMerchantRuleToDb` imports on line 10.

- [ ] **Step 6: Replace PendingPage silent learning with the opt-in affordance** — delete the `learnMerchantRule` function (lines 351-366) and its call site(s) (search `learnMerchantRule(` in the file). Add state + prompt:

```tsx
const [ruleSuggestion, setRuleSuggestion] = useState<{ merchant: string; category: string } | null>(null)
```

Where `learnMerchantRule` was called after approval, instead:

```tsx
const merchant = txn.merchant || ''
if (merchant && merchant.length > 2 &&
    !['Retail Transaction', 'Incoming Credit', 'Bank Transaction'].includes(merchant)) {
  setRuleSuggestion({ merchant, category: fields.category })
}
```

Render a dismissible inline banner near the list header:

```tsx
{ruleSuggestion && (
  <div className="flex items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/10 p-3 text-sm">
    <span className="flex-1">
      Always categorize <strong>{ruleSuggestion.merchant}</strong> as <strong>{ruleSuggestion.category}</strong>?
    </span>
    <Button
      onClick={async () => {
        if (user?.id) await saveMerchantRuleToDb(user.id, ruleSuggestion.merchant, ruleSuggestion.category, true)
        showToast(`Rule saved: ${ruleSuggestion.merchant} → ${ruleSuggestion.category}`, 'success')
        setRuleSuggestion(null)
      }}
    >
      Create rule
    </Button>
    <Button variant="ghost" aria-label="Dismiss" onClick={() => setRuleSuggestion(null)}>✕</Button>
  </div>
)}
```

Also replace the `CATEGORIES[category ...]` label lookup that `learnMerchantRule` used (line 364) — it's deleted along with the function; any other `CATEGORIES` references in this file were converted in Task 6.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. Then in the browser: approve a pending transaction → banner appears → "Create rule" → rule visible in Settings → Merchant Rules. Saving a manual expense creates **no** rule.

- [ ] **Step 8: Commit**

```bash
git add src/services/learningEngine.ts src/services/learningEngine.test.ts src/components/expenses/ExpenseForm.tsx src/pages/PendingPage.tsx
git commit -m "feat(rules): rule creation is explicit-only; scanning never auto-approves"
```

---

### Task 8: Merchant Rules UI — income/expense type + dynamic category options

**Files:**
- Modify: `src/pages/SettingsPage.tsx` (Merchant Rules section, handlers at lines 251-312, plus the rules list rendering further down)
- Modify: `src/services/learningEngine.ts` (`saveMerchantRuleToDb` signature)

- [ ] **Step 1: Extend `saveMerchantRuleToDb`** with a `ruleType` parameter:

```ts
export async function saveMerchantRuleToDb(
  userId: string,
  merchant: string,
  category: string,
  autoApprove = true,
  cardBrand?: CardBrand | null,
  ruleType: 'income' | 'expense' = 'expense'
): Promise<void> {
```

Include `rule_type: ruleType` in both the update payload and the insert object. Add `rule_type: string` to the `MerchantRuleRow` type at the top of the file.

- [ ] **Step 2: SettingsPage rules UI** — in the Merchant Rules section:
  - The per-rule category `<Select>` options come from `useCategories()` (`categories.map((c) => ({ value: c.name, label: \`${c.emoji} ${c.name}\` }))`) instead of any static list.
  - Add a per-rule type `<Select>` with options `[{value:'expense',label:'🔴 Expense'},{value:'income',label:'🟢 Income'}]`, wired to a new handler:

```tsx
const handleUpdateRuleType = async (key: string, ruleType: string) => {
  if (user) {
    try {
      await supabase.from('merchant_rules').update({
        rule_type: ruleType,
        last_updated: new Date().toISOString(),
      }).eq('user_id', user.id).eq('merchant_key', key)
    } catch (err) {
      console.error('Failed to update rule type in DB:', err)
    }
  }
  loadRules()
}
```

  - Extend `loadRules`'s `dbRules` map value to `{ category, autoApprove, ruleType: r.rule_type }` and thread it through the row rendering.
  - The "add custom rule" form (`handleAddCustomRule`, line 295) gets a type selector defaulting to `'expense'`, passed as the new sixth argument: `saveMerchantRuleToDb(user.id, newKeyword, newCategory, newAutoApprove, undefined, newRuleType)`.
  - Default `newCategory` initial state changes from `'other'` to the fallback category name from `useCategories()`.

- [ ] **Step 3: Type-check + verify in browser** — `npx tsc --noEmit`, then Settings → Merchant Rules: add a rule with type Income, toggle a rule's type, change a rule's category (options are the dynamic list).

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx src/services/learningEngine.ts
git commit -m "feat(rules): income/expense type on merchant rules, dynamic category options"
```

---

### Task 9: Email scanner + AI prompt use the dynamic list

**Files:**
- Modify: `src/services/emailScanner.ts` (rule application call sites ~1013, ~1231, and wherever the final category is settled before insert)
- Modify: `src/services/aiService.ts` (category list in the Gemini prompt)

- [ ] **Step 1: Scanner fallback validation** — in `emailScanner.ts`, at the point after `applyMerchantRulesFromDB` where the transaction's category is finalized, validate against the user's categories:

```ts
// Category must exist in the user's current list; otherwise use the permanent fallback.
// userCategories: Category[] fetched once per scan via getCategories().
const validNames = new Set(userCategories.map((c) => c.name))
const fallbackName = userCategories.find((c) => c.is_permanent)?.name ?? 'Other'
if (!validNames.has(candidateCategory)) candidateCategory = fallbackName
```

Fetch `userCategories` once at scan start (`const { data: userCategories } = await getCategories()`), not per email. Legacy suggestions from `merchantNormalizer.ts`'s `CANONICAL_MAP` (old slug keys like `'food'`) will simply fail the `validNames` check and fall back — no change needed inside `merchantNormalizer.ts`.

Also confirm (from Task 7) every scanned transaction is inserted with `approval_status: 'pending'` — grep the file for `'approved'` and remove any remaining confidence-based approval path.

- [ ] **Step 2: AI prompt** — in `aiService.ts`, find where the category list is embedded in the Gemini prompt (grep for a hardcoded list of the old slugs). Replace with a parameter: the caller passes `categoryNames: string[]` (from `getCategories()`), and the prompt says to pick **only** from that list, returning the exact name. Validate the response: if the returned string is not in `categoryNames`, use the fallback name.

- [ ] **Step 3: Type-check + tests** — `npx tsc --noEmit && npx vitest run` — PASS.

- [ ] **Step 4: Manual verification** — trigger an email scan (or the app's mock/dev scan path if no test inbox is wired): scanned transactions land in Pending, pre-filled with rule/AI-suggested categories that all exist in the user's list.

- [ ] **Step 5: Commit**

```bash
git add src/services/emailScanner.ts src/services/aiService.ts
git commit -m "feat(scan): dynamic per-user categories in scanner and AI prompt, pending-only"
```

---

### Task 10: Delete the static `CATEGORIES` constant + final sweep

**Files:**
- Modify: `src/constants/index.ts:5-29` (delete `CATEGORIES` and the `ExpenseCategory` import)
- Modify: any straggler found by grep

- [ ] **Step 1: Delete `CATEGORIES`** from `src/constants/index.ts` (keep `CATEGORY_STYLE_FALLBACK`, `CATEGORY_EMOJI_CHOICES`, `CATEGORY_COLOR_CHOICES`, `ROUTES`, `APP_CONFIG`).

- [ ] **Step 2: Sweep** — `Grep "CATEGORIES\b" src/` must return only the three new constants. Fix any straggler with the Task 6 transformation. `Grep "'other'" src/` — replace remaining category-value usages with the fallback-category pattern (leave unrelated string matches alone).

- [ ] **Step 3: Full check** — `npx tsc --noEmit && npx vitest run` — PASS. Production build: `npm run build` — PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "refactor: remove static CATEGORIES constant"
```

---

### Task 11: End-to-end verification pass

- [ ] **Step 1: Full regression suite** — `npx vitest run` and `npm run build`: both green.

- [ ] **Step 2: Browser walkthrough** (dev server + preview tools), verifying every spec behavior:
  1. Settings → Categories: create "Pet Care 🐾", rename "Food & Dining" → "Eating Out", recolor one, toggle budget-eligible.
  2. Rename to an existing name → inline error, nothing changed.
  3. "Other" row: Edit present, Delete absent.
  4. Delete a category with transactions → dialog shows counts → toast reports the move; those transactions now show the fallback category; its budgets are gone.
  5. Expenses: add form + filter show the updated list (renamed/created categories present, deleted absent).
  6. Budgets: dropdown = expense + budget-eligible only.
  7. Analytics: charts use each category's color/emoji; no crash on any view.
  8. Manual expense save creates no merchant rule (check Settings → Merchant Rules before/after).
  9. Pending: approve → opt-in banner → Create rule → rule appears with correct type.
  10. Merchant rule with type Income; rule category dropdown = dynamic list.

- [ ] **Step 3: Fix anything found, then final commit** — each fix as its own small commit.

---

## Self-review notes (done at plan-writing time)

- Spec coverage: identity migration (T1), rename cascade (T1/T3), delete behavior incl. budget deletion (T1/T5), fallback-by-flag (T1 RPC, T4 context, T9 scanner), seeding new+existing users (T1), dynamic consumers (T6), explicit-only rules + no auto-approve (T7), rule type field (T8), AI dynamic prompt (T9), curated pickers (T4/T5), testing (T3/T7/T11). No spec section is unimplemented.
- Known judgment calls for the implementer: match `ConfirmDialog`/`Badge` real props (T5 note); match `learningEngine.test.ts` existing mock style (T3/T7); provider nesting location found by grep (T4).
