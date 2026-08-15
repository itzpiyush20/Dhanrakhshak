-- 022_admin_metrics.sql
--
-- Read-only aggregate functions behind the /admin section.
--
-- Every function is SECURITY DEFINER so it can read across users regardless of
-- RLS, and every function therefore opens with the same is_admin() guard. That
-- guard is the ONLY thing making this safe: without it any signed-in user could
-- call these and read the whole business. Do not remove it, and do not add a
-- function here without it.
--
-- Nothing here writes. Admin operations that modify data belong in serverless
-- endpoints using the service-role key (phase 2), because the
-- protect_server_only_profile_columns trigger blocks browser writes by design.

BEGIN;

-- 1. Headline numbers -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS TABLE (
  total_accounts BIGINT,
  signups_7d BIGINT,
  signups_30d BIGINT,
  paying_monthly BIGINT,
  paying_annual BIGINT,
  expiring_7d BIGINT,
  signins_7d BIGINT,
  signins_30d BIGINT,
  transactions_7d BIGINT,
  transactions_30d BIGINT,
  transactions_pending BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.profiles
      WHERE subscription_status = 'active'
        AND subscription_plan_type = 'monthly'
        AND (subscription_expires_at IS NULL OR subscription_expires_at > now())),
    (SELECT count(*) FROM public.profiles
      WHERE subscription_status = 'active'
        AND subscription_plan_type = 'annual'
        AND (subscription_expires_at IS NULL OR subscription_expires_at > now())),
    (SELECT count(*) FROM public.profiles
      WHERE subscription_status = 'active'
        AND subscription_expires_at BETWEEN now() AND now() + interval '7 days'),
    (SELECT count(DISTINCT user_id) FROM public.signin_logs WHERE created_at > now() - interval '7 days'),
    (SELECT count(DISTINCT user_id) FROM public.signin_logs WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.transactions WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.transactions WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.transactions WHERE approval_status = 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Signups and sign-ins per day ------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_growth_series(days INT)
RETURNS TABLE (day DATE, signups BIGINT, signins BIGINT) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH span AS (
    SELECT generate_series(
      (now() - (days || ' days')::interval)::date,
      now()::date,
      '1 day'
    )::date AS day
  )
  SELECT
    s.day,
    (SELECT count(*) FROM public.profiles p WHERE p.created_at::date = s.day),
    (SELECT count(DISTINCT l.user_id) FROM public.signin_logs l WHERE l.created_at::date = s.day)
  FROM span s
  ORDER BY s.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Account list ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_list(search TEXT, lim INT, off INT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  subscription_status TEXT,
  subscription_plan_type TEXT,
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  last_signin_at TIMESTAMPTZ,
  scans_30d BIGINT,
  total_count BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH matched AS (
    SELECT p.* FROM public.profiles p
    WHERE search IS NULL OR search = '' OR p.email ILIKE '%' || search || '%'
  )
  SELECT
    m.id,
    m.email,
    m.subscription_status,
    m.subscription_plan_type,
    m.subscription_expires_at,
    m.created_at,
    (SELECT max(l.created_at) FROM public.signin_logs l WHERE l.user_id = m.id),
    (SELECT count(*) FROM public.email_scan_logs g
      WHERE g.user_id = m.id AND g.scanned_at > now() - interval '30 days'),
    (SELECT count(*) FROM matched)
  FROM matched m
  ORDER BY m.created_at DESC
  LIMIT lim OFFSET off;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Scanner volume and outcomes -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scanner_stats(days INT)
RETURNS TABLE (
  day DATE,
  manual_scans BIGINT,
  scheduled_scans BIGINT,
  succeeded BIGINT,
  partial BIGINT,
  failed BIGINT,
  emails_processed BIGINT,
  transactions_found BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    l.scanned_at::date AS day,
    count(*) FILTER (WHERE l.scan_mode = 'manual'),
    count(*) FILTER (WHERE l.scan_mode = 'scheduled'),
    count(*) FILTER (WHERE l.status = 'success'),
    count(*) FILTER (WHERE l.status = 'partial'),
    count(*) FILTER (WHERE l.status = 'failed'),
    COALESCE(sum(l.emails_processed), 0),
    COALESCE(sum(l.transactions_found), 0)
  FROM public.email_scan_logs l
  WHERE l.scanned_at > now() - (days || ' days')::interval
  GROUP BY l.scanned_at::date
  ORDER BY day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Recent failures -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scan_failures(lim INT)
RETURNS TABLE (scanned_at TIMESTAMPTZ, email TEXT, error_message TEXT, scan_mode TEXT) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT l.scanned_at, p.email, l.error_message, l.scan_mode
  FROM public.email_scan_logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.status = 'failed'
  ORDER BY l.scanned_at DESC
  LIMIT lim;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Which gates are rejecting --------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rejection_gates(days INT)
RETURNS TABLE (gate TEXT, rejections BIGINT) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT r.gate, count(*)
  FROM public.email_scan_rejections r
  WHERE r.rejected_at > now() - (days || ' days')::interval
  GROUP BY r.gate
  ORDER BY count(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. AI call volume --------------------------------------------------------
-- Raw counts only. The daily caps are constants inside api/gemini-proxy.ts and
-- are deliberately NOT duplicated here: a second copy would disagree with the
-- proxy the first time a cap changed, and a wrong percentage is worse than none.
CREATE OR REPLACE FUNCTION public.admin_ai_usage()
RETURNS TABLE (email TEXT, ai_calls_count INT, ai_scan_calls_count INT) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT p.email, p.ai_calls_count, p.ai_scan_calls_count
  FROM public.profiles p
  WHERE p.ai_calls_count > 0 OR p.ai_scan_calls_count > 0
  ORDER BY (p.ai_calls_count + p.ai_scan_calls_count) DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Feedback summary ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_feedback_summary()
RETURNS TABLE (
  total BIGINT,
  average_rating NUMERIC,
  bug BIGINT,
  feature_request BIGINT,
  ui_ux BIGINT,
  other BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    COALESCE(round(avg(f.rating), 2), 0),
    count(*) FILTER (WHERE f.category = 'bug'),
    count(*) FILTER (WHERE f.category = 'feature_request'),
    count(*) FILTER (WHERE f.category = 'ui_ux'),
    count(*) FILTER (WHERE f.category = 'other')
  FROM public.feedback f;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Feedback list ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_feedback_list(lim INT, off INT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  rating INT,
  category TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT f.id, f.email, f.rating, f.category, f.message, f.created_at,
         (SELECT count(*) FROM public.feedback)
  FROM public.feedback f
  ORDER BY f.created_at DESC
  LIMIT lim OFFSET off;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
