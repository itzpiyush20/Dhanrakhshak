-- 010_email_scan_rejections.sql
-- Diagnostic log of emails the scanner rejected, and why. Lets a missed
-- transaction be traced to the exact gate that dropped it (sender domain +
-- subject + gate name + matched text) instead of requiring a manual code
-- trace, as happened for the Axis Bank EMI-debit sample that motivated this
-- table. Diagnostic data only — rows expire after 30 days (see cleanup cron
-- added in Task 15).

CREATE TABLE IF NOT EXISTS public.email_scan_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_log_id UUID REFERENCES public.email_scan_logs(id) ON DELETE CASCADE,
  sender_domain TEXT,
  subject TEXT,
  gate TEXT NOT NULL,
  matched_snippet TEXT,
  rejected_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_user
  ON public.email_scan_rejections(user_id, rejected_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_scan_log
  ON public.email_scan_rejections(scan_log_id);

ALTER TABLE public.email_scan_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan rejections"
  ON public.email_scan_rejections FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT policy for the anon/authenticated role by design: rows are
-- written by scanRealGmailInbox() running under the caller's own session
-- (browser path) or the service-role key (cron path). The authenticated
-- role still needs INSERT for the browser path, scoped to its own user_id:
CREATE POLICY "Users can insert own scan rejections"
  ON public.email_scan_rejections FOR INSERT
  WITH CHECK (auth.uid() = user_id);
