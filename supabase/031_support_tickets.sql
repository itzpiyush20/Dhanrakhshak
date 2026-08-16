-- 031_support_tickets.sql
--
-- Gives the support form somewhere to go.
--
-- Until now /support was a simulator: it validated the form, waited 1.2s, wrote
-- the ticket to the visitor's own localStorage and printed "Ticket Logged
-- Successfully". Nothing ever reached the owner. The Privacy Policy names that
-- page as the DPDPA grievance channel, so every complaint filed through the
-- documented route was silently discarded.
--
-- Deliberately its own table rather than reusing public.feedback:
-- feedback carries a 1-5 rating and feeds admin_feedback_summary's average, and
-- folding ticket rows in with an invented rating would corrupt that number.
--
-- Signed-out visitors must be able to file a ticket — someone locked out of
-- their account is exactly who needs support — so INSERT is open to anon, the
-- same shape public.feedback already uses. The length CHECKs below bound the
-- size of any one row; migration 032 adds the rate limit that bounds how many
-- of them a stranger can create.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when a signed-out visitor files it. SET NULL rather than CASCADE so a
  -- deleted account does not erase the ticket history the owner may still need.
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  -- Mirrors public.feedback's workflow so the admin inbox behaves the same way.
  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON public.support_tickets(created_at DESC);

-- The inbox opens on what still needs work.
CREATE INDEX IF NOT EXISTS idx_support_tickets_unhandled
  ON public.support_tickets(created_at DESC)
  WHERE handled_at IS NULL;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone may file one, including a signed-out visitor.
DROP POLICY IF EXISTS "Anyone can file a support ticket" ON public.support_tickets;
CREATE POLICY "Anyone can file a support ticket"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

-- A signed-in user sees their own tickets; an admin sees every one.
DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view own support tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Marking a ticket handled carries no privilege and touches no protected
-- column, so an admin may write it directly. is_admin() in both USING and
-- WITH CHECK means a non-admin cannot.
DROP POLICY IF EXISTS "Admins can update support tickets" ON public.support_tickets;
CREATE POLICY "Admins can update support tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Admin reads ───────────────────────────────────────────────────────────
-- SECURITY DEFINER with an is_admin() guard, exactly like every function in
-- 022_admin_metrics.sql. That guard is the only thing making these safe.

CREATE OR REPLACE FUNCTION public.admin_support_ticket_summary()
RETURNS TABLE (total BIGINT, unhandled BIGINT, last_7d BIGINT) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE t.handled_at IS NULL),
    count(*) FILTER (WHERE t.created_at > now() - interval '7 days')
  FROM public.support_tickets t;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_support_ticket_list(lim INT, off INT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  subject TEXT,
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
  SELECT t.id, t.name, t.email, t.subject, t.message, t.created_at, t.handled_at,
         (SELECT count(*) FROM public.support_tickets)
  FROM public.support_tickets t
  ORDER BY (t.handled_at IS NOT NULL), t.created_at DESC
  LIMIT lim OFFSET off;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verify afterwards:
--
--   -- expect one row
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'support_tickets';
--
--   -- expect two rows
--   SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'public'
--      AND routine_name LIKE 'admin_support_ticket%';
--
-- Calling the RPC directly in the SQL editor does NOT work, and a failure there
-- does not mean this migration failed. The editor runs with no JWT, so
-- auth.uid() is NULL, is_admin() is therefore false, and the guard correctly
-- raises 'admin only'. Impersonate an admin for the duration of one transaction
-- instead — the same pattern 024_feedback_table.sql uses:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<your admin user id>"}', true);
--   SELECT * FROM public.admin_support_ticket_summary();
--   ROLLBACK;
--
-- Find that id with:  SELECT id, email FROM public.profiles WHERE is_admin;
