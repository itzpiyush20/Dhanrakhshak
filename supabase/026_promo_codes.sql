-- 026_promo_codes.sql
--
-- Moves coupon codes out of the browser and into the database.
--
-- Codes were checked client-side against VITE_PROMO_CODES. Every variable
-- prefixed VITE_ is compiled into the public JavaScript bundle, so the full
-- list of valid codes was readable by anyone who opened developer tools. The
-- grant then only reached localStorage, so a redeemed coupon also vanished
-- when the user opened the app anywhere else.
--
-- Codes now live here and are validated by api/redeem-promo.ts using the
-- service-role key. Nothing about a code reaches the browser.
--
-- After running this, insert your existing codes — see the bottom of the file.

BEGIN;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  -- Stored uppercase; the endpoint uppercases input before matching, so
  -- 'welcome' and 'WELCOME' are the same code.
  code TEXT PRIMARY KEY,
  plan_type TEXT NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly', 'annual')),
  duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  -- NULL means unlimited uses.
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One redemption per code per account, enforced by the database rather than by
-- application logic, so a double-clicked button cannot grant two months.
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES public.promo_codes(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user
  ON public.promo_redemptions(user_id, redeemed_at DESC);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for ordinary users on promo_codes: a signed-in user must
-- not be able to list valid codes. The service-role key bypasses RLS, so
-- redeem-promo.ts still reads them; admins can read them for the admin panel.
DROP POLICY IF EXISTS "Admins can view promo codes" ON public.promo_codes;
CREATE POLICY "Admins can view promo codes"
  ON public.promo_codes FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own redemptions" ON public.promo_redemptions;
CREATE POLICY "Users can view own redemptions"
  ON public.promo_redemptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

COMMIT;

-- ── Insert your existing codes ────────────────────────────────────────────
-- Take the values currently in VITE_PROMO_CODES and add one row each, e.g.
--
--   INSERT INTO public.promo_codes (code, plan_type, duration_days, note)
--   VALUES ('WELCOME2026', 'monthly', 30, 'Launch coupon')
--   ON CONFLICT (code) DO NOTHING;
--
-- Then DELETE the VITE_PROMO_CODES variable from Vercel. While it exists it is
-- still shipped to every visitor's browser, even though nothing reads it now.
--
-- To disable a code later:  UPDATE public.promo_codes SET active = false WHERE code = 'X';
-- To cap it:                UPDATE public.promo_codes SET max_uses = 100 WHERE code = 'X';
