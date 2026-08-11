-- ============================================================
-- Migration 013 — Split AI quota: email-scan classification vs
-- AI-insights generation (one-time, run once against an existing
-- production database; the objects this creates are already part
-- of supabase/schema.sql for fresh installs)
--
-- Before this migration, analyzeTransactionEmailWithAI (called once per
-- scanned email during a Gmail scan) and generateAIInsights (a separate,
-- on-demand insights feature) shared the same ai_calls_count/
-- ai_calls_reset_at counters and the same 50-calls/day limit. A single
-- scan can touch dozens of emails, so scanning alone could exhaust the
-- shared quota and starve the unrelated insights feature (or vice
-- versa). This adds a second counter pair so the two features have
-- independent budgets.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_scan_calls_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_scan_calls_reset_at TIMESTAMPTZ NOT NULL DEFAULT now();
