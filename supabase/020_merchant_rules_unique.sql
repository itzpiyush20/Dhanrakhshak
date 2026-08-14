-- 020_merchant_rules_unique.sql
-- Restores merchant-rule learning, which has been failing silently.
--
-- learningEngine.ts upserts with { onConflict: 'user_id,merchant_key' }.
-- PostgREST answers 400 when no unique constraint matches that specification
-- (Postgres 42P10), and the browser console shows exactly that on every page
-- load. The consequence is worse than the noise: every merchant-rule write
-- fails, so the scanner has not been learning from the user's category
-- corrections at all.
--
-- schema.sql DOES declare UNIQUE(user_id, merchant_key) — but inside
-- CREATE TABLE IF NOT EXISTS public.merchant_rules. On a database where the
-- table predates that line, the whole statement was a no-op and the constraint
-- was never added. Same class of drift as the missing columns folded in by the
-- 017-019 bundle.
--
-- Idempotent: safe to run whatever state the database is in.

-- 1. Collapse any duplicate (user_id, merchant_key) rows first — the constraint
--    cannot be added while they exist. Keep the most-confirmed row, breaking
--    ties by most recent, since that is the rule the matcher would have
--    preferred anyway (getMerchantRulesFromDB orders by times_confirmed DESC).
DELETE FROM public.merchant_rules a
USING public.merchant_rules b
WHERE a.user_id = b.user_id
  AND a.merchant_key = b.merchant_key
  AND a.id <> b.id
  AND (
        COALESCE(a.times_confirmed, 0) < COALESCE(b.times_confirmed, 0)
     OR (COALESCE(a.times_confirmed, 0) = COALESCE(b.times_confirmed, 0) AND a.id < b.id)
  );

-- 2. Add the constraint only if it is genuinely absent, mirroring the guarded
--    pattern schema.sql already uses for transactions_email_message_id_user_id_key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'merchant_rules'
      AND c.contype = 'u'
      AND c.conkey @> ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'user_id'),
            (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'merchant_key')
          ]::smallint[]
  ) THEN
    ALTER TABLE public.merchant_rules
      ADD CONSTRAINT merchant_rules_user_id_merchant_key_key
      UNIQUE (user_id, merchant_key);
  END IF;
END$$;
