-- ============================================================
-- 015_merged_email_message_ids.sql
--
-- Supports smart-merging of duplicate payments (R10).
--
-- A single payment often produces two emails: the bank's debit alert and the
-- merchant's receipt. When the scanner recognises them as one payment it keeps
-- a single transaction row — but that row can only carry ONE email_message_id,
-- because UNIQUE (email_message_id, user_id) is what makes concurrent and
-- retried scans safe.
--
-- Without somewhere to record the absorbed email's id, the next scan inside the
-- rolling 7-day window would see that id missing from the dedup set, re-classify
-- the email (paying AI quota again) and re-insert it as a fresh transaction —
-- reintroducing the very duplicate the merge removed, every day for a week.
--
-- This column holds the ids the row absorbed. The scan's dedup preload unions
-- them with email_message_id, so an absorbed email is never reconsidered.
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS merged_email_message_ids TEXT[];

-- The dedup preload reads this for every transaction in the scan window. GIN
-- supports the array containment lookups a future "which transaction absorbed
-- this email?" query would need, and keeps the preload cheap as rows grow.
CREATE INDEX IF NOT EXISTS idx_transactions_merged_email_ids
  ON public.transactions USING GIN (merged_email_message_ids)
  WHERE merged_email_message_ids IS NOT NULL;
