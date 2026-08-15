-- 023_is_admin_backfill.sql
--
-- Delivers the admin flag to databases that predate it.
--
-- `profiles.is_admin` and the `public.is_admin()` helper were only ever written
-- into supabase/schema.sql, which runs when a database is FIRST created. They
-- were added to that file after this project's database already existed, and no
-- numbered migration ever carried them, so production has neither.
--
-- Two things break as a result:
--
--   1. Every function in 022_admin_metrics.sql calls public.is_admin() as its
--      access guard. Without the function they all fail, and the admin panel
--      shows nothing but errors.
--
--   2. Worse, and unrelated to the admin panel: the
--      protect_server_only_profile_columns trigger (migration 004) reads
--      NEW.is_admin. PL/pgSQL plans that whole IF expression before evaluating
--      any of it, so a missing column aborts EVERY non-service-role UPDATE on
--      profiles with `42703: column "is_admin" does not exist` — including
--      ordinary app writes like daily_scan_time and profile settings. This is
--      the same failure migration 021 fixed for razorpay_subscription_id; that
--      error simply surfaced first and masked this one.
--
-- Safe to re-run.

BEGIN;

-- 1. The column the trigger and the guard both depend on.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. The helper every admin function and admin RLS policy calls.
--    SECURITY DEFINER so it can read profiles.is_admin without recursing into
--    the RLS policies that call it. STABLE because it does not write.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = uid), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMIT;

-- Verify afterwards:
--
--   -- expect one row
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND column_name = 'is_admin';
--
--   -- expect false (you are not admin yet; the point is that it ANSWERS)
--   SELECT public.is_admin();
--
-- Then grant yourself admin:
--
--   UPDATE public.profiles SET is_admin = true WHERE email = '<your email>';
--
-- That UPDATE touches a column the protect_server_only_profile_columns trigger
-- guards, so if it is refused with 'Cannot modify server-managed
-- subscription/admin fields directly', wrap it:
--
--   BEGIN;
--   ALTER TABLE public.profiles DISABLE TRIGGER protect_server_only_profile_columns;
--   UPDATE public.profiles SET is_admin = true WHERE email = '<your email>';
--   ALTER TABLE public.profiles ENABLE TRIGGER protect_server_only_profile_columns;
--   COMMIT;
