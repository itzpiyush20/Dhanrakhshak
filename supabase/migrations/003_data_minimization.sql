-- ============================================================
-- Migration 003 — Data Minimization
-- Stops populating notes and card_last4 in new inserts.
-- Clears existing values to comply with minimal data retention.
-- The columns are kept for schema compatibility; application
-- code no longer writes to them.
-- ============================================================

-- 1. Null out existing notes (raw email body — should never be stored)
UPDATE public.transactions
  SET notes = NULL
  WHERE notes IS NOT NULL;

-- 2. Null out existing card_last4 (partial card numbers — PII)
UPDATE public.transactions
  SET card_last4 = NULL
  WHERE card_last4 IS NOT NULL;

-- 3. Ensure transaction_time column exists (from 002, idempotent)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transaction_time TEXT;

-- 4. Add index on reference_id for faster deduplication lookups
CREATE INDEX IF NOT EXISTS idx_txn_reference_id
  ON public.transactions (user_id, reference_id)
  WHERE reference_id IS NOT NULL;
