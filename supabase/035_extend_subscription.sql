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

BEGIN;

DROP FUNCTION IF EXISTS public.extend_subscription(UUID, TEXT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.apply_plan_purchase(
  p_user_id       UUID,
  p_plan_type     TEXT,
  p_duration_days INT,
  p_order_id      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.profiles%ROWTYPE;
  v_active  BOOLEAN;
  v_upgrade BOOLEAN;
  v_outcome TEXT;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 3650 THEN
    RAISE EXCEPTION 'apply_plan_purchase: implausible duration_days %', p_duration_days;
  END IF;
  IF p_plan_type IS NULL OR p_plan_type NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'apply_plan_purchase: unknown plan_type %', p_plan_type;
  END IF;

  -- FOR UPDATE is what makes this safe against the verify-payment/webhook race
  -- for one order, and against Razorpay's webhook retries. The second caller
  -- blocks here, then re-reads the row the first one wrote and takes the
  -- already-applied branch below. A read followed by a separate write would
  -- let both callers see "not yet applied" and both credit.
  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;   -- caller treats NULL as a hard failure
  END IF;

  IF p_order_id IS NOT NULL
     AND (v_row.razorpay_order_id = p_order_id OR v_row.pending_order_id = p_order_id)
  THEN
    RETURN jsonb_build_object(
      'outcome',              'already_applied',
      'expires_at',           v_row.subscription_expires_at,
      'pending_plan_type',    v_row.pending_plan_type,
      'pending_activates_at', v_row.pending_activates_at
    );
  END IF;

  v_active := v_row.subscription_status = 'active'
              AND v_row.subscription_expires_at IS NOT NULL
              AND v_row.subscription_expires_at > now();

  v_upgrade := v_active
               AND v_row.subscription_plan_type = 'monthly'
               AND p_plan_type = 'annual';

  IF NOT v_active OR v_upgrade THEN
    -- Not active: nothing to preserve. Upgrade: the owner's rule is that the
    -- remaining days are dropped. Both land on now() + duration.
    UPDATE public.profiles SET
      subscription_status     = 'active',
      subscription_plan_type  = p_plan_type,
      subscription_expires_at = now() + make_interval(days => p_duration_days),
      razorpay_order_id       = COALESCE(p_order_id, razorpay_order_id),
      updated_at              = now()
    WHERE id = p_user_id;
    v_outcome := 'activated';

  ELSIF v_row.pending_plan_type IS NOT NULL THEN
    -- create-order.ts refuses a purchase while anything is queued, so getting
    -- here means a race beat that check. The money is already taken and must
    -- not be dropped: add the duration to what is queued.
    UPDATE public.profiles SET
      pending_duration_days = v_row.pending_duration_days + p_duration_days,
      pending_order_id      = COALESCE(p_order_id, pending_order_id),
      updated_at            = now()
    WHERE id = p_user_id;
    v_outcome := 'queue_extended';

  ELSE
    -- Same-plan renewal, or annual -> monthly downgrade. Take the money, leave
    -- the running plan alone, activate at its expiry.
    UPDATE public.profiles SET
      pending_plan_type     = p_plan_type,
      pending_duration_days = p_duration_days,
      pending_order_id      = p_order_id,
      pending_activates_at  = v_row.subscription_expires_at,
      updated_at            = now()
    WHERE id = p_user_id;
    v_outcome := 'queued';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  RETURN jsonb_build_object(
    'outcome',              v_outcome,
    'expires_at',           v_row.subscription_expires_at,
    'pending_plan_type',    v_row.pending_plan_type,
    'pending_activates_at', v_row.pending_activates_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_plan_purchase(UUID, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_plan_purchase(UUID, TEXT, INT, TEXT) TO service_role;

COMMIT;
