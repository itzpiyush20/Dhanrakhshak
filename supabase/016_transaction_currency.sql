-- ============================================================
-- 016_transaction_currency.sql
--
-- Multi-currency support (R11).
--
-- This fixes a correctness bug, not merely a coverage gap. Amount extraction
-- only ever recognised Rs / INR / ₹ / Rupees, but the AI path returns a bare
-- number for ANY currency — so a USD 50 charge could be extracted as 50 and
-- stored indistinguishably from ₹50. A wrong number in the ledger is worse
-- than a missing one.
--
-- Defaulting to 'INR' is safe for every existing row: the app has been
-- INR-only, so all historical amounts genuinely are rupees.
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- ISO 4217 codes only. Constrained rather than free text because the column
-- decides how an amount is rendered and whether it may be summed with others;
-- a typo'd code would silently create a separate, invisible money bucket.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_currency_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_currency_check
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- Aggregates filter on currency to avoid summing mixed money, so this pairs
-- with the existing user/date access patterns.
CREATE INDEX IF NOT EXISTS idx_transactions_currency
  ON public.transactions (user_id, currency, date DESC);
