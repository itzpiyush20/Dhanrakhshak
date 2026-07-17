-- ============================================================
-- Migration 005 — Returnable expenses + insurance policy reminders
-- (one-time, run once against an existing production database;
-- the objects this creates are already part of supabase/schema.sql
-- for fresh installs)
--
-- 1. Adds returnable-expense tracking to transactions: a debit can be
--    flagged as money the user expects back, with who owes it, when
--    it's expected, and whether it's been settled.
-- 2. Adds an insurance_policies table so users can record life/health
--    premiums and get reminded before they're due.
-- ============================================================

-- 1. Returnable expense columns ----------------------------------

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_returnable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS counterparty TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS expected_return_date DATE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS return_status TEXT CHECK (return_status IN ('pending', 'received'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS settled_by_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- 2. Insurance policies table --------------------------------------

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('life', 'health')),
  premium_amount DECIMAL(12, 2) NOT NULL CHECK (premium_amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'annual')),
  next_due_date DATE NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insurance policies"
  ON public.insurance_policies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own insurance policies"
  ON public.insurance_policies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insurance policies"
  ON public.insurance_policies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insurance policies"
  ON public.insurance_policies FOR DELETE
  USING (auth.uid() = user_id);
