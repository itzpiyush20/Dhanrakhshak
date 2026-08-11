# Merchant Receipt Email Detection Fix (Uber, Zomato, etc.)

## Problem

The email-scan pipeline (`scanRealGmailInbox()` in `src/services/emailScanner.ts`)
never turns direct merchant receipt emails — e.g. Uber trip receipts, Zomato
"order delivered" emails — into transactions, even when a manual rescan is
triggered and the confirmation emails are confirmed present in Gmail. Reported
symptom: two payments (Uber, Zomato) made the day before were never picked up.

Traced to two independent, compounding gates that a merchant receipt email
(subject/body like "Your trip receipt" or "Your order has been delivered",
with no bank-style "debited"/"charged"/"payment successful" wording) cannot
survive:

1. **Hard-reject gate** — `order_placed_no_debit` in
   `src/services/emailScanGates.ts:61-65`. Any email matching
   "order confirmed/placed/received" or "your order has been..." is
   unconditionally rejected unless the body also contains explicit debit
   language. Merchant receipts almost never use bank debit phrasing — they
   show a total — so they are killed here before confidence scoring ever
   runs.
2. **Trusted-sender confidence penalty** —
   `TRUSTED_SENDER_DOMAINS` (`src/services/emailScanner.ts:39-105`) only lists
   banks/payment processors. `computeConfidence()`
   (`src/services/emailScanner.ts:627-643`) gives trusted senders +35 and
   penalizes non-trusted senders -15. A merchant-domain email (e.g.
   `uber.com`, `zomato.com`) that somehow survives gate 1 still can't
   realistically clear the 65-point acceptance threshold: max achievable score
   without the trusted bonus and without a hard-accept-subject match is ~45.

This is systemic, not a one-off: it silently drops **every** direct merchant
receipt (Uber, Zomato, Swiggy, and similar), not just the two flagged.

This design deliberately revisits the `TRUSTED_SENDER_DOMAINS` /
confidence-threshold non-goal called out in
[2026-08-05-email-scan-recall-fix-design.md](2026-08-05-email-scan-recall-fix-design.md)
— that design intentionally left tuning those to a separate pass; this is that
pass, scoped narrowly to merchant receipt domains.

## Goals

- Genuine merchant receipt emails (Uber, Zomato, and similarly-shaped direct
  merchant confirmations) are detected and turned into transactions on a
  normal or manual rescan.
- Promotional/coupon/offer emails from the same merchant domains are still
  rejected — this fix must not widen the door for spam.
- The fix is scoped to known merchant domains; it must not change acceptance
  behavior for existing bank/payment-processor emails.

## Non-goals

- No change to `TRUSTED_SENDER_DOMAINS` (bank list) or its +35 bonus.
- No change to the 65-point confidence threshold itself.
- No global loosening of the `order_placed_no_debit` gate's debit-confirmation
  regex for all senders — the exception is scoped to known merchant domains
  only (see rejected Option B below).
- No retroactive recovery of transactions missed before this fix ships; if
  older missed transactions need recovering, that's the existing Deep Rescan
  feature from the 2026-08-05 design, not new work here.

## Design

### 1. New merchant-domain trust tier

Add `TRUSTED_MERCHANT_DOMAINS` (`src/services/emailScanner.ts`, alongside
`TRUSTED_SENDER_DOMAINS`): a `Set<string>` seeded with direct-merchant
transactional senders — `uber.com`, `zomato.com`, `swiggy.in`, and similarly
well-known food/ride/e-commerce senders that send their own payment/order
receipts. Matched the same way as `TRUSTED_SENDER_DOMAINS` (exact domain or
subdomain suffix).

`ConfidenceSignals` gets a new field `trustedMerchant: boolean`.
`computeConfidence()` awards a smaller bonus than the bank tier — enough that
a merchant email with amount + merchant match + reference/order ID clears 65,
but not an auto-accept on its own. `trustedSender` (bank) and `trustedMerchant`
are mutually exclusive in practice (disjoint domain sets); only one bonus ever
applies per email.

### 2. Scoped gate exception in `emailScanGates.ts`

`evaluateRegexGates()` gains a new parameter, `isTrustedMerchant: boolean`
(computed by the caller the same way `isTrustedSender` already is, using the
new domain set). The `order_placed_no_debit` check
(`emailScanGates.ts:61-65`) is changed to also pass when:

- `isTrustedMerchant` is true, **and**
- an amount/total is present in the email content (reuse the existing amount
  regex already used for `hasAmount` extraction elsewhere in the file — no new
  amount-detection logic).

Order of checks is unchanged: `promotional_spam` (line 49-50) still runs
first and unconditionally, before this gate is reached, for every sender.

### 3. Guardrails against false positives

- **Promo gate is untouched and runs first.** A coupon/offer/cashback email
  from a trusted merchant domain is rejected by `promotional_spam` before the
  new merchant-trust branch is ever evaluated.
- **Amount-required.** The gate exception in section 2 only fires when an
  amount is present — a pure marketing email with no transaction total can't
  qualify even if it somehow slips past the promo gate.
- **Confidence bonus is capped below the bank tier**, so acceptance still
  depends on supporting signals (amount, merchant match, reference/order ID),
  not the domain alone.

### 4. Testing

- Unit tests in `src/services/emailScanGates.test.ts` (new or extended):
  a synthetic Uber-style "trip receipt" email with an amount and trusted
  merchant domain passes `evaluateRegexGates()`; the same email from an
  untrusted domain is still rejected; a Zomato-style promo/coupon email from a
  trusted merchant domain is still rejected by `promotional_spam`.
- Unit test for `computeConfidence()`: a merchant-trusted signal set (amount +
  merchant + reference id, no bank trust) scores ≥65; the same signals with
  neither trust tier score <65.
- Manual verification: re-run a Gmail scan against a real account and confirm
  a genuine Uber/Zomato receipt from the last 26h window is turned into a
  transaction, and a genuine promotional email from the same senders is not.

## Error handling

Purely additive change — new domain set, new confidence signal, new gate
branch gated on that signal. No existing code path changes behavior for
non-merchant-domain senders. If `TRUSTED_MERCHANT_DOMAINS` lookup fails for
any reason (it won't — it's a static in-memory `Set`), the signal defaults to
`false` and the email falls through to existing (unchanged) rejection
behavior — never a crash, only a potential miss, consistent with the
fail-safe pattern already used for `stripBoilerplate()` in the prior design.
