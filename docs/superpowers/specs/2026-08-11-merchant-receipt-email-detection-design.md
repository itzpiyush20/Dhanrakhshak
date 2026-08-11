# Universal Vendor-Agnostic Email Transaction Detection

## Problem

The email-scan pipeline (`scanRealGmailInbox()` in `src/services/emailScanner.ts`)
never turns direct merchant receipt emails — Uber trip receipts, Zomato order
emails, and (by the same mechanism) any other vendor's receipt — into
transactions, even on a manual rescan with the emails confirmed present in
Gmail. Reported symptom: 4 payments from 2026-08-10 (3 Uber trips, 1 Zomato
order) were never picked up.

**Evidence-based diagnosis** — the four real emails were traced through the
live pipeline (exact Gmail query run against the real inbox, full bodies
walked through every gate):

1. **Fetch-query miss.** `EMAIL_KEYWORDS` (`emailScanner.ts:882`) requires a
   bank-style keyword (`paid`, `payment`, `debited`, `transaction`, ...)
   somewhere in the message. One Uber trip receipt (₹167.54) contains none of
   them — verified by running the exact keyword query scoped to
   `from:uber.com from:zomato.com` for the date window: only 2 of 4 emails
   match. That email is **never fetched**.
2. **Unstripped merchant security footer → OTP gate kill.** The Zomato order
   email (₹286.47, fetched because "Total paid" matches a keyword) ends with
   *"...password, PIN, CVV, OTP etc. ... DO NOT share these details..."*. The
   stripper (`emailBoilerplate.ts:21-22`) only matches "do not share **your**
   ..."; Zomato says "share **these details**", so the footer survives and
   `otp_or_security_code` (`emailScanGates.ts:58-59`) rejects the email on
   the word "OTP".
3. **Untrusted-sender confidence ceiling (regex path only).** The fetched
   Uber receipt (₹224.76) passes every regex gate but scores ~45 in
   `computeConfidence()` (`emailScanner.ts:627-643`) — below the 65
   threshold — because `uber.com` isn't in `TRUSTED_SENDER_DOMAINS`.
4. **Debit/credit classifier drop, unlogged.** `emailScanner.ts:1183-1191`
   scores the text around the amount against `debitWords`/`creditWords`; if
   neither matches, the loop `continue`s with **no `logRejection` call** —
   the only rejection point in the file that doesn't log. The Uber receipt
   ("Total", "Booking fee", "Suggested fare", "Payments") uses neither word
   list.

Points 3 and 4 only apply to the **regex fallback path**. The **AI path**
(`analyzeTransactionEmailWithAI`, tried first at `emailScanner.ts:1042`) has
no confidence threshold at all — it inserts whenever
`is_transaction && amount > 0`, gated only by (a) a duplicate reference ID or
(b) the AI explicitly returning `is_transaction: false`
(`aiConfidentReject`). The regex path only runs when the AI errors, times
out, or returns no usable result — which today is most of the time, because
Gemini is capped at a **shared 50 calls/day** with a separate, unrelated
feature (`generateAIInsights`), so a single multi-email scan exhausts it
immediately and pushes nearly everything onto the fragile regex path.

**Why hardcoded vendor lists (domains or names) are the wrong fix.** An
earlier version of this design proposed a `TRUSTED_MERCHANT_DOMAINS` allowlist,
then a `KNOWN_MERCHANTS`-name-based variant. Both only generalize to vendors
someone thought to add to a list — for a public app, that's every vendor
*except* the long tail that actually causes this bug (a local restaurant's
own ordering system, a regional cab app, a niche subscription service). The
fix instead needs to work for a vendor the app has never seen.

## Goals

- Any vendor's receipt-shaped email — known or never-seen-before, for any
  user — is fetched, survives the gates, and produces a transaction. No
  hardcoded per-vendor list is load-bearing for detection.
- **Nothing is silently dropped.** Every current silent-continue becomes
  either a logged rejection (for content that's clearly not a transaction:
  promo, OTP, declined, no amount at all) or a **pending transaction** the
  user reviews (for content that's receipt-shaped but the pipeline can't
  fully resolve — direction unclear, low confidence, vendor unrecognized).
  A wrong pending guess costs the user one dismiss-tap; a silent drop costs a
  permanently missing transaction.
- **No rule is ever auto-applied without explicit user confirmation.** This
  is an existing, tested invariant (`applyMerchantRulesFromDB` never returns
  `approval_status: 'approved'` — `learningEngine.ts:179-180`; a merchant
  rule is only written from `saveMerchantRuleToDb`, called only from
  `PendingPage.tsx` / `SettingsPage.tsx` user actions). This design adds
  volume to the pending queue but must not touch that invariant or those two
  call sites.
- AI classification is used as the primary parser (the app is paid; AI cost
  per call is accepted), with its own quota separate from the unrelated
  AI-insights feature so the two don't starve each other.
- The two real emails (Uber ₹224.76, Zomato ₹286.47) become regression
  fixtures, plus a synthetic "unknown vendor, receipt-shaped" fixture proving
  the fix isn't specific to these two senders.

## Non-goals

- No hardcoded per-vendor domain or name list added as a *detection*
  mechanism. (`KNOWN_MERCHANTS` continues to exist for category/description
  hints once a merchant name is already extracted — that's unchanged and
  out of scope.)
- No change to `TRUSTED_SENDER_DOMAINS` (bank list) or its scoring — banks
  keep their existing high-trust path unchanged.
- No relaxation of the "never auto-approve" invariant, under any confidence
  score.
- No retroactive recovery of the Aug 10 transactions — that's the existing
  Deep Rescan feature (2026-08-05 design); run it after this fix ships.
- No change to how `generateAIInsights` is invoked or throttled beyond
  splitting its quota counter from the new scan counter (see Design §4).

## Design

### 1. Fetch query: widen from bank-alert keywords to receipt-shaped keywords

`EMAIL_KEYWORDS` (`emailScanner.ts:882`) gains a second keyword group,
OR-ed with the existing one, covering generic receipt/order language that
isn't bank-specific:

```
(<existing bank keywords>) OR (receipt OR invoice OR order OR booking OR trip OR fare OR ride OR subscription OR renewal OR total)
```

This is still a real filter — it excludes non-transactional mail — but no
longer assumes bank-alert phrasing. It's vendor-agnostic by construction:
any receipt using ordinary receipt language is caught, not just vendors on a
list.

### 2. Boilerplate stripper: generalize the "do not share" pattern

`BOILERPLATE_SENTENCE_PATTERNS` (`emailBoilerplate.ts:21-22`) currently
requires "do not share **your**...". Broaden to also match "do not share
**these**/**this**/**such**...", covering the Zomato phrasing
("do not share **these details**") without a vendor-specific pattern —
this is a wording generalization, not a per-vendor rule, so it helps any
vendor using similar phrasing.

### 3. Regex-path confidence floor: pending instead of dropped

In the regex fallback path, when `computeConfidence()` scores below 65
(`emailScanner.ts:1294`), the email currently `continue`s. Change: if an
amount was successfully extracted and the email survived every gate, insert
it as a transaction with `approval_status: 'pending'` and the low
`confidence_score` preserved, instead of dropping it. The existing
`logRejection(..., 'confidence_below_65', ...)` call is kept (so the
rejection is still visible in the audit trail) but no longer gates the
insert — it becomes an annotation on a pending row, not a cause for
discarding it.

### 4. Regex-path debit/credit classifier: pending instead of dropped, and now logged

At `emailScanner.ts:1183-1191`, when neither `debitWords` nor `creditWords`
scores anything: instead of the unlogged `continue`, call
`logRejection(..., 'no_debit_credit_signal', ...)` (closing the one gap in
the file where nothing is logged) and then, if an amount was found, insert as
pending with `type: 'debit'` (the statistically overwhelming case for a
personal-finance inbox — incoming credits almost always use explicit
"credited"/"received" language) and `debitCreditClear: false`. The user
corrects direction on the Pending page if wrong; this is a guess surfaced for
confirmation, not an auto-applied fact.

### 5. AI path becomes primary in practice: separate, larger quota

Add a new counter to `profiles` — `ai_scan_calls_count` /
`ai_scan_calls_reset_at` — distinct from the existing
`ai_calls_count`/`ai_calls_reset_at` (which `generateAIInsights` keeps using
unchanged). `api/gemini-proxy.ts` accepts a `purpose` field in the request
body (`'scan'` or `'insights'`, defaulting to `'insights'` for backward
compatibility with existing callers) and checks/increments the counter
matching that purpose, with its own daily limit — `DAILY_AI_SCAN_CALL_LIMIT`,
set high enough for realistic scan volume (default 500/day, configurable via
env var, since cost is accepted per the paid-app model). `askAI` calls from
`emailScanner.ts` pass `purpose: 'scan'`; existing `generateAIInsights` calls
pass `purpose: 'insights'` (or omit it, using the default). This means a
large scan no longer exhausts the quota the insights feature depends on, and
vice versa.

With quota no longer the bottleneck, nearly every fetched email reaches the
AI classifier first, which reads arbitrary vendor formats without needing a
vendor list — this is what makes detection vendor-agnostic in practice, not
just in the regex fallback's pending-floor.

### 6. AI path: unresolved (not confidently-rejected) results also go pending

Today, if the AI returns a result but `is_transaction` is falsy/missing
amount and it's *not* a confident `false`, the code falls through to the
regex path (`emailScanner.ts:1083-1091`). That fallthrough is kept — the
regex path is still a reasonable second opinion — but if the regex path
*also* can't resolve it (per §3/§4, now landing pending rather than
dropped), the net result is still "pending," never "dropped." No change
needed here beyond what §3/§4 already provide; documented for completeness
so the full AI→regex→pending chain is traceable in one place.

### 7. Guardrails against false positives

- **Promo/OTP/declined/due-reminder gates are unchanged and still run before
  any pending-insert logic** — a coupon or OTP email is still hard-rejected,
  never inserted pending. §1's widened fetch query doesn't bypass these
  gates; it only affects what gets fetched, not what gets accepted.
- **Amount-required for every pending-insert path** — §3 and §4 only fire
  when an amount was already extracted; content with no discernible amount
  is still rejected outright (logged, not inserted).
- **Never auto-approved** — every pending insert from §3/§4/§6 goes through
  `applyMerchantRulesFromDB`, which is architecturally incapable of returning
  `approved` (existing invariant, untouched). A user must act for a rule to
  be learned.
- **AI confident-reject is still trusted** — `is_transaction: false` from the
  AI still hard-rejects (unchanged); this design only removes silent drops
  for genuinely ambiguous/unresolved cases, not for content the AI
  positively identifies as non-transactional.

## Testing

Fixtures: sanitized bodies of the two real emails (Uber ₹224.76 trip
receipt, Zomato ₹286.47 order email), plus a new synthetic fixture for an
**unrecognized vendor** ("Ramesh's Tiffin Service" — a made-up small
merchant, receipt-shaped body with an amount, no keyword match, not in any
existing list) proving the fix generalizes beyond the two reported senders.

- `src/services/emailBoilerplate.test.ts` (extend): Zomato fixture's footer
  stripped by the generalized "these/this/such details" pattern; transaction
  line survives; genuine OTP email still not stripped.
- `src/services/emailScanGates.test.ts` (extend): both real fixtures and the
  synthetic unknown-vendor fixture pass all gates; promo/OTP/declined
  synthetics still rejected, unchanged.
- `src/services/emailScanner.test.ts` (extend, following the existing Axis
  EMI integration-test pattern with a mocked Gmail response):
  - Uber fixture, AI mocked to fail (`askAI: async () => null`) → regex path
    → inserted as **pending** (not dropped), `approval_status: 'pending'`.
  - Unknown-vendor synthetic fixture, AI mocked to fail → same: inserted
    pending, `type: 'debit'`, `debitCreditClear: false`.
  - Synthetic promo email from a "trusted-sounding" domain → still not
    inserted, still logged via `promotional_spam`.
  - Assert `email_scan_rejections` receives a `no_debit_credit_signal` row
    for the unknown-vendor case (proving the previously-unlogged gap is now
    logged) even though the email is *also* inserted pending — logging and
    inserting aren't mutually exclusive here.
  - Gmail-query construction test: built query string contains both keyword
    groups from §1.
- `api/gemini-proxy.test.ts` (new, if no existing API test harness — check
  for one first): a request with `purpose: 'scan'` increments
  `ai_scan_calls_count` and is independent of `ai_calls_count`; a request
  with `purpose: 'insights'` (or omitted) increments the original counter
  only. Hitting the scan limit doesn't block an insights call and vice versa.
- Manual verification: Deep Rescan over the Aug 10 window recovers all four
  transactions (as pending, reviewable); a genuine promotional email from
  Uber/Zomato is still not inserted.

## Error handling

All new insert paths (§3, §4, §6) are additive fallbacks that only trigger
after every existing rejection gate has already been checked and passed —
they narrow "silently dropped" to "pending, annotated with why confidence
was low," never widen what counts as accepted. The quota split (§5) is
purely additive (new columns, new optional request field defaulting to
today's behavior) — an old client omitting `purpose` behaves exactly as
today. If the `ai_scan_calls_count` update fails for any reason, the request
fails closed (same behavior as the existing quota-check failure path in
`gemini-proxy.ts:70-72`) rather than allowing unlimited scan calls.
