-- ============================================================
-- RUN THIS BEFORE DEPLOYING branch claude/scanner-not-responding-05qrpk
--
-- Combined bundle of migrations 014, 015 and 016, in order. Every statement is
-- idempotent, so running it twice is harmless.
--
-- The code on that branch writes transactions.currency and
-- transactions.merged_email_message_ids on EVERY scanned transaction, and
-- selects both in the dedup preload. Neither column exists yet. Deploying the
-- code first would make every insert and the preload SELECT fail, which stops
-- the scanner completely.
--
-- Apply in the Supabase SQL editor, confirm the verification query at the
-- bottom returns three rows, then deploy.
-- ============================================================

-- ── 014: manual-scan quotas ─────────────────────────────────
ALTER TABLE public.email_scan_logs
  ADD COLUMN IF NOT EXISTS scan_mode TEXT
    CHECK (scan_mode IN ('manual', 'scheduled'));

CREATE INDEX IF NOT EXISTS idx_email_scan_logs_manual_quota
  ON public.email_scan_logs (user_id, scan_mode, status, scanned_at DESC);

-- ── 015: duplicate-payment merging ──────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS merged_email_message_ids TEXT[];

CREATE INDEX IF NOT EXISTS idx_transactions_merged_email_ids
  ON public.transactions USING GIN (merged_email_message_ids)
  WHERE merged_email_message_ids IS NOT NULL;

-- ── 016: multi-currency ─────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

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

CREATE INDEX IF NOT EXISTS idx_transactions_currency
  ON public.transactions (user_id, currency, date DESC);

-- ── Verification — must return exactly 3 rows ───────────────
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'transactions' AND column_name IN ('currency', 'merged_email_message_ids'))
   OR (table_name = 'email_scan_logs' AND column_name = 'scan_mode')
ORDER BY table_name, column_name;
