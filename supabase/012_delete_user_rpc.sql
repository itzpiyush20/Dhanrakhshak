-- ============================================================
-- Migration 012 — delete_user() RPC (account erasure)
--
-- src/services/profiles.ts has always called supabase.rpc('delete_user'),
-- but the function was never defined in any migration. Every deletion
-- therefore fell through to the fallback purge, which wipes the user's rows
-- but leaves the auth.users record intact — so "Delete Account" never
-- actually deleted the account, contrary to the Privacy Policy's promise of
-- complete erasure.
--
-- profiles.id references auth.users(id) ON DELETE CASCADE, and every other
-- user table cascades from profiles, so deleting the auth row erases
-- transactions, budgets, cards, merchant rules, scan logs, scan rejections,
-- insurance policies and the stored Google refresh token in one statement.
--
-- SECURITY DEFINER is required (auth.users is not writable by the
-- authenticated role) but is safe here: the WHERE clause is pinned to
-- auth.uid(), so a caller can only ever delete themselves. There are no
-- parameters, which removes any question of a caller-supplied id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
-- Pin search_path so the function body can't be redirected by a caller-set
-- search_path — standard hardening for SECURITY DEFINER functions.
SET search_path = public, auth
AS $$
  DELETE FROM auth.users WHERE id = auth.uid();
$$;

-- Only signed-in users may call it, and only for themselves.
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
