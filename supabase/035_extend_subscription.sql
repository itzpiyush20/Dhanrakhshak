-- 035_extend_subscription.sql
--
-- Plan-change semantics: upgrade now, renewal and downgrade queued.
--
-- Owner's rules, 2026-08-18:
--   * monthly -> annual while monthly runs: activate NOW, DROP the remaining
--     days. Chosen deliberately over proration. Not a bug.
--   * same plan bought again, or annual -> monthly: take the money, do NOT
--     activate. The running plan finishes untouched and the paid-for plan
--     activates by itself at that expiry.
--   * anything already queued: checkout is refused (api/create-order.ts).
--   * no active plan: activate now.
--
-- Coupons are NOT routed through here. The owner is redeciding their criteria;
-- api/redeem-promo.ts keeps its existing behaviour until then.

BEGIN;

-- ── 1. Where a queued plan lives ──────────────────────────────────────────
-- All four are NULL together or set together. pending_plan_type IS NOT NULL is
-- the single "something is queued" test used by every caller.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_plan_type TEXT
    CHECK (pending_plan_type IS NULL OR pending_plan_type IN ('monthly', 'annual'));
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_duration_days INT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_order_id TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_activates_at TIMESTAMPTZ;

-- ── 2. Guard the new columns, and carve out activation ────────────────────
-- Body is 033's, plus the pending_* columns in both lists and one new allowed
-- transition. Keep the SET search_path clause — 033 exists to pin it.
CREATE OR REPLACE FUNCTION public.protect_server_only_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Server-side code (webhook.ts, verify-payment.ts, redeem-promo.ts) uses the
  -- service-role key and is trusted with everything.
  IF auth.jwt() ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Pending-plan activation, called by the account's owner via
  -- activate_pending_plan(). Deliberately narrow: the row must have carried a
  -- pending plan whose date has actually arrived, and NEW must be exactly what
  -- activating it produces. A client cannot fabricate the precondition because
  -- the pending_* columns are themselves guarded below — only server code can
  -- ever set them.
  IF OLD.pending_plan_type IS NOT NULL
     AND OLD.pending_activates_at IS NOT NULL
     AND OLD.pending_activates_at <= now()
     AND NEW.pending_plan_type       IS NULL
     AND NEW.pending_duration_days   IS NULL
     AND NEW.pending_activates_at    IS NULL
     AND NEW.subscription_status      = 'active'
     AND NEW.subscription_plan_type   = OLD.pending_plan_type
     AND NEW.subscription_expires_at  = OLD.pending_activates_at
                                        + make_interval(days => OLD.pending_duration_days)
     AND NEW.is_admin                 IS NOT DISTINCT FROM OLD.is_admin
     AND NEW.razorpay_subscription_id IS NOT DISTINCT FROM OLD.razorpay_subscription_id
  THEN
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
     AND NEW.pending_plan_type        IS NOT DISTINCT FROM OLD.pending_plan_type
     AND NEW.pending_duration_days    IS NOT DISTINCT FROM OLD.pending_duration_days
     AND NEW.pending_order_id         IS NOT DISTINCT FROM OLD.pending_order_id
     AND NEW.pending_activates_at     IS NOT DISTINCT FROM OLD.pending_activates_at
  THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_status        IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at  IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_plan_type   IS DISTINCT FROM OLD.subscription_plan_type
     OR NEW.razorpay_subscription_id IS DISTINCT FROM OLD.razorpay_subscription_id
     OR NEW.razorpay_order_id        IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.is_admin                 IS DISTINCT FROM OLD.is_admin
     OR NEW.pending_plan_type        IS DISTINCT FROM OLD.pending_plan_type
     OR NEW.pending_duration_days    IS DISTINCT FROM OLD.pending_duration_days
     OR NEW.pending_order_id         IS DISTINCT FROM OLD.pending_order_id
     OR NEW.pending_activates_at     IS DISTINCT FROM OLD.pending_activates_at
  THEN
    RAISE EXCEPTION 'Cannot modify server-managed subscription/admin fields directly';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMIT;
