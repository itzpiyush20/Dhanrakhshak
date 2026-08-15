-- 030_promo_code_expiry.sql
--
-- Gives a coupon code its own expiry, separate from the access it grants.
--
-- promo_codes.duration_days is how long the SUBSCRIPTION lasts once redeemed.
-- This new column is when the CODE itself stops working. A Diwali code can
-- grant 30 days of access but only be redeemable until the end of the festival.
--
-- Expired codes are hidden from the admin list rather than deleted, so the
-- record of what was offered and who redeemed it survives. Redemption still
-- refuses them explicitly — someone may be holding the code from an old
-- message long after it vanished from the list.
--
-- NULL means the code never expires, which is what every existing code gets.

BEGIN;

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.promo_codes.expires_at IS
  'When the code stops being redeemable. NULL = never. Not to be confused with duration_days, the length of access it grants.';

COMMIT;
