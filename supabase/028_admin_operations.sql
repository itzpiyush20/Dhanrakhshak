-- 028_admin_operations.sql
--
-- Phases 2-4 of the admin panel: subscription operations, a support inbox that
-- can be worked through, and a scanner drill-down.
--
-- Three separate concerns, one migration because they ship together.

BEGIN;

-- ── 1. Admin-granted access shows up in payment history ───────────────────
--
-- payments.source allowed 'razorpay' and 'promo'. An admin granting a plan by
-- hand is neither, and lumping it in with promo would overstate coupon
-- performance.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_source_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_source_check
  CHECK (source IN ('razorpay', 'promo', 'admin'));

-- ── 2. Feedback can be worked through ─────────────────────────────────────
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_unhandled
  ON public.feedback(created_at DESC)
  WHERE handled_at IS NULL;

-- Marking feedback handled is not a protected column and carries no privilege,
-- so an admin may do it directly rather than through a serverless endpoint.
-- is_admin() in both USING and WITH CHECK means a non-admin cannot touch it.
DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback;
CREATE POLICY "Admins can update feedback"
  ON public.feedback FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Replaced to return the new columns. Body otherwise unchanged from 022.
CREATE OR REPLACE FUNCTION public.admin_feedback_list(lim INT, off INT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  rating INT,
  category TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  handled_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT f.id, f.email, f.rating, f.category, f.message, f.created_at, f.handled_at,
         (SELECT count(*) FROM public.feedback)
  FROM public.feedback f
  -- Unhandled first, then newest: the inbox should open on what needs work.
  ORDER BY (f.handled_at IS NOT NULL), f.created_at DESC
  LIMIT lim OFFSET off;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 3. Scanner drill-down ─────────────────────────────────────────────────

-- Every scan for one account, newest first. Used from the Users tab to answer
-- "this person says scanning is broken — what actually happened?"
CREATE OR REPLACE FUNCTION public.admin_user_scan_history(target UUID, lim INT)
RETURNS TABLE (
  scanned_at TIMESTAMPTZ,
  scan_mode TEXT,
  status TEXT,
  emails_processed INT,
  transactions_found INT,
  error_message TEXT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT l.scanned_at, l.scan_mode, l.status, l.emails_processed, l.transactions_found, l.error_message
  FROM public.email_scan_logs l
  WHERE l.user_id = target
  ORDER BY l.scanned_at DESC
  LIMIT lim;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Which senders a given gate is rejecting, and how often.
--
-- PRIVACY: deliberately returns sender_domain only. email_scan_rejections also
-- stores the subject line and a matched snippet of the body — real private mail
-- belonging to other people. Domains are enough to tell "correctly binning
-- newsletters" from "throwing away HDFC receipts" without reading anyone's
-- inbox. Do not widen this without the owner deciding to.
CREATE OR REPLACE FUNCTION public.admin_gate_senders(target_gate TEXT, days INT, lim INT)
RETURNS TABLE (
  sender_domain TEXT,
  rejections BIGINT,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT COALESCE(r.sender_domain, '(unknown)'), count(*), max(r.rejected_at)
  FROM public.email_scan_rejections r
  WHERE r.gate = target_gate
    AND r.rejected_at > now() - (days || ' days')::interval
  GROUP BY COALESCE(r.sender_domain, '(unknown)')
  ORDER BY count(*) DESC
  LIMIT lim;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
