-- 024_feedback_table.sql
--
-- Creates public.feedback on databases that predate it.
--
-- Same story as is_admin in 023: the table was written into schema.sql, which
-- only runs when a database is first created, and no numbered migration ever
-- carried it. Production therefore has no feedback table at all.
--
-- This is NOT only an admin-panel problem. The in-app feedback form calls
-- submitFeedback(), which inserts into this table, so every user who has tried
-- to send feedback has hit `42P01: relation "public.feedback" does not exist`.
-- Their messages were never stored and cannot be recovered.
--
-- Definition copied verbatim from supabase/schema.sql so the two agree.
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature_request', 'ui_ux', 'other')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- The admin feedback list pages by newest first.
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone may submit, including a signed-out visitor using the support form.
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
CREATE POLICY "Anyone can insert feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (true);

-- A user sees their own submissions; an admin sees everything.
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

COMMIT;

-- Verify afterwards:
--
--   -- expect one row
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'feedback';
--
--   -- expect a row of zeros, not an error
--   BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<your user id>"}', true);
--   SELECT * FROM public.admin_feedback_summary();
--   ROLLBACK;
