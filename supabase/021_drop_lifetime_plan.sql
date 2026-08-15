-- 021_drop_lifetime_plan.sql
--
-- The product has exactly three tiers: Free, Monthly (₹31/mo) and Yearly
-- (₹365/yr). A fourth `lifetime` plan type existed only as the promo-code
-- reward. It was written with a duration of 36500 days, so those profiles
-- carried an expiry roughly a century in the future (e.g. 2126), which the
-- UI then displayed verbatim. Promo codes now grant one free month, so
-- `lifetime` has no writer left and this migration retires the value.
--
-- It also repairs two pieces of schema drift found while applying it — see
-- steps 0 and 2. Both are independent of the pricing change and safe to apply
-- on their own.
--
-- Run the whole file in the Supabase SQL editor. It is one transaction: if any
-- step fails, nothing is applied and the guard trigger is restored.
--
-- Preview who is affected before running:
--   SELECT id, email, subscription_plan_type, subscription_expires_at
--   FROM public.profiles WHERE subscription_plan_type = 'lifetime';

BEGIN;

-- 0. Schema drift repair — must run before anything UPDATEs profiles.
--
--    The protect_server_only_profile_columns trigger (migration 004) reads
--    NEW.razorpay_subscription_id. That column reached schema.sql only inside
--    CREATE TABLE IF NOT EXISTS, which is a no-op on a database where profiles
--    already existed, so on such a database the column is missing. PL/pgSQL
--    plans the trigger's whole IF expression before evaluating any of it, so
--    the missing field aborts EVERY non-service-role UPDATE on profiles with
--    `42703: record "new" has no field "razorpay_subscription_id"` — including
--    ordinary app writes like daily_scan_time. Adding the columns fixes that.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- 1. Fail loudly, before any write, if a plan type exists that step 4 would
--    reject. Better a clear message here than a constraint violation later.
DO $$
DECLARE
  stray TEXT;
BEGIN
  SELECT string_agg(DISTINCT subscription_plan_type, ', ')
    INTO stray
    FROM public.profiles
   WHERE subscription_plan_type IS NOT NULL
     AND subscription_plan_type NOT IN ('trial', 'monthly', 'annual', 'lifetime');

  IF stray IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected subscription_plan_type value(s): %. Decide how to map these before rerunning.', stray;
  END IF;
END $$;

-- 2. Drop whatever CHECK currently guards the column, whatever it is named.
--    The live constraint came from archive/pricing_migration.sql, so hardcoding
--    a name would silently no-op and leave the old rule in force alongside the
--    new one.
DO $$
DECLARE
  conname TEXT;
BEGIN
  FOR conname IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.profiles'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%subscription_plan_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

-- 3. That same trigger rejects subscription edits from anyone who is not the
--    service role, and the SQL editor is not the service role. Suspend it for
--    this transaction only. DISABLE TRIGGER is transactional, so a failure
--    anywhere below restores the guard automatically on rollback.
ALTER TABLE public.profiles DISABLE TRIGGER protect_server_only_profile_columns;

--    Convert lifetime grants into the monthly plan the promo code now gives,
--    replacing the century-long expiry with 30 days from now.
UPDATE public.profiles
SET subscription_plan_type = 'monthly',
    subscription_expires_at = now() + interval '30 days',
    updated_at = now()
WHERE subscription_plan_type = 'lifetime';

ALTER TABLE public.profiles ENABLE TRIGGER protect_server_only_profile_columns;

-- 4. Re-add the constraint without 'lifetime'. 'trial' stays: it is what a free
--    account carries during its 7-day trial and PricingPage reads it to tell an
--    expired trial from an expired paid plan. Free accounts may also hold NULL,
--    which a CHECK constraint permits.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_plan_type_check
  CHECK (subscription_plan_type IN ('trial', 'monthly', 'annual'));

COMMIT;

-- Verify afterwards:
--
--   -- expect zero rows
--   SELECT id FROM public.profiles WHERE subscription_plan_type = 'lifetime';
--
--   -- expect one row per column, i.e. 2 rows
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND column_name IN ('razorpay_subscription_id', 'razorpay_order_id');
--
--   -- expect the guard to be enabled again: tgenabled = 'O'
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.profiles'::regclass
--      AND tgname = 'protect_server_only_profile_columns';
