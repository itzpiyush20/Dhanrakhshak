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
     AND NEW.pending_order_id  IS NULL
     -- Pin the order-id columns to exactly what activate_pending_plan() writes.
     -- The carve-out returns before the final guard block, so without these two
     -- it is silent about both columns — and a client can UPDATE its own
     -- profile row directly under RLS. Writing a forged order id there would
     -- make a later verify-payment see 'already_applied' and swallow a real
     -- payment.
     AND NEW.razorpay_order_id IS NOT DISTINCT FROM
         COALESCE(OLD.pending_order_id, OLD.razorpay_order_id)
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

  -- A trial is not a paid plan: 'trial' must not park a purchase behind it, so
  -- it is deliberately excluded here rather than relying on
  -- subscription_status alone.
  v_active := v_row.subscription_status = 'active'
              AND v_row.subscription_plan_type IN ('monthly', 'annual')
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
      -- Any queued plan is FOLDED IN, not discarded — it was paid for, and the
      -- same "never drop money already taken" rule that justifies the
      -- queue_extended branch below applies here. Note this does not conflict
      -- with the upgrade rule: what an upgrade drops is the unconsumed time on
      -- the plan being replaced, not a separate purchase that never started.
      --
      -- Clearing the four pending_* columns is not optional. Leaving them set
      -- would strand a pending_activates_at in the past, and
      -- activate_pending_plan() would then overwrite this very purchase with an
      -- expiry anchored to that old date.
      subscription_expires_at = now()
                                + make_interval(days => p_duration_days
                                    + COALESCE(v_row.pending_duration_days, 0)),
      razorpay_order_id       = COALESCE(p_order_id, razorpay_order_id),
      pending_plan_type       = NULL,
      pending_duration_days   = NULL,
      pending_order_id        = NULL,
      pending_activates_at    = NULL,
      updated_at              = now()
    WHERE id = p_user_id;
    v_outcome := 'activated';

  ELSIF v_row.pending_plan_type IS NOT NULL THEN
    -- create-order.ts refuses a purchase while anything is queued, so getting
    -- here means a race beat that check. The money is already taken and must
    -- not be dropped: add the duration to what is queued.
    UPDATE public.profiles SET
      pending_duration_days = COALESCE(v_row.pending_duration_days, 0) + p_duration_days,
      -- Keep the FIRST order's id: COALESCE(p_order_id, ...) would overwrite it,
      -- and a Razorpay retry for that order would then miss the idempotency
      -- check and credit twice. The incoming order is recorded in
      -- razorpay_order_id instead, so both ids stay matchable.
      pending_order_id      = COALESCE(pending_order_id, p_order_id),
      razorpay_order_id     = COALESCE(p_order_id, razorpay_order_id),
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
      razorpay_order_id     = COALESCE(p_order_id, razorpay_order_id),
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
REVOKE ALL ON FUNCTION public.apply_plan_purchase(UUID, TEXT, INT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_purchase(UUID, TEXT, INT, TEXT) TO service_role;

COMMIT;

BEGIN;

-- Called by the account's own browser on profile load, so a queued plan starts
-- the moment its owner next opens the app rather than waiting for a nightly
-- job. Safe to grant to `authenticated`: it takes no arguments, works only on
-- auth.uid()'s own row, activates only a plan that was already paid for, and
-- only once its stored date has passed. The matching carve-out in
-- protect_server_only_profile_columns is what lets the write through, and it
-- permits exactly this transition and nothing else.
CREATE OR REPLACE FUNCTION public.activate_pending_plan()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.pending_plan_type IS NULL THEN RETURN false; END IF;
  -- pending_duration_days is checked here, not just the date. Nothing in the
  -- schema enforces the "all four set together" invariant — it is a comment,
  -- and service-role writes bypass the guard trigger entirely — and a NULL
  -- would make the expiry below NULL, which fails the trigger's exact-equality
  -- carve-out and RAISES. A malformed row must degrade to a quiet no-op, not
  -- to a hard error on every profile load.
  IF v_row.pending_activates_at IS NULL
     OR v_row.pending_duration_days IS NULL
     OR v_row.pending_activates_at > now() THEN
    RETURN false;
  END IF;

  -- Dates run on the calendar, not on attendance: the queued plan starts when
  -- the previous one ended, so a customer who stays away loses that time.
  UPDATE public.profiles SET
    subscription_status     = 'active',
    subscription_plan_type  = v_row.pending_plan_type,
    subscription_expires_at = v_row.pending_activates_at
                              + make_interval(days => v_row.pending_duration_days),
    razorpay_order_id       = COALESCE(v_row.pending_order_id, razorpay_order_id),
    pending_plan_type       = NULL,
    pending_duration_days   = NULL,
    pending_order_id        = NULL,
    pending_activates_at    = NULL,
    updated_at              = now()
  WHERE id = v_row.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pending_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pending_plan() TO authenticated, service_role;

COMMIT;

-- Verify afterwards:
--
--   -- expect two rows, both prosecdef = true with search_path pinned
--   SELECT p.proname, p.prosecdef, p.proconfig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('apply_plan_purchase', 'activate_pending_plan');
--
--   -- expect service_role only for apply_plan_purchase
--   SELECT routine_name, grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public'
--      AND routine_name IN ('apply_plan_purchase', 'activate_pending_plan');
--
-- IMPERSONATE THE SERVICE ROLE FIRST. Without this every statement below fails
-- with 'Cannot modify server-managed subscription/admin fields directly'. The
-- guard trigger waves through writes to the subscription columns only when
-- auth.jwt() ->> 'role' is 'service_role', and auth.jwt() reads
-- request.jwt.claims — a per-request setting PostgREST supplies and the SQL
-- editor does not. SECURITY DEFINER changes the executing ROLE, not that claim.
-- Session-scoped (false), not transaction-scoped, because the steps below are
-- separate statements:
--
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
--
-- Then, on a throwaway account (substitute its uuid):
--
--   -- 1. UPGRADE drops the remaining days. Give it a monthly with 13 days left.
--   UPDATE public.profiles
--      SET subscription_status = 'active', subscription_plan_type = 'monthly',
--          subscription_expires_at = now() + interval '13 days',
--          razorpay_order_id = NULL, pending_plan_type = NULL,
--          pending_duration_days = NULL, pending_order_id = NULL,
--          pending_activates_at = NULL
--    WHERE id = '<uuid>';
--   SELECT public.apply_plan_purchase('<uuid>', 'annual', 365, 'order_up_1');
--   -- expect outcome 'activated', expires_at ~365 days out, NOT 378.
--
--   -- 2. The same order again, as a webhook retry delivers it.
--   SELECT public.apply_plan_purchase('<uuid>', 'annual', 365, 'order_up_1');
--   -- expect outcome 'already_applied' and the SAME expires_at as step 1.
--
--   -- 3. RENEWAL queues. Same plan bought again while it runs.
--   SELECT public.apply_plan_purchase('<uuid>', 'annual', 365, 'order_ren_1');
--   -- expect outcome 'queued', expires_at UNCHANGED from step 1,
--   -- pending_plan_type 'annual', pending_activates_at = that expires_at.
--
--   -- 4. Queue occupied. Never drops the money.
--   SELECT public.apply_plan_purchase('<uuid>', 'monthly', 30, 'order_ren_2');
--   -- expect outcome 'queue_extended', pending_duration_days now 395,
--   -- pending_order_id STILL 'order_ren_1' (the first id is kept on purpose).
--
--   -- 5. DOWNGRADE queues. Reset to a clean annual first.
--   UPDATE public.profiles
--      SET subscription_status = 'active', subscription_plan_type = 'annual',
--          subscription_expires_at = now() + interval '200 days',
--          razorpay_order_id = NULL, pending_plan_type = NULL,
--          pending_duration_days = NULL, pending_order_id = NULL,
--          pending_activates_at = NULL
--    WHERE id = '<uuid>';
--   SELECT public.apply_plan_purchase('<uuid>', 'monthly', 30, 'order_down_1');
--   -- expect outcome 'queued', expires_at still ~200 days out.
--
--   -- 6. Activation is refused while the date is in the future.
--   SELECT set_config('request.jwt.claims',
--                     json_build_object('sub','<uuid>','role','authenticated')::text, false);
--   SELECT public.activate_pending_plan();   -- expect false, nothing changed
--
--   -- 7. Activation fires once the date has passed.
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
--   UPDATE public.profiles
--      SET subscription_expires_at = now() - interval '1 day',
--          pending_activates_at    = now() - interval '1 day'
--    WHERE id = '<uuid>';
--   SELECT set_config('request.jwt.claims',
--                     json_build_object('sub','<uuid>','role','authenticated')::text, false);
--   SELECT public.activate_pending_plan();   -- expect true
--   -- expect plan_type 'monthly', expires ~29 days out, all pending_* NULL.
--
--   -- 8. A TRIAL is not a running plan: a purchase over it activates at once.
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
--   UPDATE public.profiles
--      SET subscription_status = 'active', subscription_plan_type = 'trial',
--          subscription_expires_at = now() + interval '5 days',
--          razorpay_order_id = NULL, pending_plan_type = NULL,
--          pending_duration_days = NULL, pending_order_id = NULL,
--          pending_activates_at = NULL
--    WHERE id = '<uuid>';
--   SELECT public.apply_plan_purchase('<uuid>', 'annual', 365, 'order_trial_1');
--   -- expect outcome 'activated', NOT 'queued'. A free trial must never park
--   -- a paid purchase behind it.
--
--   -- 9. A lapsed account activates from today, not from its old expiry.
--   UPDATE public.profiles
--      SET subscription_status = 'expired',
--          subscription_expires_at = now() - interval '400 days',
--          razorpay_order_id = NULL, pending_plan_type = NULL,
--          pending_duration_days = NULL, pending_order_id = NULL,
--          pending_activates_at = NULL
--    WHERE id = '<uuid>';
--   SELECT public.apply_plan_purchase('<uuid>', 'monthly', 30, 'order_lapsed_1');
--   -- expect outcome 'activated', ~30 days from NOW.
--
--   -- 10. An expired account with something still queued does not strand it.
--   UPDATE public.profiles
--      SET subscription_status = 'expired',
--          subscription_expires_at = now() - interval '2 days',
--          pending_plan_type = 'monthly', pending_duration_days = 30,
--          pending_order_id = 'order_stranded', pending_activates_at = now() - interval '2 days'
--    WHERE id = '<uuid>';
--   SELECT public.apply_plan_purchase('<uuid>', 'monthly', 30, 'order_new_1');
--   -- expect outcome 'activated', ~60 days out (30 bought + 30 folded in),
--   -- and ALL pending_* columns NULL. Leaving them set would let
--   -- activate_pending_plan() overwrite this purchase with a past-anchored date.
--
--   -- 11. No such profile.
--   SELECT public.apply_plan_purchase('00000000-0000-0000-0000-000000000000',
--                                     'monthly', 30, 'order_none');
--   -- expect NULL, nothing written anywhere.
--
--   -- Reset the session before using it for ordinary queries:
--   SELECT set_config('request.jwt.claims', '', false);
