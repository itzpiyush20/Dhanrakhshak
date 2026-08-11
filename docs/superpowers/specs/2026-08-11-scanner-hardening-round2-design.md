# Scanner hardening round 2 — design

## Scope

Continuation of the newsletter false-positive fix already shipped. Three
verified, mechanical hardening items. Two items considered and explicitly
deferred (see Non-goals) because they need their own design decision, not a
rushed heuristic under this round's momentum.

## Problem

Three real gaps found by re-reading the scan pipeline against the same
standard as the shipped fix — reused mechanism where possible, verified
against fixtures, no guessing.

**1. Trusted-sender marketing bypasses the bulk-mail gate entirely.**
The gate shipped last round (`isBulkMarketingEmail(...) && !hasPaymentAssertion(...)`)
is guarded by `!isTrustedSender` at both call sites in `emailScanner.ts`. Banks
and fintechs in `TRUSTED_SENDER_DOMAINS` send marketing from the same domains
as real alerts (cashback pushes, credit-card upsells) — those bypass the gate
completely and rely solely on the AI's prompt-only judgment, with none of the
structural (`List-Unsubscribe`) protection genuine marketing already gets
caught by for untrusted senders.

**2. Gmail message fetch silently drops on any non-401/403 failure.**
`emailScanner.ts:964-974`: `fetch()` per message ID checks `status === 401 ||
status === 403` for token expiry; any other failure (`429` rate-limit, `500`,
network blip) hits `if (!res.ok) return null`, filtered out of `validDetails`
with no retry, no log, no trace in `email_scan_rejections` (that table only
records content rejections, not fetch failures). A large scan that trips
Gmail's rate limit mid-batch loses those messages permanently — the user has
no way to know they were ever fetched incompletely.

**3. The transaction insert is one batch call with no fault isolation.**
`emailScanner.ts:1428-1433`: `transactionsToInsert` — potentially many
unrelated pending transactions from one scan — is inserted in a single
`.insert(transactionsToInsert)` call. `email_message_id` already has a DB
unique constraint (`transactions_email_message_id_user_id_key`,
`schema.sql:493-495`) specifically guarding the two-scans-race-the-same-email
case, so silent duplication is not possible. But if that constraint is hit by
even one row (concurrent cron + manual scan, or a retry after a partial prior
failure), the whole call throws, `if (txnError) throw txnError` propagates it,
and the entire batch — every other legitimate transaction in that scan run —
is discarded and reported to the user as a generic failed scan.

## Non-goals (deferred, not "won't fix")

- **Forwarded receipts.** Considered: gate on `Fwd:`/`FW:` subject prefixes or
  Gmail's `---------- Forwarded message ---------` body marker. Rejected for
  this round on a concrete counter-case: a user forwarding their own receipt
  to themselves for archival is legitimate and would be wrongly dropped by a
  hard reject. This needs a real design decision (reject vs. flag-for-review
  vs. something else), not a heuristic added under this round's momentum.
- **Visibility/alerting dashboard.** A new UI surface, not a hardening fix to
  existing code. Needs its own requirements pass (what triggers an alert, where
  it's shown, whether it's a page or a notification) before any implementation.

## Design

### A1 — Drop the trusted-sender exemption from the bulk-mail gate

Both gate call sites in `emailScanner.ts` change from:

```
!isTrustedSender && isBulkMail && !hasPaymentAssertion(...)
```

to:

```
isBulkMail && !hasPaymentAssertion(...)
```

No new helper — `isBulkMarketingEmail`/`hasPaymentAssertion` (shipped last
round) are already sender-agnostic. `isTrustedSender` is untouched everywhere
else (still feeds `computeConfidence`'s scoring). Verified safe against the
`axisEmiDebit` fixture: grepped for unsubscribe/opt-out markers, found none —
a real bank alert, even with a promotional footer line, doesn't carry
`List-Unsubscribe` the way a genuine marketing blast does, so this fixture is
unaffected.

New fixture `bankMarketingFromTrustedSender.ts`: a cashback/credit-card-upsell
email from `alerts.hdfcbank.com` (already in `TRUSTED_SENDER_DOMAINS`), with a
real `List-Unsubscribe` header and no payment-assertion vocabulary. Proves the
gate now rejects it where it previously would not have been evaluated at all.

### B1 — Retry Gmail message fetch on transient failure

`emailScanner.ts:964-974`'s per-message fetch wraps the network call with the
existing `retryWithBackoff` (`src/utils/index.ts:60`) instead of a single
attempt:

```ts
const res = await retryWithBackoff(
  () => fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
    { headers: { Authorization: `Bearer ${providerToken}` } }),
  2,   // 2 retries beyond the first attempt
  500  // 500ms initial delay, doubling — matches Gmail's own backoff guidance
)
```

`retryWithBackoff` retries on thrown exceptions, not on a resolved-but-bad
HTTP status, so the fetch body is wrapped to throw on `429` and `5xx`
specifically (401/403 keep their existing immediate-return-null-and-flag
behavior, unchanged — those are auth failures, not transient, and retrying
won't help). After retries exhaust, the failure is still `null` (message
dropped from this scan, as today), but now also calls
`logRejection(..., 'fetch_failed', ...)` so it's visible in the audit trail
instead of vanishing untraceably. This makes the failure diagnosable and
recoverable via the existing Deep Rescan feature, matching the audit-trail
philosophy already established for content-based rejections.

### B2 — Isolate the batch insert against a single conflicting row

`emailScanner.ts:1428-1433` changes from one unconditional batch insert to:
attempt the batch insert; if `txnError` is a unique-constraint violation
(Postgres code `23505`) rather than some other failure, fall back to inserting
`transactionsToInsert` one row at a time, collecting successes and skipping
(not erroring on) rows that individually conflict — those are transactions
another concurrent scan already inserted, which is the constraint doing its
job, not a fault. Any other error type (non-`23505`) still throws immediately,
unchanged from today — this only adds fault isolation for the specific
already-inserted-elsewhere case, not blanket error swallowing.

## Testing

- `bankMarketingFromTrustedSender` fixture: `emailScanGates.test.ts` — gate
  composition rejects it once the trusted-sender exemption is gone.
  `emailScanner.test.ts` (integration) — zero transactions inserted, logged
  `bulk_mail_no_payment_evidence`.
- Regression: `axisEmiDebit`, `uberTripReceipt`, `zomatoOrderReceipt`,
  `unknownVendorReceipt` all still produce their existing transactions
  unchanged.
- B1: mock `fetch` to return `429` twice then `200` — message is fetched
  successfully (retry worked). Mock `fetch` to return `429` on every attempt —
  message dropped, `fetch_failed` rejection logged exactly once, scan
  otherwise completes normally for the remaining messages.
- B2: mock a batch insert that throws a `23505` conflict — assert the scan
  still returns the successfully-inserted rows (not zero), and does not throw
  to the caller. Mock a non-`23505` insert error (e.g. a genuine connection
  failure) — assert it still throws, unchanged from current behavior.

## Error handling

B1's exhausted-retry path and B2's per-row fallback both preserve the existing
convention: log via `logRejection` (already fire-and-forget, cannot throw)
before continuing, never silently vanish. B2 only special-cases the one error
code that represents "this row already exists" — every other database error
keeps today's fail-loud behavior, since swallowing unrelated errors would trade
one class of silent data loss for another.
