-- 034_trial_defaults.sql
--
-- Makes the free trial 7 days, and writes down the column defaults that only
-- ever existed in the production dashboard.
--
-- THE BUG: every account created since launch has received a FOURTEEN day
-- trial, while every page that sells the product promises seven —
-- PricingPage's Free tier card, its "Start your 7-day free trial" banner, and
-- the landing page FAQ. The product has been giving away double its stated
-- free tier, and nothing in the codebase knew: there is no `14` anywhere in
-- it. Confirmed against production on 2026-08-16, where an account created
-- that day carried an expiry of 2026-08-30.
--
-- WHY NOTHING CAUGHT IT: handle_new_user() inserts only id, email, full_name
-- and avatar_url. Every subscription field on a new profile therefore comes
-- from a COLUMN DEFAULT — and those defaults were set by hand in the Supabase
-- dashboard and never written into schema.sql or any migration. Three of them:
--
--   subscription_status       'trial'                      schema.sql said 'free'
--   subscription_plan_type    'trial'                      schema.sql had none
--   subscription_expires_at   now() + '14 days'            schema.sql had none
--
-- That left THREE different behaviours for the same product: production gave a
-- 14-day trial, the marketing promised 7, and a database rebuilt from
-- schema.sql would have given a new user status 'free' with NO expiry — which
-- isPremiumProfile() reads as not entitled, i.e. no trial at all. A fresh
-- install and production were not the same product.
--
-- This is the fourth time undocumented schema drift has caused a production
-- problem here; migrations 021, 023 and 024 each exist to repair an earlier
-- one. The defaults are restated below even where production already agrees,
-- so the file is the record and the dashboard is not.
--
-- The trial itself stays: signup granting 'trial' is deliberate and is what
-- the marketing promises. Only its LENGTH changes, 14 -> 7.
--
-- EXISTING USERS ARE NOT AFFECTED. A column default applies only to rows
-- inserted after it changes; nobody currently on a trial loses a day. Verify
-- that below.

BEGIN;

-- The three that drifted.
ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'trial';

ALTER TABLE public.profiles
  ALTER COLUMN subscription_plan_type SET DEFAULT 'trial';

-- The actual behavioural change in this file.
ALTER TABLE public.profiles
  ALTER COLUMN subscription_expires_at SET DEFAULT (now() + interval '7 days');

-- daily_scan_time is DELIBERATELY not touched here.
--
-- The first version of this migration tried to set its default and failed with
-- 42703: the column does not exist in production at all. schema.sql declares
-- it, but no numbered migration ever delivered it — the same drift that hit
-- razorpay_subscription_id and is_admin before it.
--
-- Adding the column was the obvious fix and is the wrong one, because the
-- preference it stores is not honoured by anything. api/auto-sync-gmail.ts runs
-- on a single fixed schedule for every user ("30 21 * * *" in vercel.json) and
-- never reads this column. Per-user scan times would need an hourly cron, which
-- the Vercel Hobby plan does not allow.
--
-- So the Settings control that writes it — "Daily Scan Schedule: Time to
-- automatically scan for transactions daily" — changes nothing whatsoever, and
-- has been failing its write silently into a console warning the whole time.
-- Creating the column would only make a decorative setting persist. Either the
-- control goes, or the scheduling becomes real; that is a product decision, not
-- something to smuggle into a migration about trial length.

COMMIT;

-- Verify afterwards:
--
--   -- expect: status 'trial', plan_type 'trial', expires now() + 7 days,
--   -- daily_scan_time '06:00'
--   SELECT column_name, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND column_name IN ('subscription_status', 'subscription_plan_type',
--                          'subscription_expires_at', 'daily_scan_time')
--    ORDER BY column_name;
--
--   -- expect ZERO rows: nobody on an existing trial had their date moved.
--   -- Anyone still holding a ~14-day window keeps it, by design.
--   SELECT email, subscription_expires_at, created_at
--     FROM public.profiles
--    WHERE subscription_status = 'trial'
--      AND subscription_expires_at < now();
--
-- Then confirm on the real path: sign up a throwaway account and check the
-- banner reads 7 days, not 14. That is the only test that exercises the
-- default, since nothing in the application code sets these fields.
