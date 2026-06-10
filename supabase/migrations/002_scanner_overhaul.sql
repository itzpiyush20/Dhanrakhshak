-- ============================================================
-- Migration 002 — Scanner Overhaul
-- Adds: transaction_time, card_brand (transactions)
--       gmail_history_id, next_scan_time, scan_mode (email_scan_logs)
-- Creates: merchant_rules table
-- Stops populating: notes, card_last4 (deprecated, nulled on new inserts)
-- ============================================================

-- 1. transactions — new columns
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transaction_time TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT
    CHECK (card_brand IN ('Visa','Mastercard','RuPay','American Express','Diners'));

-- 2. email_scan_logs — new columns for incremental Gmail sync
ALTER TABLE public.email_scan_logs
  ADD COLUMN IF NOT EXISTS gmail_history_id TEXT,
  ADD COLUMN IF NOT EXISTS next_scan_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_mode TEXT DEFAULT 'manual'
    CHECK (scan_mode IN ('manual','scheduled'));

-- 3. merchant_rules table — canonical merchant learning
CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  canonical_name TEXT NOT NULL DEFAULT '',
  preferred_category TEXT NOT NULL DEFAULT 'other',
  card_brand TEXT CHECK (card_brand IN ('Visa','Mastercard','RuPay','American Express','Diners')),
  auto_approve BOOLEAN NOT NULL DEFAULT true,
  confidence NUMERIC NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  times_confirmed INTEGER NOT NULL DEFAULT 1,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key)
);

-- 4. RLS for merchant_rules
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'merchant_rules'
      AND policyname = 'Users can manage own merchant rules'
  ) THEN
    CREATE POLICY "Users can manage own merchant rules"
      ON public.merchant_rules FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_rules_user_key
  ON public.merchant_rules (user_id, merchant_key);

CREATE INDEX IF NOT EXISTS idx_scan_logs_user_time
  ON public.email_scan_logs (user_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_txn_email_message_id
  ON public.transactions (user_id, email_message_id)
  WHERE email_message_id IS NOT NULL;
