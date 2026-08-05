# Email Scan Recall Fix — Boilerplate Stripping, Rejection Logging, Deep Rescan

## Problem

The automatic expense tracker (`scanRealGmailInbox()` in
`src/services/emailScanner.ts`) silently drops genuine bank transaction emails.
Confirmed with a real sample: an Axis Bank EMI debit alert for ₹42,293 was never
turned into a transaction, even though the email positively matched the
"transaction alert" hard-accept subject pattern.

Root cause, traced line-by-line against the actual email:

- `HARD_REJECT` gate at `emailScanner.ts:1089` (`declined|failed|...|initiated|...`)
  fires on the standard security footer *"if the transaction has not been
  **initiated** by you"* — a negated fraud warning, not a pending-payment notice.
- The OTP gate at `emailScanner.ts:1090` fires on *"please **do not share** your
  ... Credit/Debit Card number/CVV/OTP"* — boilerplate advisory text, not an OTP
  being sent.
- Both are unconditional `continue`: the email is discarded before an amount is
  even extracted, despite having already passed the hard-accept subject check.

This is a **class** of bug, not a one-off: every bank/fintech appends its own
security/legal footer, and any footer phrase that happens to contain a
rejection keyword silently kills an otherwise-perfect transaction email. Two
downstream defects were also found via the same trace, both caused by the same
root issue (gates and field-extraction reading footer text as if it were
transaction content):

- `detectPaymentMode()` would misread "Credit/Debit Card number/CVV" from the
  security footer and report `debit_card`, when the actual transaction is an
  A/c-linked EMI debit with no card involved.
- Merchant extraction falls back to "Axis Bank" (the sender), losing 10
  confidence points, because the real EMI reference token
  (`PPR030614052540_EMI_05-08-`) isn't reachable by any existing pattern and the
  sender display name is explicitly excluded (`emailScanner.ts:1224`) for
  containing "bank"/"alert".

There is currently **no test coverage** for `emailScanner.ts` (1,409 lines, the
core ingestion path for the product), which is why a regression like this can
ship and persist silently.

## Goals

- Genuine settled-transaction emails are no longer rejected because of
  boilerplate/footer text colliding with a rejection keyword — fixed as a
  general mechanism, not a one-off patch for the Axis wording.
- The specific Axis EMI sample provided is captured correctly (debit,
  ₹42,293, EMI event type) and locked in by a regression test built from the
  real email.
- When a scan rejects an email, the reason is recorded and visible, so the
  next recall gap is diagnosable in minutes instead of requiring a manual
  trace.
- Transactions missed by this bug before the fix can be recovered via an
  explicit, user-triggered deep rescan, without creating duplicates and
  without being silently truncated by the existing 100-message page cap.
- The parsing/gating logic gets test coverage so this class of regression is
  caught before it ships again.

## Non-goals

- **Transaction direction (debit/credit) misclassification** is out of scope
  for this pass. Several real issues were found during investigation (the AI
  path applies no sanity check on `transaction_type`, `classifyEventType()` is
  skipped on the AI path, credit-card-bill emails can score as income, known
  merchants force credit→debit regardless of context) — but the user has not
  observed these symptoms, only missed transactions. Flagged here so this
  known list isn't lost; a separate design should address it if/when it's
  prioritized.
- **Income/expense aggregation correctness** (`total_income` including
  refunds/cashback/self-transfers) is out of scope for the same reason.
- **Gemini quota starvation** (50 calls/day, 20 requests/min in
  `api/gemini-proxy.ts`) is a known contributing factor — it's what pushes most
  of a scan onto the fragile regex fallback path in the first place — but is
  explicitly not being changed here. This means the regex path's correctness
  carries extra weight, which is exactly what this design fixes.
- No change to the confidence threshold (currently ≥65) or the
  `TRUSTED_SENDER_DOMAINS` allowlist. Tuning either is a false-positive/recall
  trade-off that needs its own analysis, separate from the boilerplate-collision
  bug being fixed here.
- No change to `HARD_ACCEPT_SUBJECT_PATTERNS` or the AI prompt in
  `aiService.ts`.

## Design

### 1. Boilerplate stripping

New pure function `stripBoilerplate(text: string): string` in a new file
`src/services/emailBoilerplate.ts` (kept separate from `emailScanner.ts` so it
is independently unit-testable without mocking Gmail).

Called once, immediately after `extractEmailBody()`, before `fullText` /
`emailContentForParsing` are constructed in `scanRealGmailInbox()` — so both
the AI prompt input and every regex gate see the same cleaned text.

It removes known non-transactional boilerplate **sentence-by-sentence** (bounded
matches, not a bare keyword blacklist, to avoid deleting transaction content
that happens to share a word):

- Security/fraud advisories: "if this transaction/it was not
  [done/initiated] by you...", "please do not share your ... (OTP|CVV|PIN|
  password|card number)...", "RBI never deals with individuals for...", "do not
  click on links from unknown/unsecure sources..."
- Legal/UI chrome: "this email is confidential...", "know more >>", "this is a
  system generated communication...", copyright lines, "Terms & Conditions
  apply", app/nav badge rows (e.g. "CHAT WEB Support Mobile app Internet
  Banking WhatsApp Branch Locator")
- Non-transactional helpline instructions: "SMS BLOCKALL to...", "call 1800..."

Patterns are seeded from the real Axis sample and structured as an
easily-appendable list (one new regex per future bank's footer variant, no
gate-logic changes required going forward).

### 2. Gate re-scoping

With boilerplate stripped, most existing gates are correct again by
construction. Two additional narrowings, independent of the strip step:

- `HARD_REJECT` at `emailScanner.ts:1089` is split: outcome-negative words
  (`declined|failed|unsuccessful|rejected|cancelled|void|voided`) remain a hard
  reject. `initiated|requested` alone no longer auto-rejects — it only rejects
  when paired with pending/future language ("has been initiated" without a
  completion word nearby), since "initiated" alone is ambiguous between "still
  pending" and incidental text like "not... initiated by you".
- OTP/PIN gate (`emailScanner.ts:1090`) is unchanged — still a hard reject for
  genuine OTP/passcode content.

Both the reject and accept gate checks are extracted from the inline loop body
in `scanRealGmailInbox()` into small named, independently callable functions
(e.g. `isHardRejected()`, `isPromotionalSpam()`, `isOtpOrSecurityCode()`) so
they can be unit tested directly instead of only being reachable by mocking a
full Gmail response.

### 3. Rejection logging

New table (migration `supabase/010_email_scan_rejections.sql`):

```sql
CREATE TABLE IF NOT EXISTS public.email_scan_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_log_id UUID REFERENCES public.email_scan_logs(id) ON DELETE CASCADE,
  sender_domain TEXT,
  subject TEXT,
  gate TEXT NOT NULL,
  matched_snippet TEXT,
  rejected_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_user
  ON public.email_scan_rejections(user_id, rejected_at DESC);

ALTER TABLE public.email_scan_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan rejections"
  ON public.email_scan_rejections FOR SELECT
  USING (auth.uid() = user_id);
-- Insert-only via server-side/authenticated scan path; no client-side
-- insert policy needed since scans always run with the user's own session
-- or the service-role key (cron path).
```

- `gate` values are stable identifiers matching the extracted gate functions
  from section 2 (e.g. `hard_reject_declined`, `otp_filter`,
  `promotional_spam`, `confidence_below_65`, `ai_confident_reject`), so a future
  investigation can filter/aggregate by exact cause.
- Every `continue` in the regex fallback loop, plus the AI path's
  `aiConfidentReject` branch and the final confidence<65 drop, calls a
  fire-and-forget `logRejection(...)` (not awaited — must never slow down or
  fail a scan).
- Retention: a scheduled cleanup (reusing the existing cron infra pattern from
  `auto-sync-gmail.ts`) deletes rows older than 30 days. This is diagnostic
  data, not a permanent record.
- UI: a collapsed "Recently skipped emails" section on Pending Alerts
  (`PendingPage.tsx`), showing the latest rejections tied to the most recent
  `scan_log_id`. Read-only list, reusing existing list/table patterns already
  on that page — no new interaction model.

### 4. Deep Rescan (recovery of already-missed transactions)

The normal scan window (`emailScanner.ts:887`) only ever looks back ~26 hours
on a routine scan, so fixing the gates recovers nothing retroactively on its
own — emails from before the fix need an explicit wider pass.

- Parsing/gating logic is factored out of `scanRealGmailInbox()` into a shared
  internal `processMessages()` helper, so there is exactly one code path for
  turning a Gmail message into a transaction (or a logged rejection). Both the
  normal scan and the deep rescan call it — no forked/duplicated gate logic.
- New exported function `deepRescanGmailInbox(opts: ScanGmailOptions &
  { lookbackDays: number })`. Difference from the normal scan: the Gmail
  `messages.list` pagination loop is not early-broken at the 100-message cap
  (`emailScanner.ts:913`) — it pages through the full result set for the
  requested window, batching detail fetches the same way (batches of 15) the
  normal scan already does.
- `lookbackDays` is user-selectable, capped at 30 to match the existing
  `MAX_LOOKBACK_MS` guarantee already relied on elsewhere in the file.
- Existing dedup (`email_message_id`, `reference_id`) is untouched and is what
  makes re-running this safe — no new duplicate-prevention logic needed.
- UI: a "Deep Rescan" button on Pending Alerts, separate from "Sync Now", with
  a lookback picker (7/14/30 days) and a confirmation step (it may take
  longer and consumes Gemini quota faster). Not subject to the existing 24h
  cooldown — same manual-bypass precedent as the owner/premium eligibility
  check already in the file — but rate-limited client-side to once per hour to
  prevent accidental repeated runs over the same window.

### 5. Testing

- `src/services/emailBoilerplate.test.ts` — unit tests for
  `stripBoilerplate()`, using the real Axis email as a fixture: asserts the
  security/OTP footer sentences are removed while the transaction sentence and
  amount (`INR 42293.00`) survive intact.
- `src/services/emailScanner.gates.test.ts` — tests for each extracted gate
  function from section 2, covering:
  - the Axis fixture must pass all reject gates post-strip
  - a synthetic genuine OTP email must still be rejected
  - a synthetic promotional/cashback-offer email must still be rejected
  - a synthetic "payment declined" email must still be rejected
- One integration-style test in `emailScanner.test.ts` (new file) that mocks
  the Gmail API response with the Axis fixture and asserts
  `scanRealGmailInbox()` end-to-end produces exactly one transaction row:
  `type: 'debit'`, `amount: 42293`, `event_type: 'emi'`. This is the
  regression test that pins the reported bug shut.

## Error handling

- `logRejection()` failures (e.g. a transient DB error) must never throw into
  the scan loop — wrapped in try/catch, logged to console only, matching the
  existing fire-and-forget pattern already used for card-issuer sync in this
  file.
- `deepRescanGmailInbox()` reuses the same error surface as
  `scanRealGmailInbox()` (`TOKEN_EXPIRED`, network failure messages, etc.) via
  the shared `processMessages()` helper — no new error-message contract for
  the UI to handle.
- If `stripBoilerplate()` throws on unexpected input (defensive only — it's a
  pure regex-replace function), the caller falls back to the unstripped text
  rather than failing the whole email, so a bug in the stripper can only ever
  cause a miss, never crash a scan.
