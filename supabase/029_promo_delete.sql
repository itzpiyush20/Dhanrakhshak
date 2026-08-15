-- 029_promo_delete.sql
--
-- Lets an admin delete a coupon code without destroying its history.
--
-- promo_redemptions.code referenced promo_codes(code) ON DELETE CASCADE, so
-- deleting a code silently took every record of who had redeemed it. That is
-- the audit trail for free access, and it should outlive the code.
--
-- Dropping the foreign key leaves redemption rows behind as plain text once
-- the code is gone. Deleting a code therefore:
--
--   * removes it from the admin list
--   * blocks all future redemption (redeem-promo finds no row -> 'not_found')
--   * does NOT touch access already granted, which lives on profiles and is
--     independent of this table
--   * keeps the record of who redeemed it, and the payments row carrying the
--     code as text
--
-- Side effect worth knowing: because redemption rows survive, recreating the
-- same code later will not let a previous redeemer use it a second time — the
-- UNIQUE (code, user_id) still matches.

BEGIN;

ALTER TABLE public.promo_redemptions
  DROP CONSTRAINT IF EXISTS promo_redemptions_code_fkey;

COMMIT;
