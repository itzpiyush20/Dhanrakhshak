-- ============================================================
-- Migration 004 — Subscription lockdown + AI rate-limit columns
-- (one-time, run once against an existing production database;
-- the objects this creates are already part of supabase/schema.sql
-- for fresh installs)
--
-- 1. Closes a privilege-escalation hole: the "Users can update own
--    profile" RLS policy allowed any authenticated user to write
--    ANY column on their own profiles row, including
--    subscription_status / subscription_expires_at / is_admin —
--    i.e. any user could grant themselves premium (or admin) via
--    a direct Supabase client call, bypassing Razorpay entirely.
--    RLS policies can't restrict by column, so this adds a
--    BEFORE UPDATE trigger that rejects changes to the protected
--    columns unless the request is running as the service role
--    (server-side webhook/API code), which the app already uses
--    for legitimate subscription writes.
--
-- 2. Adds per-user counters so the Gemini AI-insights proxy can
--    enforce a durable daily quota (in-memory rate limiting in a
--    serverless function resets on every cold start / is per-
--    instance, so it doesn't actually limit anything under load).
-- ============================================================

-- 1. Server-only columns lockdown -------------------------------

CREATE OR REPLACE FUNCTION public.protect_server_only_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.jwt() ->> 'role' is 'service_role' only for requests made
  -- with the service-role key (webhook.ts, verify-payment.ts, etc).
  -- Regular user sessions carry role 'authenticated'.
  IF auth.jwt() ->> 'role' = 'service_role' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_server_only_profile_columns ON public.profiles;
CREATE TRIGGER protect_server_only_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_server_only_profile_columns();

-- 2. AI rate-limit counters ---------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_calls_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_calls_reset_at TIMESTAMPTZ NOT NULL DEFAULT now();
