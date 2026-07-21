# Automatic Daily Gmail Sync

## Problem

Transaction ingestion from Gmail (`source: 'email'`) only ever runs when a user has
the app open in a browser — `scanRealGmailInbox()` in `src/services/emailScanner.ts`
is triggered by a Dashboard page load or a manual "Sync Now" click on Pending Alerts.
There is no server-side scheduler. If a user doesn't open the app for more than a day
or two, transactions silently stop appearing — not because of an error (a related bug
in the scan-window calculation, already fixed separately, made this worse by
permanently skipping the gap instead of just delaying it), but because nothing ever
triggers a scan.

Users on an eligible plan (paying customers) shouldn't have their expense tracking
depend on remembering to open the app.

## Goals

- Gmail transactions are pulled in automatically once a day, without the user
  opening the app, for **eligible users only**: the app owner (`OWNER_EMAILS`) or
  anyone with an active `premium` subscription or an unexpired `trial` — the same
  eligibility already used to bypass the manual 24h scan cooldown.
- The existing manual "Sync Now" / auto-scan-on-dashboard-load flow keeps working
  exactly as today, for all users, as a fallback and for on-demand syncing.
- A user whose Google refresh token has been revoked is skipped (not retried forever)
  and doesn't block the sync for other users.
- No duplicate transactions between automatic and manual syncs — same dedup rules
  apply (`email_message_id`, `reference_id`).

## Non-goals

- No change to non-eligible (free-tier) users' experience — they keep manual sync
  with the existing 1-scan/24h cooldown, no automatic cron sync.
- No push notification when the automatic sync finds new transactions — the existing
  in-app surfaces (Dashboard, Pending Alerts, notification bell) are enough; this is
  purely about *when* ingestion happens, not new UI.
- No encryption-at-rest layer for the stored refresh token beyond RLS
  (service-role-only access) — consistent with how this app already handles other
  server secrets (e.g. the client already transmits the same refresh token in
  plaintext to `/api/refresh-google-token` on every silent refresh today).
- No configurable schedule/opt-out UI — fixed daily time for all eligible users, same
  as the existing weekly digest cron has no opt-out UI yet either.

## Design

### 1. Persisting the refresh token server-side

New table, migration `supabase/006_google_oauth_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service-role key (used exclusively in
-- server-side /api functions) can read or write this table. The anon/authenticated
-- roles used by the browser client have zero access, by default-deny RLS.
```

New endpoint `api/save-google-refresh-token.ts`, mirroring the auth pattern already
used in `api/refresh-google-token.ts` (verify the caller's Supabase JWT via a
service-role client, then act on `user.id` from the verified token — never trust a
client-supplied user id):

- `POST { refreshToken }` with `Authorization: Bearer <supabase JWT>`.
- Verifies the JWT via `supabaseAdmin.auth.getUser(jwt)`.
- Upserts `{ user_id: user.id, refresh_token, updated_at: now() }` into
  `google_oauth_tokens`.

Called from `src/context/AuthContext.tsx` at both existing call sites that currently
call `saveGoogleRefreshToken(session.provider_refresh_token)` (browser
`localStorage`) — add a fire-and-forget call to this new endpoint right alongside
them, so the server learns the refresh token the moment the browser does. Failures to
reach the endpoint are logged and swallowed (non-fatal — manual sync still works via
the localStorage copy; the user just won't get automatic sync until their next
successful OAuth refresh/login re-attempts the save).

### 2. Sharing the scan logic between browser and cron

`scanRealGmailInbox()` in `src/services/emailScanner.ts` currently reads
`localStorage` and `supabase.auth.getSession()` directly, and calls
`analyzeTransactionEmailWithAI()` which goes through the browser-only
`/api/gemini-proxy` (requires a live user session + browser-side quota tracking).

Refactor:

- Extract the body of `scanRealGmailInbox()` (from "get provider token" onward) into
  an exported `runGmailScan(params)`, taking every external dependency as an explicit
  argument instead of reaching into browser globals:
  `{ userId, userEmail, accessToken, isOwner, isPremium, activeYear, askAI }` where
  `askAI(subject, body, mailDate)` replaces the direct call to
  `analyzeTransactionEmailWithAI`.
- `scanRealGmailInbox()` becomes a thin wrapper: resolves the browser-only inputs
  (session, localStorage token, premium check, active year from localStorage) and
  calls `runGmailScan()` with `askAI` bound to the existing proxy-based
  `analyzeTransactionEmailWithAI`.
- The cron endpoint calls `runGmailScan()` directly per user, with `askAI` bound to a
  direct Gemini call using the server's `GEMINI_API_KEY` (no per-user proxy quota
  applies to the automatic path — it's already gated to eligible/paying users).
- `runGmailScan()` uses a Supabase client passed in by the caller (browser's existing
  anon-key singleton vs. a service-role client scoped by explicit `user_id` filters in
  the cron), since RLS via `auth.uid()` isn't available to a cron job.

This keeps parsing/categorization/dedup logic in one place so manual and automatic
syncs can't drift apart.

### 3. Cron endpoint

`api/auto-sync-gmail.ts`, following the `weekly-digest.ts` pattern (auth via
`Authorization: Bearer $CRON_SECRET`, 401 otherwise):

1. Query `google_oauth_tokens` joined with `profiles` for eligibility: owner email,
   or `subscription_status = 'active'` with `subscription_expires_at` in the future
   (or null), or `subscription_status = 'trial'` with `subscription_expires_at` in
   the future. Same rule `scanRealGmailInbox()` already applies for the manual
   cooldown bypass.
2. For each eligible user, sequentially (small delay between users to stay under
   Gmail API rate limits):
   - Exchange `refresh_token` for an access token via the same Google token endpoint
     `api/refresh-google-token.ts` already calls (inlined here, since this runs
     server-to-server with no user JWT to hand that endpoint).
   - On `invalid_grant` (revoked token): delete the user's `google_oauth_tokens` row
     and write a `failed` `email_scan_logs` row noting reconnection is needed, then
     continue to the next user.
   - Otherwise call `runGmailScan()` for that user, catch and log any error per-user
     (write a `failed` scan log), and continue regardless of outcome.
3. Return a summary `{ usersProcessed, succeeded, failed, transactionsFound }` for
   observability in Vercel's cron logs.

### 4. Schedule

`vercel.json` gains a second cron entry:

```json
{ "path": "/api/auto-sync-gmail", "schedule": "30 21 * * *" }
```

21:30 UTC = 3:00 AM IST daily. Runs alongside the existing weekly digest cron
(`0 6 * * 1`).

### 5. Interaction with the existing scan-window fix

The scan-window logic (already fixed separately, in `emailScanner.ts`) anchors each
scan's lookback to the timestamp of the user's *last successful* scan, not a fixed 26
hours — capped at a 30-day maximum lookback. This is what makes a daily cron safe: if
a run is delayed or fails one day, the next run automatically backfills the gap
instead of losing it. `runGmailScan()` retains this logic unchanged since it's part
of the shared core.

## Error handling

- Per-user failures (revoked token, Gmail API error, AI parse error) never abort the
  batch — each user is isolated in its own try/catch inside the cron loop.
- A revoked token stops being retried daily (row deleted on `invalid_grant`) so the
  cron doesn't waste calls on dead tokens indefinitely; the user's next app visit
  will prompt reconnect via the existing "Gmail Inbox not connected" flow.
- `save-google-refresh-token` failures are non-fatal to login/OAuth — sync just stays
  manual-only for that user until the next successful save.

## Testing

- Unit test `runGmailScan()` with a mocked Gmail API + `askAI` to verify dedup,
  category rules, and insertion behave identically to today's manual-scan tests.
- Manual verification: connect Gmail, confirm a `google_oauth_tokens` row appears;
  trigger `api/auto-sync-gmail` locally with the `CRON_SECRET` header and confirm
  transactions land, respecting the eligibility filter (test with a free-tier test
  account to confirm it's skipped).
