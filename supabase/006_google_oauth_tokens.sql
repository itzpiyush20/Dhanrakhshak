-- ============================================================
-- Migration 006 — Server-side Google refresh token storage
-- (one-time, run once against an existing production database;
-- the objects this creates are already part of supabase/schema.sql
-- for fresh installs)
--
-- Stores each user's Google OAuth refresh token so a server-side cron
-- job can sync Gmail without a live browser session. RLS is enabled
-- with NO policies — only the service-role key (used exclusively in
-- /api serverless functions) can read or write this table. The
-- browser's anon/authenticated client has zero access by default-deny.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
