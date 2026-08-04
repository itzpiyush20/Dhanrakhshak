-- ============================================
-- 009: Category analytics tags
-- Lets Analytics classify categories (needs/wants/savings/income/
-- subscription/credit_card_bill) by a stable per-category field instead
-- of hardcoded display-name string comparisons, which silently broke
-- whenever a user renamed a default category (see 008's fallout).
-- Idempotent: safe to re-run.
-- ============================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS analytics_tags TEXT[] NOT NULL DEFAULT '{}';

-- Backfill existing rows (all users) to match today's hardcoded Analytics
-- behavior. Matches by current name only for rows that still hold a
-- default's seeded name — a category already renamed by a user is left
-- untagged (analytics_tags = '{}'), same as any newly created category,
-- and the user can tag it themselves in Settings.
UPDATE public.categories SET analytics_tags = ARRAY['needs'] WHERE name IN
  ('Groceries', 'Utilities & Bills', 'Transport', 'Rent', 'Health', 'Education', 'Insurance')
  AND analytics_tags = '{}';

UPDATE public.categories SET analytics_tags = ARRAY['wants'] WHERE name IN
  ('Food & Dining', 'Shopping', 'Entertainment', 'Travel', 'Other', 'Transfers')
  AND analytics_tags = '{}';

-- Subscriptions carries both: it's part of the "wants" 50/30/20 bucket AND
-- separately tracked for the subscription-burn/EMI chart.
UPDATE public.categories SET analytics_tags = ARRAY['wants', 'subscription'] WHERE name = 'Subscriptions'
  AND analytics_tags = '{}';

UPDATE public.categories SET analytics_tags = ARRAY['savings'] WHERE name = 'Investments'
  AND analytics_tags = '{}';

UPDATE public.categories SET analytics_tags = ARRAY['income'] WHERE name = 'Salary'
  AND analytics_tags = '{}';

UPDATE public.categories SET analytics_tags = ARRAY['credit_card_bill'] WHERE name = 'Credit Card Bill Payment'
  AND analytics_tags = '{}';

-- Update the seed function so new signups get these tags from day one.
CREATE OR REPLACE FUNCTION public.seed_default_categories(uid UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM categories WHERE user_id = uid) THEN
    RETURN;
  END IF;
  INSERT INTO categories (user_id, name, emoji, color, type, budget_eligible, is_default, is_permanent, sort_order, analytics_tags) VALUES
    (uid, 'Food & Dining',            '🍔', '#f97316', 'expense', true,  true, false, 1,  ARRAY['wants']),
    (uid, 'Groceries',                '🛒', '#84cc16', 'expense', true,  true, false, 2,  ARRAY['needs']),
    (uid, 'Transport',                '🚗', '#3b82f6', 'expense', true,  true, false, 3,  ARRAY['needs']),
    (uid, 'Shopping',                 '🛍️', '#ec4899', 'expense', true,  true, false, 4,  ARRAY['wants']),
    (uid, 'Utilities & Bills',        '💡', '#eab308', 'expense', true,  true, false, 5,  ARRAY['needs']),
    (uid, 'Rent',                     '🏠', '#8b5cf6', 'expense', true,  true, false, 6,  ARRAY['needs']),
    (uid, 'Health',                   '🏥', '#ef4444', 'expense', true,  true, false, 7,  ARRAY['needs']),
    (uid, 'Entertainment',            '🎬', '#f43f5e', 'expense', true,  true, false, 8,  ARRAY['wants']),
    (uid, 'Education',                '📚', '#06b6d4', 'expense', true,  true, false, 9,  ARRAY['needs']),
    (uid, 'Travel',                   '✈️', '#14b8a6', 'expense', true,  true, false, 10, ARRAY['wants']),
    (uid, 'Subscriptions',            '🔄', '#a855f7', 'expense', true,  true, false, 11, ARRAY['wants','subscription']),
    (uid, 'Insurance',                '🛡️', '#0891b2', 'expense', false, true, false, 12, ARRAY['needs']),
    (uid, 'Credit Card Bill Payment', '💳', '#475569', 'expense', false, true, false, 13, ARRAY['credit_card_bill']),
    (uid, 'Transfers',                '🔁', '#6b7280', 'expense', false, true, false, 14, ARRAY['wants']),
    (uid, 'Salary',                   '💰', '#10b981', 'income',  false, true, false, 15, ARRAY['income']),
    (uid, 'Freelance',                '💻', '#0ea5e9', 'income',  false, true, false, 16, ARRAY[]::TEXT[]),
    (uid, 'Investments',              '📈', '#22c55e', 'expense', false, true, false, 17, ARRAY['savings']),
    (uid, 'Refund',                   '↩️', '#64748b', 'income',  false, true, false, 18, ARRAY[]::TEXT[]),
    (uid, 'Cashback',                 '🎁', '#f59e0b', 'income',  false, true, false, 19, ARRAY[]::TEXT[]),
    (uid, 'Other',                    '📌', '#94a3b8', 'expense', true,  true, true,  20, ARRAY['wants']);
END $$;
