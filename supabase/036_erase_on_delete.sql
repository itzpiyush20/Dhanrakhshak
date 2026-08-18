-- 036_erase_on_delete.sql
--
-- Makes "Delete Account" actually erase the person, not just the account.
--
-- THE GAP: public.delete_user() deletes the auth.users row, profiles cascades
-- from it, and every other user table cascades from profiles — transactions,
-- budgets, cards, merchant rules, scan logs, scan rejections, insurance
-- policies, the stored Google refresh token, signin_logs, payments, promo
-- redemptions. Two tables deliberately do NOT cascade:
--
--   public.feedback         user_id ... ON DELETE SET NULL   (024, schema.sql)
--   public.support_tickets  user_id ... ON DELETE SET NULL   (031)
--
-- Both were written that way on purpose and the reasoning is sound: 031 says it
-- outright — "SET NULL rather than CASCADE so a deleted account does not erase
-- the ticket history the owner may still need". A complaint that vanishes the
-- moment the complainant deletes their account is a complaint the owner can
-- never answer for, and admin_feedback_summary()'s rating average would silently
-- shift every time somebody left.
--
-- But SET NULL only detaches the row. It does not touch the columns that carry
-- the person: feedback.email (NOT NULL, holds the address), and on
-- support_tickets both email AND name. So today, after a user exercises their
-- DPDPA right to erasure, we still hold their email address — and their real
-- name, if they ever filed a support ticket — indefinitely, with no account left
-- to delete it from and no UI anywhere that could reach it. PrivacyPage section
-- 5 promises "This removes all your personal data ... from our servers within
-- 24 hours", which is simply not true while those columns survive.
--
-- THE FIX IS ANONYMISATION, NOT DELETION. Deleting the rows would throw away
-- the history the SET NULL exists to keep. Scrubbing the identifying columns
-- keeps the row, its timestamps, its rating and its category — so counts,
-- averages and the unhandled queue are all unchanged — while the identity is
-- gone. What survives is a record of what was reported, not of who reported it.
--
-- WHY A TRIGGER AND NOT TYPESCRIPT. There are at least three ways a profile
-- row dies, and only one of them runs our code:
--
--   1. the delete_user() RPC (012), the normal path,
--   2. the fallback purge in src/services/profiles.ts, which DELETEs the
--      profiles row directly when the RPC is unavailable,
--   3. the owner deleting a row by hand in the Supabase dashboard, or any
--      future admin tool, cron or support script.
--
-- Doing this in deleteAccount() would cover (1) and (2) and miss (3) — and (1)
-- doesn't even go through application code for the cascade, the database does.
-- A trigger on public.profiles fires for all of them, including deletions that
-- do not exist yet.
--
-- ── What is scrubbed, and what deliberately is not ────────────────────────
--
--   feedback.email          -> pseudonym       identity, scrubbed
--   support_tickets.email   -> pseudonym       identity, scrubbed
--   support_tickets.name    -> 'Deleted user'  identity, scrubbed
--
--   rating, category, subject, message, created_at, handled_at   KEPT
--
-- THE MESSAGE BODY IS KEPT, and that is a decision, not an oversight.
--
-- The message is the entire substance of the record. Scrub it and the row
-- becomes a husk — a timestamp, a rating and nothing that says what went wrong.
-- That is strictly worse than deleting the row outright, because it keeps a
-- number in the owner's dashboard while destroying the only part of it with any
-- meaning. The whole reason these two tables refuse to cascade is to preserve
-- what was reported; scrubbing the report defeats it entirely.
--
-- The columns we DO scrub are the ones the SYSTEM attached. The user never
-- chose to disclose their email on a particular piece of feedback; the form
-- filled it in from their account. Their name on a support ticket is the same.
-- The message, by contrast, is free text the person wrote and chose to send,
-- knowing it was going to a human who would read it and act on it. Retaining it
-- is the legitimate-interest case that keeping the row rests on at all.
--
-- The residual risk is real and is not pretended away: somebody can type a
-- phone number, an account number or a screenshot's worth of detail into a
-- support message, and this migration will keep it. Two things bound that.
-- First, it is capped — support_tickets.message CHECKs 10..5000 characters
-- (031). Second, and more to the point, the Privacy Policy is being changed in
-- the same change as this file to say so in plain words, so that anyone typing
-- into that box knows beforehand exactly what will outlive their account. An
-- accurate promise the user can act on beats a flattering one we cannot keep.
--
-- ── The pseudonym ─────────────────────────────────────────────────────────
--
-- Not a bare constant. Each deleted user's rows get
--
--   deleted-user-<8 hex>@removed.invalid
--
-- where the hex is the first 8 characters of md5(profile id). Two purposes:
--
--   * The owner can still see that three tickets came from ONE person rather
--     than three, which matters when reading a history. Collapsing everyone
--     onto one address would lose that and make the surviving history read
--     wrongly.
--   * It stays non-identifying. The input is a random v4 UUID from a 122-bit
--     space, truncated to 32 bits of digest, and the row it came from has just
--     been deleted — there is nothing left to join it back to. It is a
--     pseudonym with no key in existence, which is the point.
--
-- .invalid is reserved by RFC 2606 and is guaranteed never to resolve, so no
-- reply, alert or export can accidentally mail a real inbox — and an owner who
-- tries to answer a scrubbed ticket finds out immediately instead of mailing
-- whoever later registers a lookalike domain.
--
-- SECURITY DEFINER is required. The caller running the delete is `authenticated`
-- (or `anon`, on the dashboard path it is the table owner), and the RLS policies
-- on these tables allow UPDATE to admins only — 028 for feedback, 031 for
-- support_tickets. An ordinary user deleting their own account has no right to
-- update a support ticket, and should not be given one; the definer runs as the
-- table owner, for whom RLS is not enforced, and the function takes no
-- parameters and can only ever touch rows matching the profile being deleted.
-- search_path is pinned exactly as migration 033 pins the other four.

BEGIN;

-- ── 1. The anonymiser ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_user_authored_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Derived from the id of the profile being deleted, so all of one person's
  -- rows land on the same pseudonym and two people never collide in practice.
  pseudonym TEXT := 'deleted-user-' || substr(md5(OLD.id::text), 1, 8) || '@removed.invalid';
BEGIN
  -- Fires BEFORE DELETE, so user_id still points at OLD.id here. The FK's
  -- ON DELETE SET NULL is a referential-integrity action on the referencing
  -- table and runs after this, which is what lets us find the rows at all — an
  -- AFTER DELETE trigger would arrive to find every user_id already NULL and
  -- no way to tell whose was whose.
  UPDATE public.feedback
     SET email = pseudonym
   WHERE user_id = OLD.id;

  UPDATE public.support_tickets
     SET email = pseudonym,
         name  = 'Deleted user'
   WHERE user_id = OLD.id;

  -- Both writes satisfy the CHECK constraints 031 put on support_tickets:
  -- the pseudonym is 37 characters (needs 3..320) and 'Deleted user' is 12
  -- (needs 1..120). Neither table has a BEFORE UPDATE trigger, so nothing
  -- else fires from here — throttle_support_tickets (032) is BEFORE INSERT
  -- only and is not reached.

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS anonymize_user_authored_records ON public.profiles;
CREATE TRIGGER anonymize_user_authored_records
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.anonymize_user_authored_records();

-- ── 2. The rows already stranded by past deletions ────────────────────────
--
-- Every account deleted before today left its address behind. Those rows are
-- reachable for feedback and NOT reachable for support_tickets, and the
-- difference is worth stating because it looks inconsistent otherwise.
--
-- feedback: since migration 032 the INSERT policy is
-- `TO authenticated WITH CHECK (auth.uid() = user_id)`, so a feedback row can
-- only ever have been created with its user_id set. A NULL user_id there means
-- one of exactly two things: the account was deleted (SET NULL fired), or the
-- row predates 032 and was written anonymously with the public anon key. In
-- BOTH cases we are holding an email address with no account behind it and no
-- way for its owner to reach it. Scrubbing is right either way.
--
-- The pseudonym for these is derived from the feedback row's own id, because
-- the profile id is long gone. That means historical rows do not group by
-- person — but that grouping was already destroyed when SET NULL fired, so
-- nothing is lost that still existed.
UPDATE public.feedback
   SET email = 'deleted-user-' || substr(md5(id::text), 1, 8) || '@removed.invalid'
 WHERE user_id IS NULL
   AND email NOT LIKE '%@removed.invalid';

-- support_tickets is DELIBERATELY NOT BACKFILLED.
--
-- 031 opened INSERT to anon on purpose: "someone locked out of their account is
-- exactly who needs support". So a NULL user_id on a ticket means EITHER a
-- deleted account OR a signed-out visitor who never had an account at all — and
-- nothing in the row distinguishes them. There is no deletion timestamp to
-- compare against, and the email cannot be matched to profiles because a
-- visitor legitimately has no profile.
--
-- Scrubbing them all would destroy the reply address of every person who ever
-- filed a ticket while locked out, which is the one group the open policy
-- exists to serve, and would do it silently. Migration 032 set the precedent
-- for exactly this situation and left its historical rows alone for the owner
-- to judge. Same here: the trigger above guarantees the behaviour from now on,
-- and the verification block below gives the owner the query to review the
-- stragglers and decide row by row.

COMMIT;

-- Verify afterwards:
--
--   -- expect one row: the trigger exists on profiles, BEFORE DELETE
--   SELECT tgname, tgtype FROM pg_trigger
--    WHERE tgrelid = 'public.profiles'::regclass
--      AND NOT tgisinternal
--      AND tgname = 'anonymize_user_authored_records';
--
--   -- expect prosecdef = true and proconfig containing search_path=public
--   SELECT p.proname, p.prosecdef, p.proconfig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'anonymize_user_authored_records';
--
--   -- expect ZERO rows: no detached feedback still carries a real address
--   SELECT id, email, created_at FROM public.feedback
--    WHERE user_id IS NULL AND email NOT LIKE '%@removed.invalid';
--
--   -- REVIEW, do not assume. Detached support tickets holding a real address.
--   -- Some are deleted accounts (scrub them); some are signed-out visitors who
--   -- still need a reply (leave them). Owner's call, one at a time.
--   SELECT id, name, email, subject, created_at, handled_at
--     FROM public.support_tickets
--    WHERE user_id IS NULL AND email NOT LIKE '%@removed.invalid'
--    ORDER BY created_at DESC;
--
-- Then exercise the real path end to end, in a transaction you roll back, so
-- production data is never actually destroyed:
--
--   BEGIN;
--   -- pick a throwaway account that has filed both
--   SELECT id, email FROM public.profiles WHERE email = '<throwaway>';
--   DELETE FROM public.profiles WHERE email = '<throwaway>';
--   -- expect: rows still present, message/subject/rating/created_at intact,
--   -- user_id NULL, email 'deleted-user-XXXXXXXX@removed.invalid',
--   -- support ticket name 'Deleted user'. Both tables must show the SAME
--   -- 8-hex pseudonym, since both came from one profile id.
--   SELECT 'feedback' AS src, email, rating::text, message, created_at
--     FROM public.feedback WHERE email LIKE 'deleted-user-%'
--   UNION ALL
--   SELECT 'ticket', email, name, message, created_at
--     FROM public.support_tickets WHERE email LIKE 'deleted-user-%';
--   ROLLBACK;
--
-- And confirm the counts the owner reads did not move — this is the whole
-- reason the rows are anonymised rather than deleted. Run before and after the
-- block above; both must return identical numbers:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<your admin user id>"}', true);
--   SELECT * FROM public.admin_feedback_summary();
--   SELECT * FROM public.admin_support_ticket_summary();
--   ROLLBACK;
