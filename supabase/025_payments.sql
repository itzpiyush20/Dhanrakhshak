-- 025_payments.sql
--
-- Records that money changed hands. Until now nothing did.
--
-- verify-payment.ts wrote a single razorpay_order_id onto the profile and
-- overwrote it on the next purchase, so each account remembered only its most
-- recent order. The app could not answer how much revenue arrived last month,
-- how many people renewed, or when anyone lapsed — and every payment made
-- before this migration is unrecoverable.
--
-- Rows are written ONLY by server-side code holding the service-role key
-- (verify-payment.ts, webhook.ts, redeem-promo.ts). There is deliberately no
-- INSERT policy: a client that could write here could invent revenue.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'annual')),
  -- Rupees, not paise. Razorpay reports paise; the writer divides by 100 so
  -- this column always reads as money a human recognises.
  amount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- 'promo' rows carry amount_inr = 0. They are still recorded so the grant
  -- history is complete and free access can be told apart from paid.
  source TEXT NOT NULL DEFAULT 'razorpay' CHECK (source IN ('razorpay', 'promo')),
  promo_code TEXT,
  status TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: verify-payment.ts and webhook.ts can both fire for the same
-- order, and Razorpay retries webhooks. One order, one payment row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_id
  ON public.payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON public.payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_created
  ON public.payments(created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- A user may read their own receipts; an admin reads everything. Nobody
-- writes from the client.
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

COMMIT;
