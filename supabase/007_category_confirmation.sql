-- ============================================================
-- Migration 007 — Category confirmation tracking
-- (one-time, run once against an existing production database;
-- the objects this creates are already part of supabase/schema.sql
-- for fresh installs)
--
-- Adds category_confirmed_at to transactions: NULL means "the system
-- auto-categorized and auto-approved this without human review, and the
-- user hasn't confirmed the category yet." Every other transaction (manual
-- entries, anything the user explicitly approved via Pending Alerts) has
-- a timestamp here, since those never needed a silent-auto-approval
-- confirmation in the first place.
--
-- Backfill: every transaction that already exists is treated as already
-- confirmed, by explicit product decision — this feature only applies to
-- categorizations made from this point forward, not the historical backlog.
-- ============================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_confirmed_at TIMESTAMPTZ DEFAULT now();

UPDATE public.transactions SET category_confirmed_at = now() WHERE category_confirmed_at IS NULL;
