-- ============================================================
-- RUN THIS BEFORE DEPLOYING branch claude/scanner-remediation
--
-- Combined bundle of migrations 017, 018 and 019, in order. Every statement is
-- idempotent, so running it twice is harmless.
--
-- WHY THIS MUST GO FIRST:
--
--   019 is the dangerous one. api/gemini-proxy.ts now calls
--   increment_ai_call_count via RPC on every AI request. If the function does
--   not exist, that RPC errors and the proxy returns 500 for EVERY call.
--   The scanner does not crash — it degrades to the regex ladder, exactly as
--   designed — which is precisely the hazard: the scan still reports success
--   while quietly classifying everything without AI. That same silent
--   degradation hid a ten-week AI outage in this codebase. Do not rely on
--   noticing it.
--
--   018 adds transactions.possible_duplicate_of. The scanner writes it whenever
--   it finds a look-alike it cannot prove is the same payment, and PendingPage
--   selects it. Without the column those inserts fail.
--
--   017 is included because it may never have been applied — the rejection
--   flush carries a 42703 fallback written specifically for that case. Running
--   it here is a no-op if it is already in place.
-- ============================================================

-- ─── 017 ───────────────────────────────────────────────────
-- Add email_message_id column to email_scan_rejections so rejected emails
-- are remembered and never re-fetched on subsequent scans.

ALTER TABLE public.email_scan_rejections
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_user_msg
  ON public.email_scan_rejections(user_id, email_message_id);

-- ─── 018 ───────────────────────────────────────────────────
-- Records that a transaction looks like a duplicate of another but could not
-- be proven to be the same payment. The scanner used to merge these silently;
-- when the evidence was only merchant+amount+date it could destroy a real
-- distinct transaction. Both rows are now kept and the user decides.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS possible_duplicate_of UUID
  REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_possible_duplicate_of
  ON public.transactions(user_id, possible_duplicate_of)
  WHERE possible_duplicate_of IS NOT NULL;

-- ─── 019 ───────────────────────────────────────────────────
-- Makes the per-user daily AI call quota atomic.
--
-- api/gemini-proxy.ts used to SELECT the counter, compare it in JavaScript, and
-- UPDATE it back after a successful Gemini call. The scanner fires up to four
-- proxy requests concurrently (AI_BATCH_CONCURRENCY = 4), so all four read the
-- same count, all four passed the limit check, and all four wrote back the same
-- +1 -- the counter advanced by one for four billed calls. The daily cap was
-- therefore not enforced at all under the scanner's own concurrency, let alone
-- across two browser tabs.
--
-- `increment_ai_call_count` folds the window reset, the increment, and the
-- limit check into a SINGLE UPDATE statement, so concurrent callers serialize
-- on the profile row instead of racing. It returns TRUE when the call is within
-- limit and FALSE when it is not (the caller then returns 429).
--
-- The counter saturates at p_limit + 1 so a user hammering the endpoint after
-- exhausting the quota cannot inflate the stored count without bound.
--
-- `refund_ai_call_count` gives a reserved unit back. The proxy reserves BEFORE
-- calling Gemini (that is what makes the check atomic) but the previous code
-- only charged AFTER a success, so a transient upstream failure cost the user
-- nothing. Refunding on every non-success path preserves that property.
--
-- p_purpose is NOT interpolated into SQL: the two known counters are selected
-- by an IF/ELSE over static statements.

CREATE OR REPLACE FUNCTION public.increment_ai_call_count(
  p_user_id UUID,
  p_purpose TEXT,
  p_limit INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INT;
BEGIN
  IF p_purpose = 'scan' THEN
    UPDATE public.profiles
       SET ai_scan_calls_count = LEAST(
             CASE
               WHEN ai_scan_calls_reset_at IS NULL
                 OR now() - ai_scan_calls_reset_at > INTERVAL '24 hours'
               THEN 0
               ELSE COALESCE(ai_scan_calls_count, 0)
             END + 1,
             p_limit + 1
           ),
           ai_scan_calls_reset_at = CASE
             WHEN ai_scan_calls_reset_at IS NULL
               OR now() - ai_scan_calls_reset_at > INTERVAL '24 hours'
             THEN now()
             ELSE ai_scan_calls_reset_at
           END
     WHERE id = p_user_id
     RETURNING ai_scan_calls_count INTO v_new_count;
  ELSE
    UPDATE public.profiles
       SET ai_calls_count = LEAST(
             CASE
               WHEN ai_calls_reset_at IS NULL
                 OR now() - ai_calls_reset_at > INTERVAL '24 hours'
               THEN 0
               ELSE COALESCE(ai_calls_count, 0)
             END + 1,
             p_limit + 1
           ),
           ai_calls_reset_at = CASE
             WHEN ai_calls_reset_at IS NULL
               OR now() - ai_calls_reset_at > INTERVAL '24 hours'
             THEN now()
             ELSE ai_calls_reset_at
           END
     WHERE id = p_user_id
     RETURNING ai_calls_count INTO v_new_count;
  END IF;

  -- No profile row matched: fail closed rather than granting a free call.
  IF v_new_count IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_new_count <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_ai_call_count(
  p_user_id UUID,
  p_purpose TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_purpose = 'scan' THEN
    UPDATE public.profiles
       SET ai_scan_calls_count = GREATEST(COALESCE(ai_scan_calls_count, 0) - 1, 0)
     WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET ai_calls_count = GREATEST(COALESCE(ai_calls_count, 0) - 1, 0)
     WHERE id = p_user_id;
  END IF;
END;
$$;

-- These are SECURITY DEFINER and take the limit as an argument, so a client
-- that could call them directly could grant itself any quota it liked. Only the
-- service role (used by api/gemini-proxy.ts) may execute them.
REVOKE ALL ON FUNCTION public.increment_ai_call_count(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_ai_call_count(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_call_count(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_call_count(UUID, TEXT) TO service_role;
