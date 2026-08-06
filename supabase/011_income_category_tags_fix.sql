-- ============================================
-- 011: Fix missing 'income' analytics tag on Freelance/Refund/Cashback
-- 009_category_analytics_tags.sql tagged only 'Salary' as income —
-- Freelance, Refund, and Cashback are type='income' categories but were
-- seeded with an empty analytics_tags array. Analytics' income total
-- (savings rate, 50/30/20 split, income-side charts) filters strictly by
-- the 'income' tag, not by type='credit' or the category's type column —
-- so any income landing in these categories was silently excluded from
-- every Analytics view, even though it shows correctly as a raw number
-- on Dashboard/Expenses (which sum by type='credit' directly, no tag
-- involved).
-- Idempotent: safe to re-run.
-- ============================================

-- Backfill existing users' categories, same "only if still untagged"
-- guard 009 used — a category a user already tagged themselves (or
-- deliberately left untagged after renaming) is left alone.
UPDATE public.categories SET analytics_tags = ARRAY['income']
WHERE name IN ('Freelance', 'Refund', 'Cashback')
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
    (uid, 'Freelance',                '💻', '#0ea5e9', 'income',  false, true, false, 16, ARRAY['income']),
    (uid, 'Investments',              '📈', '#22c55e', 'expense', false, true, false, 17, ARRAY['savings']),
    (uid, 'Refund',                   '↩️', '#64748b', 'income',  false, true, false, 18, ARRAY['income']),
    (uid, 'Cashback',                 '🎁', '#f59e0b', 'income',  false, true, false, 19, ARRAY['income']),
    (uid, 'Other',                    '📌', '#94a3b8', 'expense', true,  true, true,  20, ARRAY['wants']);
END $$;
