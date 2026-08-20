-- AUDIT_policy_drift.sql
--
-- READ-ONLY. One single statement, so the Supabase SQL editor returns EVERY
-- check in one result table. (The earlier version of this file was seven
-- separate statements, and the editor only displays the last one's output —
-- so six checks ran invisibly.)
--
-- Paste the whole file, hit Run, read the 7 rows.
--
-- WHY THIS EXISTS
--
-- schema.sql only runs when a database is CREATED. Anything added to it later
-- reaches production ONLY if a numbered migration also delivers it. That trap
-- has caught this project three times: razorpay_subscription_id, is_admin, and
-- the signin_logs SELECT policy that migration 039 fixes. Each was found by
-- accident. This finds the rest on purpose.
--
-- Run it AFTER applying 039_fix_signin_logs_admin_read.sql.
--
-- Row 1 is the one that matters most. Anything 🔴 needs action.

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
),
rls_tables AS (
  SELECT c.relname::text AS tbl, c.relrowsecurity AS rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
),
-- 1. Policies keyed to an email address/domain instead of an identity check.
c1 AS (
  SELECT (tablename || ' / ' || policyname)::text AS d
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (qual ILIKE '%@%' OR with_check ILIKE '%@%')
),
-- 2. The signin_logs SELECT policy specifically — did 039 land?
c2 AS (
  SELECT policyname::text AS name, COALESCE(qual, '(null)')::text AS q
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'signin_logs' AND cmd = 'SELECT'
),
-- 3. RLS enabled but no policies: table is locked to everyone, usually a bug.
c3 AS (
  SELECT t.tbl AS d
    FROM rls_tables t
   WHERE t.rls_on
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tbl
     )
),
-- 4. No RLS at all. The anon key is public, so these are world-readable.
c4 AS (
  SELECT tbl AS d FROM rls_tables WHERE NOT rls_on
),
-- 5. Unconditional grants. support_tickets keeps one on purpose (rate-limited
--    by a trigger instead), so it is excluded from the verdict but still shown.
c5 AS (
  SELECT (tablename || ' / ' || policyname || ' (' || cmd || ')')::text AS d,
         tablename::text AS tbl
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (qual = 'true' OR with_check = 'true')
),
-- 6. Columns schema.sql expects that production may never have received.
c6 AS (
  SELECT (e.tbl || '.' || e.col)::text AS d
    FROM expected e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name   = e.tbl
     AND c.column_name  = e.col
   WHERE c.column_name IS NULL
),
-- 7. The unique index the scanner's 23505 insert fallback depends on.
c7 AS (
  SELECT indexname::text AS d
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'transactions'
     AND indexdef ILIKE '%email_message_id%'
     AND indexdef ILIKE '%unique%'
)
SELECT * FROM (
  SELECT 1 AS ord,
         '1. Email-domain policies (MOST IMPORTANT)'::text AS check_name,
         CASE WHEN EXISTS (SELECT 1 FROM c1) THEN '🔴 FAIL' ELSE '✅ PASS' END::text AS status,
         COALESCE((SELECT string_agg(d, '; ' ORDER BY d) FROM c1),
                  'none — no policy keyed to an email domain')::text AS detail
  UNION ALL
  SELECT 2,
         '2. signin_logs SELECT policy (migration 039)',
         CASE
           WHEN (SELECT count(*) FROM c2) = 1
            AND EXISTS (SELECT 1 FROM c2 WHERE q ILIKE '%is_admin%')
           THEN '✅ PASS'
           WHEN (SELECT count(*) FROM c2) = 0 THEN '🔴 FAIL (no policy)'
           ELSE '🔴 FAIL'
         END,
         COALESCE((SELECT string_agg(name || ' -> ' || q, '; ' ORDER BY name) FROM c2),
                  'no SELECT policy on signin_logs at all')
  UNION ALL
  SELECT 3,
         '3. RLS enabled but zero policies',
         CASE WHEN EXISTS (SELECT 1 FROM c3) THEN '⚠️ CHECK' ELSE '✅ PASS' END,
         COALESCE((SELECT string_agg(d, ', ' ORDER BY d) FROM c3), 'none')
  UNION ALL
  SELECT 4,
         '4. Tables with NO row-level security',
         CASE WHEN EXISTS (SELECT 1 FROM c4) THEN '🔴 FAIL' ELSE '✅ PASS' END,
         COALESCE((SELECT string_agg(d, ', ' ORDER BY d) FROM c4),
                  'none — every public table has RLS')
  UNION ALL
  SELECT 5,
         '5. Unconditional (true) grants',
         CASE WHEN EXISTS (SELECT 1 FROM c5 WHERE tbl <> 'support_tickets')
              THEN '⚠️ CHECK' ELSE '✅ PASS' END,
         COALESCE((SELECT string_agg(d, '; ' ORDER BY d) FROM c5),
                  'none')
  UNION ALL
  SELECT 6,
         '6. Columns schema.sql expects but production may lack',
         CASE WHEN EXISTS (SELECT 1 FROM c6) THEN '🔴 FAIL' ELSE '✅ PASS' END,
         COALESCE((SELECT string_agg(d, ', ' ORDER BY d) FROM c6), 'all present')
  UNION ALL
  SELECT 7,
         '7. Scanner dedup unique index',
         CASE WHEN EXISTS (SELECT 1 FROM c7) THEN '✅ PASS' ELSE '🔴 FAIL' END,
         COALESCE((SELECT string_agg(d, ', ' ORDER BY d) FROM c7),
                  'MISSING — concurrent scans could insert duplicates')
) AS results
ORDER BY ord;

-- NOTE: admin_* functions correctly raise "admin only" when run in this editor,
-- because it carries no JWT so auth.uid() is NULL. That is NOT a failed
-- migration. To test one, impersonate inside a transaction:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<your admin user id>"}', true);
--   SELECT public.is_admin();
--   ROLLBACK;
