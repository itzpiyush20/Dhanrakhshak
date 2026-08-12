-- ============================================================
-- 014_scan_mode_quota.sql
--
-- Supports the tiered manual-scan quotas in
-- plans/email-scanner-requirements.md (R6/R7/R8):
--
--   free            1 manual scan per day, no automatic scan
--   premium/trial   daily automatic scan + 2 manual scans per day
--   owner           daily automatic scan + unlimited manual scans
--
-- The quota counts ONLY manual scans, so a user's automatic daily scan never
-- eats into their manual allowance ("in addition to", per R7). That requires
-- telling the two apart, which is what `scan_mode` is for.
--
-- The column is already declared in schema.sql and in the archived
-- 002_scanner_overhaul migration, but no code ever wrote to it, and it may or
-- may not exist on a given deployment. Both statements below are idempotent,
-- so this is safe to run whatever state the database is in.
-- ============================================================

ALTER TABLE public.email_scan_logs
  ADD COLUMN IF NOT EXISTS scan_mode TEXT
    CHECK (scan_mode IN ('manual', 'scheduled'));

-- Deliberately NOT backfilling historical rows.
--
-- Every existing row has scan_mode NULL, and the quota query filters on
-- scan_mode = 'manual', so those rows simply do not count. Backfilling them to
-- 'manual' would instead make yesterday's automatic cron scans consume today's
-- manual allowance and lock users out for their first day on the new build.
--
-- Leaving them NULL fails open for a single rolling 24-hour window after
-- deploy, after which every scan carries its own mode and the quota is exact.

-- The quota query filters user_id + status + scan_mode over a trailing 24h
-- window and orders by scanned_at. The existing idx_email_scan_logs_user
-- (user_id, scanned_at DESC) cannot serve the mode/status predicates.
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_manual_quota
  ON public.email_scan_logs (user_id, scan_mode, status, scanned_at DESC);
