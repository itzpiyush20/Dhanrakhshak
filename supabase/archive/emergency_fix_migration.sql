-- ============================================================
-- DHANRAKSHAK — EMERGENCY FIX MIGRATION
-- Run this ENTIRE file in Supabase SQL Editor to fix the app
-- Dashboard → SQL Editor → paste all → Run
-- SAFE TO RUN MULTIPLE TIMES (all use IF NOT EXISTS)
-- ============================================================

-- ==========================================
-- FIX 1: CREATE MISSING signin_logs TABLE
-- Missing from your database, causing auth to fail silently
-- ==========================================

CREATE TABLE IF NOT EXISTS public.signin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.signin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert signin logs" ON public.signin_logs;
CREATE POLICY "Anyone can insert signin logs"
  ON public.signin_logs FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Creators can view all signin logs" ON public.signin_logs;
CREATE POLICY "Creators can view all signin logs"
  ON public.signin_logs FOR SELECT
  USING ((auth.jwt() ->> 'email') LIKE '%@dhanrakshak.in');

-- ==========================================
-- FIX 2: CREATE MISSING email_scan_logs TABLE
-- Used by PendingPage for inactivity tracking
-- ==========================================

CREATE TABLE IF NOT EXISTS public.email_scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success',
  emails_scanned INTEGER DEFAULT 0,
  transactions_found INTEGER DEFAULT 0,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scan logs" ON public.email_scan_logs;
CREATE POLICY "Users can view own scan logs"
  ON public.email_scan_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own scan logs" ON public.email_scan_logs;
CREATE POLICY "Users can insert own scan logs"
  ON public.email_scan_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ==========================================
-- FIX 3: ADD MISSING COLUMNS to transactions
-- Required by the V2 email scanner engine
-- ==========================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS card_last4 TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_issuer TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ==========================================
-- FIX 4: ADD MISSING COLUMNS to profiles
-- Required by Settings page preferences
-- ==========================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS budget_alerts_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_reminders_enabled BOOLEAN DEFAULT true;

-- ==========================================
-- FIX 5: UNIQUE CONSTRAINT for deduplication
-- Prevents duplicate email-based transactions
-- ==========================================

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

-- ==========================================
-- FIX 6: PERFORMANCE INDEXES
-- ==========================================

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
-- FIX 7: CREATE merchant_rules TABLE
-- Self-learning engine — persistent category memory
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

-- ==========================================
-- FIX 8: CREATE cards TABLE
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

-- ============================================================
-- MIGRATION COMPLETE — App should load correctly after this
-- ============================================================
