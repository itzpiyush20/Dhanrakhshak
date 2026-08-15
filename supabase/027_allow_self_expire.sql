-- 027_allow_self_expire.sql
--
-- Lets the app mark a lapsed subscription as expired.
--
-- Two places try this today — AuthContext when the profile loads, and the
-- scanner before it checks entitlement — and both are refused by
-- protect_server_only_profile_columns, because subscription_status is a
-- server-managed column. The writes fail silently into a console warning, so a
-- subscription whose date has passed keeps its stale 'active' status in the
-- database forever.
--
-- The exemption below permits exactly one transition and nothing else:
--
--   * only active/trial  ->  expired
--   * only when subscription_expires_at has ALREADY passed
--   * only when the expiry date, plan type, razorpay ids and is_admin are all
--     unchanged in the same statement
--
-- That is strictly a downgrade. It cannot extend a subscription, change a
-- plan, or grant admin — the paths this trigger exists to block. Anything
-- else still raises, and the service-role bypass above is untouched.
--
-- The rest of the function is identical to migration 004. It is restated in
-- full because CREATE OR REPLACE replaces the whole body.

BEGIN;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Verify the exemption is narrow. As an ordinary user (see the pattern used in
-- earlier verification steps), each of these must STILL be refused:
--
--   * setting subscription_status = 'active'
--   * pushing subscription_expires_at further out
--   * setting is_admin = true
--   * setting status = 'expired' while the expiry date is still in the future
--
-- Only a genuinely lapsed account may mark itself expired.
