-- 018_possible_duplicate.sql
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
