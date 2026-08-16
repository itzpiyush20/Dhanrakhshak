-- 033_pin_security_definer_search_path.sql
--
-- Pins search_path on the two SECURITY DEFINER functions that production is
-- still running without it.
--
-- A SECURITY DEFINER function executes with the privileges of the role that
-- DEFINED it, not the caller. If its search_path is not pinned, the CALLER's
-- search_path decides which schema each unqualified name in the body resolves
-- to — so a caller able to create an object earlier on that path can have the
-- elevated body run their object instead of the intended one. Pinning it is the
-- standard hardening, and it is what Supabase's own linter flags as "Function
-- Search Path Mutable".
--
-- Where each one stands:
--
--   is_admin                            already pinned by migration 023. Fine.
--   delete_user                         already pinned by migration 012. Fine.
--   protect_server_only_profile_columns defined by 004 and redefined by 027,
--                                       NEITHER pinned. Live in production.
--   handle_new_user                     only ever defined in schema.sql, which
--                                       ran unpinned when the database was
--                                       created. Live in production.
--
-- Neither function's BEHAVIOUR changes here. The body of
-- protect_server_only_profile_columns is reproduced verbatim from 027 — including
-- the self-expiry exemption — because CREATE OR REPLACE replaces the whole
-- function and dropping that exemption would re-break the lapsed-subscription
-- write that 027 exists to allow.
--
-- Low exploitability on a default Supabase project (Postgres 15+ no longer
-- grants CREATE on the public schema to PUBLIC), which is why this is hardening
-- rather than an incident. Shipped separately from the rest of the batch so it
-- can be applied, or not, on its own.

BEGIN;

-- ── 1. The profiles guard ─────────────────────────────────────────────────
-- Body identical to 027. Only the SET search_path clause is added.
CREATE OR REPLACE FUNCTION public.protect_server_only_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Server-side code (webhook.ts, verify-payment.ts, redeem-promo.ts) uses the
  -- service-role key and is trusted with everything.
  IF auth.jwt() ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Self-expiry: a strict downgrade, only after the date has passed, with no
  -- other guarded column moving.
  IF NEW.subscription_status = 'expired'
     AND OLD.subscription_status IN ('active', 'trial')
     AND OLD.subscription_expires_at IS NOT NULL
     AND OLD.subscription_expires_at <= now()
     AND NEW.subscription_expires_at  IS NOT DISTINCT FROM OLD.subscription_expires_at
     AND NEW.subscription_plan_type   IS NOT DISTINCT FROM OLD.subscription_plan_type
     AND NEW.razorpay_subscription_id IS NOT DISTINCT FROM OLD.razorpay_subscription_id
     AND NEW.razorpay_order_id        IS NOT DISTINCT FROM OLD.razorpay_order_id
     AND NEW.is_admin                 IS NOT DISTINCT FROM OLD.is_admin
  THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_status       IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_plan_type  IS DISTINCT FROM OLD.subscription_plan_type
     OR NEW.razorpay_subscription_id IS DISTINCT FROM OLD.razorpay_subscription_id
     OR NEW.razorpay_order_id        IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.is_admin                 IS DISTINCT FROM OLD.is_admin
  THEN
    RAISE EXCEPTION 'Cannot modify server-managed subscription/admin fields directly';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- ── 2. Profile creation on signup ─────────────────────────────────────────
-- Body identical to schema.sql. Only the SET search_path clause is added.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verify afterwards — expect proconfig to contain a search_path entry for all
-- four, and no NULLs:
--
--   SELECT p.proname, p.prosecdef, p.proconfig
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prosecdef
--      AND p.proname IN ('is_admin', 'delete_user',
--                        'protect_server_only_profile_columns',
--                        'handle_new_user');
--
-- Then confirm the guard still guards. As an ordinary (non-service-role) user,
-- each of these must STILL be refused:
--   * setting subscription_status = 'active'
--   * pushing subscription_expires_at further out
--   * setting is_admin = true
-- and a genuinely lapsed account must still be able to mark itself 'expired'.
