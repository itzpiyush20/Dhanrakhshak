-- ============================================================
-- Migration 003 — Data Minimization (one-time, run once against
-- an existing production database; the column/index structure
-- this depends on is already part of supabase/schema.sql)
--
-- Stops populating notes and card_last4 in new inserts (already
-- true of the application code). This script clears existing
-- values to comply with minimal data retention. The columns are
-- kept for schema compatibility; application code no longer
-- writes to them.
-- ============================================================

-- 1. Null out existing notes (raw email body — should never be stored)
UPDATE public.transactions
  SET notes = NULL
  WHERE notes IS NOT NULL;

-- 2. Null out existing card_last4 (partial card numbers — PII)
UPDATE public.transactions
  SET card_last4 = NULL
  WHERE card_last4 IS NOT NULL;
