-- ============================================================
-- DHANRAKSHAK V2 — DATABASE MIGRATION
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================
-- SAFE TO RUN MULTIPLE TIMES (all statements use IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ==========================================
-- 1. ADD NEW COLUMNS TO transactions TABLE
-- ==========================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS card_last4 TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_issuer TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS budget_alerts_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_reminders_enabled BOOLEAN DEFAULT true;

-- Add unique constraint on email_message_id for deduplication (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_email_message_id_user_id_key'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_email_message_id_user_id_key
      UNIQUE (email_message_id, user_id);
  END IF;
END$$;

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_transactions_email_message_id
  ON public.transactions(email_message_id)
  WHERE email_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_confidence
  ON public.transactions(user_id, confidence_score);

CREATE INDEX IF NOT EXISTS idx_transactions_event_type
  ON public.transactions(user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_mode
  ON public.transactions(user_id, payment_mode);

-- ==========================================
-- 2. CREATE merchant_rules TABLE
-- Supabase-synced self-learning engine
-- ==========================================

CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  preferred_category TEXT NOT NULL,
  auto_approve BOOLEAN NOT NULL DEFAULT true,
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  times_confirmed INTEGER NOT NULL DEFAULT 1,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key)
);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_user_merchant
  ON public.merchant_rules(user_id, merchant_key);

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own merchant rules" ON public.merchant_rules;
CREATE POLICY "Users can view own merchant rules"
  ON public.merchant_rules FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own merchant rules" ON public.merchant_rules;
CREATE POLICY "Users can insert own merchant rules"
  ON public.merchant_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own merchant rules" ON public.merchant_rules;
CREATE POLICY "Users can update own merchant rules"
  ON public.merchant_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own merchant rules" ON public.merchant_rules;
CREATE POLICY "Users can delete own merchant rules"
  ON public.merchant_rules FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update trigger for merchant_rules
DROP TRIGGER IF EXISTS set_updated_at_merchant_rules ON public.merchant_rules;
CREATE TRIGGER set_updated_at_merchant_rules
  BEFORE UPDATE ON public.merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- 3. CREATE cards TABLE
-- Card profile management per user
-- ==========================================

CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last4 TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT 'Unknown',
  card_type TEXT NOT NULL DEFAULT 'debit' CHECK (card_type IN ('credit', 'debit')),
  card_name TEXT DEFAULT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, last4, card_type)
);

CREATE INDEX IF NOT EXISTS idx_cards_user
  ON public.cards(user_id);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cards" ON public.cards;
CREATE POLICY "Users can view own cards"
  ON public.cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cards" ON public.cards;
CREATE POLICY "Users can insert own cards"
  ON public.cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cards" ON public.cards;
CREATE POLICY "Users can update own cards"
  ON public.cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own cards" ON public.cards;
CREATE POLICY "Users can delete own cards"
  ON public.cards FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update trigger for cards
DROP TRIGGER IF EXISTS set_updated_at_cards ON public.cards;
CREATE TRIGGER set_updated_at_cards
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================
