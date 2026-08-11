# Merchant Receipt Email Detection Fix (Uber, Zomato, etc.)

## Problem

The email-scan pipeline (`scanRealGmailInbox()` in `src/services/emailScanner.ts`)
never turns direct merchant receipt emails — Uber trip receipts, Zomato order
emails — into transactions, even on a manual rescan with the emails confirmed
present in Gmail. Reported symptom: payments from 2026-08-10 (3 Uber trips,
1 Zomato order) were never picked up.

**Evidence-based diagnosis** — the four real emails were traced through the
pipeline by running the scanner's exact Gmail query against the live inbox and
walking the full bodies through every gate:

1. **Fetch-query miss.** The Gmail fetch query (`EMAIL_KEYWORDS`,
   `emailScanner.ts:882`) requires a bank-style keyword (`paid`, `payment`,
   `debited`, `transaction`, ...) somewhere in the message. One of the three
   Uber trip receipts (₹167.54) contains none of them — verified by running
   the exact keyword query scoped to `from:uber.com from:zomato.com` for the
   date window: only 2 of 4 emails match. That email is **never fetched**; no
   downstream fix can help it.
2. **Unstripped merchant security footer → OTP gate kill.** The Zomato order
   email (₹286.47, contains "Total paid" so it *is* fetched) ends with:
   *"...your bank account details, password, PIN, CVV, OTP etc. For your own
   safety, DO NOT share these details with anyone..."*. The boilerplate
   stripper (`src/services/emailBoilerplate.ts:21-22`) only matches
   "do not share **your** ..." phrasing; Zomato says "share **these
   details**", so the footer survives and the `otp_or_security_code` gate
   (`src/services/emailScanGates.ts:58-59`) rejects the email on the word
   "OTP". Same bug class as the Axis footer collision fixed in
   [2026-08-05-email-scan-recall-fix-design.md](2026-08-05-email-scan-recall-fix-design.md);
   the stripper's pattern list just doesn't cover this phrasing yet.
3. **Untrusted-sender confidence ceiling.** The fetched Uber receipt
   (₹224.76) passes **every** regex gate (full-body trace: no promo, declined,
   pending, OTP, order-confirmation, due/statement, or policy match), but
   `uber.com` is not in `TRUSTED_SENDER_DOMAINS` (`emailScanner.ts:39-105`),
   so `computeConfidence()` (`emailScanner.ts:627-643`) denies the +35 trusted
   bonus and applies a -15 penalty. Realistic max score for such an email is
   ~45 — structurally below the 65 acceptance threshold.

Note: the `order_placed_no_debit` gate originally suspected was **not**
triggered by any of these real emails ("Thank you for ordering from" and
"Booking fee" don't match its regex). A scoped exception for it is retained as
a defensive measure for other merchants' wording, but it is not the primary
fix.

The AI path (`analyzeTransactionEmailWithAI`) runs before the regex path and
could in principle have accepted the two fetched emails; empirically it did
not (they are absent from the app). Whether that was an AI
`is_transaction:false` verdict or Gemini quota exhaustion forcing the regex
fallback is unknown (the `email_scan_rejections` table couldn't be queried —
service-role key unavailable locally). The fix therefore targets the regex
path, which per the 2026-08-05 design carries most scan volume anyway, and
adds the real emails as fixtures so both paths are pinned by tests.

This is systemic, not a one-off: it silently drops **every** direct merchant
receipt shaped like these.

This design deliberately revisits the `TRUSTED_SENDER_DOMAINS` /
confidence-threshold non-goal called out in the 2026-08-05 design — that
design intentionally left tuning those to a separate pass; this is that pass,
scoped narrowly to merchant receipt domains.

## Goals

- All three failure points above are fixed: merchant receipt emails are
  fetched, survive the gates, and clear confidence — on a normal or manual
  rescan.
- Promotional/coupon/offer emails from the same merchant domains are still
  rejected — this fix must not widen the door for spam.
- The fix is scoped to known merchant domains; no acceptance-behavior change
  for existing bank/payment-processor emails.
- The two real emails (Uber ₹224.76 receipt, Zomato ₹286.47 order) become
  test fixtures that pin this class of bug shut.

## Non-goals

- No change to `TRUSTED_SENDER_DOMAINS` (bank list) or its +35 bonus.
- No change to the 65-point confidence threshold itself.
- No global loosening of any gate regex for all senders — every exception is
  scoped to known merchant domains.
- No changes to the AI path or its prompt (`aiService.ts`) — if the AI is
  additionally misclassifying these emails, that's diagnosable later via
  `email_scan_rejections` (gate `ai_confident_reject`) and out of scope here.
- No retroactive recovery of already-missed transactions — that's the
  existing Deep Rescan feature from the 2026-08-05 design. After this fix
  ships, a Deep Rescan over the affected window is the recovery mechanism for
  the Aug 10 transactions themselves.

## Design

### 1. Fetch query: include trusted merchant domains

`TRUSTED_MERCHANT_DOMAINS` (new, see section 2) domains are OR-ed into the
Gmail query as `from:` clauses alongside the existing keyword query
(`emailScanner.ts:882-907`):

```
after:<since> ((<EMAIL_KEYWORDS>) OR from:uber.com OR from:zomato.com OR ...)
```

This guarantees every email from a known merchant domain in the scan window is
fetched regardless of body wording — fixing failure point 1 — while leaving
fetch behavior for all other senders exactly as today. Volume impact is
bounded: these senders email receipts plus occasional promos, and promos are
rejected by the existing gates after fetch.

### 2. New merchant-domain trust tier

Add `TRUSTED_MERCHANT_DOMAINS` (`src/services/emailScanner.ts`, alongside
`TRUSTED_SENDER_DOMAINS`): a `Set<string>` seeded with direct-merchant
transactional senders — `uber.com`, `zomato.com`, `swiggy.in`, and similarly
well-known food/ride/e-commerce senders that send their own payment/order
receipts. Matched the same way as `TRUSTED_SENDER_DOMAINS` (exact domain or
subdomain suffix). One definition, used by both the fetch query (section 1)
and confidence scoring.

`ConfidenceSignals` gets a new field `trustedMerchant: boolean`.
`computeConfidence()` awards a smaller bonus than the bank tier — enough that
a merchant email with amount + merchant match clears 65 (the real Uber
receipt has no extractable numeric reference ID, so the bonus must be sized
for amount + merchant + payment-mode signals, verified against the fixture),
but not an auto-accept on its own. The -15 untrusted penalty does not apply
when `trustedMerchant` is true. `trustedSender` (bank) and `trustedMerchant`
are disjoint domain sets; only one bonus ever applies per email. This fixes
failure point 3.

### 3. Boilerplate stripper: cover merchant security-footer phrasing

Append patterns to `BOILERPLATE_SENTENCE_PATTERNS` in
`src/services/emailBoilerplate.ts` (the list is explicitly designed to grow
this way, per the 2026-08-05 design — no gate-logic changes):

- "will never ask you for your personal information ..." (Zomato/Eternal
  phrasing; generic across merchants and banks)
- "do not share these details ..." (complement to the existing "do not share
  your ..." pattern)

Sentence-bounded, conservative, same style as the existing patterns. This
fixes failure point 2: with the footer stripped, the Zomato email no longer
contains "OTP"/"do not share" and passes the `otp_or_security_code` gate.
The gate itself is unchanged — a genuine OTP email is still rejected.

### 4. Scoped `order_placed_no_debit` exception (defensive)

`evaluateRegexGates()` gains an `isTrustedMerchant: boolean` parameter
(computed by the caller the same way `isTrustedSender` already is). The
`order_placed_no_debit` check (`emailScanGates.ts:61-65`) also passes when
`isTrustedMerchant` is true **and** an amount/total is present in the email
content. Not triggered by the current fixtures, but other merchants' receipt
wording ("Your order is confirmed") would hit it; this closes that off while
staying scoped. Gate order is unchanged — `promotional_spam` still runs first
and unconditionally for every sender.

### 5. Guardrails against false positives

- **Promo gate untouched, runs first.** A coupon/offer/cashback email from a
  trusted merchant domain — now guaranteed to be fetched by section 1 — is
  rejected by `promotional_spam` before any merchant-trust logic is reached.
- **Amount-required.** The section 4 gate exception only fires when an amount
  is present; a marketing email with no transaction total can't qualify.
- **Confidence bonus capped below the bank tier**, so acceptance still
  depends on supporting signals (amount, merchant match, payment mode), not
  the domain alone.
- **Stripper patterns are sentence-bounded** — they remove footer sentences
  only, never bare keywords, so genuine OTP emails are still caught by the
  unchanged OTP gate.

## Testing

Fixtures: sanitized bodies of the two real emails (Uber ₹224.76 trip receipt,
Zomato ₹286.47 order email) checked into the test suite.

- `src/services/emailBoilerplate.test.ts` (extend): the Zomato fixture's
  security footer is stripped; the transaction line ("Total paid - ₹286.47")
  survives; a genuine OTP email body ("Your OTP is 482913") is NOT stripped.
- `src/services/emailScanGates.test.ts` (extend):
  - Zomato fixture (post-strip) passes all gates.
  - Uber fixture passes all gates.
  - A synthetic Zomato promo/coupon email is still rejected by
    `promotional_spam` even with `isTrustedMerchant: true`.
  - A synthetic "your order is confirmed" merchant email with an amount
    passes only when `isTrustedMerchant` is true; same email from an
    untrusted domain is still rejected.
- `computeConfidence()` unit tests: the Uber fixture's signal set
  (trustedMerchant + amount + merchant + payment mode, no reference ID)
  scores ≥65; identical signals with `trustedMerchant: false` score <65; bank
  `trustedSender` scoring is unchanged by the new field.
- Gmail-query construction test: the built query string contains both the
  keyword group and the `from:` clauses for every `TRUSTED_MERCHANT_DOMAINS`
  entry.
- Manual verification: Deep Rescan over the Aug 10 window recovers all four
  transactions; a genuine promotional email from the same senders is not
  inserted.

## Error handling

Purely additive — new domain set, new confidence signal, new gate branch, new
stripper patterns, widened fetch query. No existing code path changes behavior
for non-merchant-domain senders. Failure of any new piece degrades to today's
behavior (a miss, never a crash), consistent with the fail-safe pattern
established for `stripBoilerplate()` in the prior design.
