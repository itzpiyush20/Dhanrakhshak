-- 017_rejection_email_message_id.sql
-- Add email_message_id column to email_scan_rejections so rejected emails
-- are remembered and never re-fetched on subsequent scans.

ALTER TABLE public.email_scan_rejections
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_user_msg
  ON public.email_scan_rejections(user_id, email_message_id);
