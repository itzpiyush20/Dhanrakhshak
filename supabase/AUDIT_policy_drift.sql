-- AUDIT_policy_drift.sql
--
-- READ-ONLY. Nothing here changes anything — every statement is a SELECT.
-- Safe to paste into the Supabase SQL editor and run whole.
--
-- WHY THIS EXISTS
--
-- schema.sql only runs when a database is CREATED. Production predates most of
-- it, so anything added to schema.sql afterwards reaches production ONLY if a
-- numbered migration also delivers it. That trap has now caught this project
-- three times:
--
--   1. razorpay_subscription_id  — column in schema.sql, absent in production
--   2. is_admin                  — same, and it broke every UPDATE on profiles
--   3. signin_logs SELECT policy — schema.sql said is_admin(), production still
--                                  had an email-domain check (fixed by 039)
--
-- Each was found by accident, one at a time. These queries find the rest on
-- purpose. Run them AFTER applying 039.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. THE ONE THAT MATTERS MOST
-- Any policy still keyed to an email domain rather than a real identity check.
-- EXPECT: zero rows. A hit means someone who controls that domain can read the
-- table.
-- ─────────────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual ILIKE '%@%' OR with_check ILIKE '%@%')
 ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Did 039 actually land?
-- EXPECT: exactly one SELECT policy on signin_logs, qual = is_admin(),
-- with no mention of any domain.
-- ─────────────────────────────────────────────────────────────────────────
SELECT policyname, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'signin_logs'
   AND cmd = 'SELECT';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tables with RLS enabled but NO policies at all.
-- Under RLS, no policy means no access for normal roles — usually a table that
-- silently stopped working rather than a security hole, but worth knowing.
-- ─────────────────────────────────────────────────────────────────────────
SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relrowsecurity
   AND NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
   )
 ORDER BY 1;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Tables with NO row-level security at all.
-- The anon key ships in the public JavaScript bundle, so any public table
-- without RLS is readable by anyone who opens devtools.
-- EXPECT: only tables you deliberately made public, if any.
-- ─────────────────────────────────────────────────────────────────────────
SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity
 ORDER BY 1;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Policies that grant unconditionally (USING true / WITH CHECK true).
-- Migration 032 removed two of these from signin_logs and feedback because the
-- anon key could write unlimited rows. support_tickets keeps an open INSERT on
-- purpose — it is rate-limited by a trigger instead — so expect that one.
-- ─────────────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename, cmd;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Columns schema.sql expects that production may never have received.
-- This is the exact class that bit razorpay_subscription_id and is_admin.
-- EXPECT: every row reports 'present'. Anything 'MISSING' needs a migration.
-- ─────────────────────────────────────────────────────────────────────────
WITH expected(tbl, col) AS (
  VALUES
    ('profiles','is_admin'),
    ('profiles','razorpay_subscription_id'),
    ('profiles','subscription_status'),
    ('profiles','subscription_plan_type'),
    ('profiles','subscription_expires_at'),
    ('profiles','pending_plan_type'),
    ('profiles','pending_activates_at'),
    ('transactions','approval_status'),
    ('transactions','email_message_id')
)
SELECT e.tbl, e.col,
       CASE WHEN c.column_name IS NULL THEN 'MISSING' ELSE 'present' END AS status
  FROM expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name   = e.tbl
   AND c.column_name  = e.col
 ORDER BY status, e.tbl, e.col;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. The unique index that makes concurrent/retried scans safe.
-- It pairs with the 23505 row-by-row insert fallback in emailScanner.
-- EXPECT: one row. If absent, duplicate transactions can be inserted.
-- ─────────────────────────────────────────────────────────────────────────
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename  = 'transactions'
   AND indexdef ILIKE '%email_message_id%'
   AND indexdef ILIKE '%unique%';

-- NOTE: admin_* functions correctly raise "admin only" when run here, because
-- the SQL editor carries no JWT so auth.uid() is NULL. That is not a failed
-- migration. To test one, impersonate inside a transaction:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<your admin user id>"}', true);
--   SELECT public.is_admin();
--   ROLLBACK;
