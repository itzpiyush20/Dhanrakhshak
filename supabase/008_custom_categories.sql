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
ALTER TABLE public.merchant_rules ALTER COLUMN preferred_category SET DEFAULT 'Other';

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
