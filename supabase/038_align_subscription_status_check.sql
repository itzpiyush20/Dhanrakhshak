-- 038_align_subscription_status_check.sql
--
-- Makes production accept the subscription statuses the application actually
-- writes. Until now it did not, and three features were broken because of it.
--
-- THE DRIFT. schema.sql:32 declares
--
--   CHECK (subscription_status IN ('free','trial','active','expired','cancelled'))
--
-- Production carried an older, Stripe-flavoured set instead:
--
--   CHECK (subscription_status IN ('trial','active','canceled','past_due'))
--
-- Confirmed against the live database on 2026-08-18. schema.sql was rewritten
-- at some point without a matching numbered migration, so the file and the
-- database diverged and nothing surfaced it. This is the third time this exact
-- pattern has bitten this project — see the CLAUDE.md note about
-- razorpay_subscription_id and is_admin. schema.sql is only executed when a
-- database is created; production only ever sees what a migration delivers.
--
-- Note the two differences that matter and the two that do not:
--   * 'expired' — MISSING from production. The application writes it. Broken.
--   * 'free'    — MISSING from production. Reserved by schema.sql; only test
--                 fixtures use it today, so nothing was broken by its absence,
--                 but it is restored so the file and the database agree.
--   * 'cancelled' vs 'canceled' — the repo spells it with two Ls, production
--                 with one. Nothing in the codebase writes either.
--   * 'past_due' — a Stripe status. Nothing in the codebase writes or reads it.
--
-- WHAT WAS BROKEN BY THE MISSING 'expired'. Three write sites, in descending
-- order of how badly:
--
--   1. api/admin.ts:242 — the admin "revoke subscription" action. It writes
--      'expired', then `if (error) throw error`, which the handler's outer catch
--      turns into a 500 "Operation failed. Please try again." So revoking a
--      subscription from the admin tool has NEVER worked in production; it fails
--      every time, visibly, with a message that says nothing about the cause.
--
--   2. src/context/AuthContext.tsx:352 — auto-expiry on profile load.
--   3. src/services/emailScanner.ts:1607 — auto-expiry during a scan.
--
--      Both are deliberately fire-and-forget with a console.warn, so they failed
--      SILENTLY. The consequence is that a lapsed account keeps
--      subscription_status = 'active' with a past subscription_expires_at
--      forever. Admin metrics therefore overcount active subscribers.
--
--   4. Consequence rather than a site: the self-expiry carve-out in the
--      protect_server_only_profile_columns trigger (027, restated in 033 and
--      035) permits a client to set status 'expired' once the date has passed.
--      That branch has been unreachable in production the whole time, because
--      the CHECK rejected the write before the trigger's permission mattered.
--
-- NOT a paywall hole, and worth stating so nobody "fixes" the gates too. Access
-- is decided by comparing subscription_expires_at against now() —
-- isPremiumProfile() in src/services/subscription.ts and the entitlement in
-- AuthContext both do this — never by trusting the status string alone. A lapsed
-- account with a stale 'active' status is still correctly denied paid screens.
-- What was wrong was the bookkeeping, not the authorisation.
--
-- SAFE TO REPLACE RATHER THAN WIDEN. Checked the data before writing this: the
-- table held only 'active' (6 rows) and 'trial' (3 rows) — no row used
-- 'canceled' or 'past_due'. So the old set can be dropped outright instead of
-- being unioned in, and production ends up matching schema.sql exactly rather
-- than accumulating both spellings forever. Re-run the count in the verify
-- block below before applying if any time has passed.

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

-- Identical to schema.sql:32. If you ever change one, ship the other as a
-- migration in the same commit.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('free', 'trial', 'active', 'expired', 'cancelled'));

COMMIT;

-- Verify afterwards:
--
--   -- expect exactly these five, one per row:
--   -- free, trial, active, expired, cancelled
--   SELECT unnest(regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''::text', 'g'))
--            AS allowed_status
--     FROM pg_constraint
--    WHERE conrelid = 'public.profiles'::regclass
--      AND conname = 'profiles_subscription_status_check';
--
--   -- expect every existing row to be inside that set. Run this BEFORE
--   -- applying too: if anything holds 'canceled' or 'past_due', the ALTER above
--   -- will be rejected and those rows must be migrated first.
--   SELECT subscription_status, count(*)
--     FROM public.profiles
--    GROUP BY subscription_status
--    ORDER BY count(*) DESC;
--
-- Then prove the three broken paths work, on a throwaway account:
--
--   -- 1. The write that used to be rejected outright.
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
--   UPDATE public.profiles
--      SET subscription_status = 'expired',
--          subscription_expires_at = now() - interval '1 day'
--    WHERE id = '<throwaway uuid>';
--   -- expect success. Before this migration: 23514 check-constraint violation.
--
--   -- 2. The admin revoke action end to end, from the admin UI. Expect success
--   --    rather than "Operation failed. Please try again."
--
--   -- 3. Auto-expiry. Give an account a past expiry with status 'active', open
--   --    the app as that account, and confirm the row flips to 'expired'
--   --    instead of failing into a console warning.
