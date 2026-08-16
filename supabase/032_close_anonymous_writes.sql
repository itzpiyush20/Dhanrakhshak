-- 032_close_anonymous_writes.sql
--
-- Stops strangers writing into tables the app trusts.
--
-- The anon key ships inside the public JavaScript bundle — that is normal and
-- by design; RLS is what makes it safe. But signin_logs and feedback both
-- carried `WITH CHECK (true)`, which grants INSERT to anyone holding that key.
-- Anyone could therefore write unlimited rows carrying ANY email address.
--
-- Two consequences, one of them already live:
--
--   * admin_overview_stats and admin_growth_series count signin_logs to report
--     "sign-ins this week". Those figures are attacker-writable, so the numbers
--     the owner runs the business on cannot currently be trusted.
--   * Both tables can be inflated without bound on a plan with size limits.
--
-- Verified before tightening: signin_logs is written from exactly one place
-- (AuthContext, on SIGNED_IN, always for the caller's own id), and the feedback
-- modal is rendered only inside the signed-in profile menu. Neither policy was
-- serving an anonymous caller in practice.
--
-- support_tickets genuinely must stay open — someone locked out of their
-- account is exactly who needs support — so it keeps anon INSERT and gains a
-- rate limit instead. A serverless endpoint would be the usual place for that,
-- but the project is at Vercel's 12-function Hobby cap, so it is enforced in
-- the database where it cannot be bypassed by calling PostgREST directly.

BEGIN;

-- ── 1. signin_logs: your own sign-in, and only while signed in ─────────────
DROP POLICY IF EXISTS "Anyone can insert signin logs" ON public.signin_logs;
DROP POLICY IF EXISTS "Users can log own signin" ON public.signin_logs;
CREATE POLICY "Users can log own signin"
  ON public.signin_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 2. feedback: same rule ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can submit own feedback" ON public.feedback;
CREATE POLICY "Users can submit own feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 3. support_tickets: still open, now bounded ───────────────────────────
--
-- Two ceilings, both deliberately generous enough that a real person in
-- trouble — including someone filing twice because the first attempt looked
-- like it failed — never meets them:
--
--   per email   5 per hour. Stops one address flooding the inbox.
--   anonymous  50 per hour across all signed-out submissions. Stops a script
--              rotating through invented addresses to defeat the first limit.
--
-- Signed-in submissions are exempt from the second ceiling: those are attached
-- to a real account, which is itself the rate limit.
CREATE OR REPLACE FUNCTION public.throttle_support_tickets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_email INT;
  anon_total INT;
BEGIN
  SELECT count(*) INTO per_email
    FROM public.support_tickets t
   WHERE lower(t.email) = lower(NEW.email)
     AND t.created_at > now() - interval '1 hour';

  IF per_email >= 5 THEN
    RAISE EXCEPTION 'Too many support tickets from this email address in the last hour. Please wait before sending another.'
      USING ERRCODE = '53400';
  END IF;

  IF NEW.user_id IS NULL THEN
    SELECT count(*) INTO anon_total
      FROM public.support_tickets t
     WHERE t.user_id IS NULL
       AND t.created_at > now() - interval '1 hour';

    IF anon_total >= 50 THEN
      RAISE EXCEPTION 'Support is receiving an unusual number of tickets right now. Please try again shortly.'
        USING ERRCODE = '53400';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS throttle_support_tickets ON public.support_tickets;
CREATE TRIGGER throttle_support_tickets
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.throttle_support_tickets();

-- Both counting queries filter on created_at within the last hour.
CREATE INDEX IF NOT EXISTS idx_support_tickets_email_recent
  ON public.support_tickets (lower(email), created_at DESC);

COMMIT;

-- Verify afterwards:
--
--   -- expect exactly one INSERT policy per table, each requiring auth.uid()
--   SELECT tablename, policyname, roles, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('signin_logs', 'feedback', 'support_tickets')
--      AND cmd = 'INSERT';
--
--   -- expect the trigger to exist
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.support_tickets'::regclass
--      AND NOT tgisinternal;
--
-- Historical rows are deliberately left alone. Any junk already written by the
-- old policies is still there; deleting it is a judgement call for the owner,
-- not something a migration should do silently.
