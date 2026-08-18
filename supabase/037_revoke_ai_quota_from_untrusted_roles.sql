-- 037_revoke_ai_quota_from_untrusted_roles.sql
--
-- Closes a live quota-bypass hole: the two AI-quota functions from 019 were
-- callable by `anon` and `authenticated`.
--
-- WHAT WAS WRONG. 019 hardened both functions with
--
--   REVOKE ALL ON FUNCTION public.increment_ai_call_count(...) FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.refund_ai_call_count(...)    FROM PUBLIC;
--   GRANT EXECUTE ... TO service_role;
--
-- which looks complete and is not. A Supabase project carries
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated`,
-- so every new function is granted EXECUTE to those two roles DIRECTLY.
-- `REVOKE ... FROM PUBLIC` removes the privilege held by the implicit PUBLIC
-- pseudo-role; it does not touch a grant made directly to a named role. So both
-- functions ended up reachable by anon and authenticated despite the REVOKE.
--
-- This was not theoretical. Confirmed against production on 2026-08-18:
-- information_schema.routine_privileges listed anon and authenticated against
-- both functions. The same mechanism had also left an unintended anon grant on
-- activate_pending_plan in 035, which is what led to checking these.
--
-- WHY IT MATTERED. The anon key ships in the client bundle by design, so this
-- was reachable without authenticating at all. Both functions are
-- SECURITY DEFINER — they run as the owner, so RLS does not apply — and,
-- crucially, they take the target account as a PARAMETER rather than reading
-- auth.uid(). There was therefore nothing to stop a direct PostgREST call:
--
--   POST /rest/v1/rpc/refund_ai_call_count
--   { "p_user_id": "<any uuid>", "p_purpose": "scan" }
--
-- Called in a loop that drives ai_scan_calls_count back to zero, defeating the
-- per-tier daily scan quota entirely and spending the owner's Gemini budget.
-- increment_ai_call_count is the mirror image: aimed at another account's uuid
-- it burns that user's daily quota to nothing. No data is exposed either way —
-- both functions only move those two integer counters, and GREATEST(..., 0)
-- floors them — so the damage is quota bypass and API spend, not disclosure.
--
-- WHY REVOKING IS SAFE. The only caller of either function is
-- api/gemini-proxy.ts (lines 128 and 149), which uses a client built from
-- SUPABASE_SERVICE_ROLE_KEY. Nothing under src/ calls them; no browser code
-- touches them. service_role keeps EXECUTE, so the scanner is unaffected.
--
-- NOT changed here: neither function checks that p_user_id is the caller's own
-- account. After this migration they are unreachable by untrusted roles, which
-- makes the hole closed — but the functions are still only *correct by caller
-- discipline* rather than by construction. Adding an auth.uid() guard is a
-- change to the scanner's quota path and is deliberately left for a separate,
-- explicitly approved migration.

BEGIN;

-- Revoke from the roles BY NAME. Repeating the FROM PUBLIC revoke as well would
-- be harmless but is not the fix; the direct role grants are.
REVOKE ALL ON FUNCTION public.increment_ai_call_count(UUID, TEXT, INT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_call_count(UUID, TEXT)         FROM anon, authenticated;

-- Restated so this migration is self-contained: the service role is the only
-- role that should hold EXECUTE, and it is the one api/gemini-proxy.ts uses.
GRANT EXECUTE ON FUNCTION public.increment_ai_call_count(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_call_count(UUID, TEXT)         TO service_role;

COMMIT;

-- Verify afterwards:
--
--   -- expect FOUR rows only: postgres and service_role against each function.
--   -- Any anon or authenticated row means the revoke did not take.
--   SELECT routine_name, grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public'
--      AND routine_name IN ('increment_ai_call_count', 'refund_ai_call_count')
--    ORDER BY routine_name, grantee;
--
-- Then confirm the scanner still works, because that is what these functions
-- exist for: run a Gmail scan from the app and check the quota counter moves.
--
--   SELECT id, email, ai_scan_calls_count, ai_scan_calls_reset_at
--     FROM public.profiles WHERE email = '<your account>';
--
-- ai_scan_calls_count should increment. If it does not, and the scan reports a
-- quota error, the service_role grant above did not apply — re-check the first
-- query rather than widening the grants.
--
-- ── A NOTE FOR EVERY FUTURE MIGRATION THAT CREATES A FUNCTION ──────────────
--
-- REVOKE ALL ... FROM PUBLIC IS NOT SUFFICIENT ON SUPABASE. Always revoke anon
-- (and authenticated, where it is not a legitimate caller) BY NAME, then grant
-- only the roles that need it. 012_delete_user_rpc.sql got this right; 019 did
-- not, and 035 initially missed it for activate_pending_plan. After any
-- migration that creates or replaces a function, run the routine_privileges
-- query above against the new function and read the result — the grants are not
-- what the migration file appears to say.
