# Newsletter False-Positive Transaction Detection — design

## Problem

Marketing/newsletter emails are being turned into transactions. Confirmed against
the real inbox: Gmail thread `19feaf8841f4a9ee`, subject *"Blueprint Magazine-
August issue is Live"*, from `bsemailservices@business-standard.net.in`
(2026-08-10) — a magazine subscription advertisement whose body contains a
pricing table:

```
save 41%   ₹6,000 (struck through)   Blueprint Digital   ₹3,500   annual   ₹291/Month
save 62%   ₹12,000 (struck through)  Blueprint Complete  ₹4,500   annual   ₹375/Month
[Subscribe Now]
```

It became a ₹6,000 transaction. Two more phantom rows were reported alongside it
("The Economic Times" ₹95.3, "Ola" ₹3,067 described as *"Ola Cab Ride"*).

### Root cause — four defects, traced through the code

The phantom rows came from the **regex fallback path**, not the AI path. Proof:
`"Ola Cab Ride"` is a hardcoded string in the regex path's `KNOWN_MERCHANTS`
table (`emailScanner.ts:363`); the AI is instructed to write descriptions from
the email's actual content and would not emit that canned string.
`"Business Standard Transaction"` is the `` `${merchant} Transaction` ``
fallback template.

1. **Merchant matching scans the entire email, unanchored.**
   `extractMerchantFromSnippet(fullText)` (`emailScanner.ts:1248`) is a bare
   `pattern.test()` over the whole message. A business-news article mentioning
   Ola Electric anywhere — tens of KB into a newsletter — matches `/\bola\b/i`
   and stamps the email as merchant "Ola", category Transport, description
   "Ola Cab Ride". This is a general bug affecting any user receiving any long
   email that mentions any brand in `KNOWN_MERCHANTS`.

2. **Amounts are harvested from editorial prose.** Amount extraction
   (`emailScanner.ts:1128-1139`) collects every ₹ figure in the first 2000
   characters. It filters figures adjacent to balance/limit/reward wording, but
   nothing distinguishes a price in an advertisement, or a share price in an
   article, from a transaction amount. ₹6,000 was a struck-through list price;
   ₹95.3 is consistent with a quoted stock price.

3. **Both guards that would have caught this were removed on 2026-08-11.** Under
   the "universal vendor detection" change, *no debit/credit signal* stopped
   being a silent drop and became a pending insert defaulting to
   `type: 'debit'` (`emailScanner.ts:1228-1233`), and *confidence below 65*
   likewise became a pending insert (`emailScanner.ts:1342-1348`). Both were
   sound **given that change's assumption** that everything reaching those
   points was receipt-shaped. Defect 4 broke that assumption and nothing
   re-established a floor.

4. **Every rejection gate runs after the AI call, and only if the AI declined.**
   `askAI()` is invoked on every fetched email at `emailScanner.ts:1052`, before
   any gate. `HARD_REJECT_SUBJECT_PATTERNS` (`:1114`) and `evaluateRegexGates()`
   (`:1122`) sit inside `if (!parsedTxn)` (`:1113`) — so if the AI claims an
   email is a transaction, not one of the promo / OTP / declined / due-reminder
   gates ever executes. Two consequences, both affecting every user: an AI
   false-positive is completely unguarded, and junk mail consumes the daily AI
   scan quota. The second is self-reinforcing — a newsletter-heavy inbox
   exhausts the quota on marketing mail, forcing genuine receipts onto the
   fragile regex path. Users with the noisiest inboxes get the worst detection.

The widened fetch query from the same 2026-08-11 change
(`emailScanner.ts:887-889`, adding `total`, `order`, `ride`, `fare`, `trip`,
`subscription`, `renewal`) is what admits newsletters in the first place — those
words appear in ordinary business-news prose.

## Goals

- Marketing and newsletter mail does not produce transactions, for any user and
  any publisher — using structural signals, never a per-sender list.
- Genuine vendor receipts from unknown senders keep working. The three existing
  fixtures (`uberTripReceipt`, `zomatoOrderReceipt`, `unknownVendorReceipt`)
  must continue to produce transactions, unchanged.
- Junk mail stops consuming the AI scan quota, so the AI path stays available
  for real receipts.
- Every rejection is logged to `email_scan_rejections`, keeping false negatives
  diagnosable and recoverable via the existing Deep Rescan feature.

## Non-goals

- **No per-vendor sender blocklist.** Blocking `business-standard.net.in` fixes
  one inbox; the 2026-08-11 design rejected allowlists for the same reason and
  that reasoning holds symmetrically for blocklists.
- **No change to the fetch query.** Narrowing it would re-break the
  vendor-agnostic detection it was widened to enable. The fix belongs in
  classification, not fetching.
- **No change to `TRUSTED_SENDER_DOMAINS`** or bank scoring.
- **No relaxation of "never auto-approve."** Every insert still lands
  `approval_status: 'pending'`.
- **Existing gates are not moved before the AI call.** Only the new bulk gate is
  (see §1). Relocating `evaluateRegexGates` would change behavior for every
  email the AI currently claims and could re-break the 2026-08-11 work; that is
  a separate change with a much larger blast radius.
- **No retroactive cleanup** of the phantom rows already inserted — handled
  separately after this ships.

## Design

Three layers. Layers 1 and 2 address the root cause; layer 3 is defense in
depth for the AI path.

### Layer 1 — Bulk-marketing gate, before the AI call

Two pure helpers in `src/services/emailScanGates.ts` (which exists precisely for
independently testable gates):

```ts
/** True when the message carries bulk/marketing distribution markers. */
export function isBulkMarketingEmail(
  headers: Array<{ name?: string; value?: string }>,
  bodyText: string
): boolean

/** True when the text asserts that money actually moved. */
export function hasPaymentAssertion(text: string): boolean
```

`isBulkMarketingEmail` returns true when a `List-Unsubscribe` (or
`List-Unsubscribe-Post`) header is present, **or** the body contains opt-out
phrasing (`unsubscribe`, `opt out of this newsletter`, `manage your
preferences`, `you are receiving this email because`, `view in browser`). The
header check is the primary signal: Gmail's and Yahoo's bulk-sender
requirements mandate `List-Unsubscribe` for high-volume senders, while
transactional receipts are exempt and typically omit it. This is an
internet-wide structural property, identical for any publisher in any market —
which is what makes the fix general rather than inbox-specific. Unlike the
existing gates, the body check reads the **full** body, not the 2000-character
truncation, because opt-out text lives in footers.

`hasPaymentAssertion` tests for vocabulary asserting completed money movement:
`debited`, `credited`, `paid`, `charged`, `spent`, `withdrawn`, `transferred`,
`deducted`, `billed`, `total`, `subtotal`, `amount paid`, `payment of`, `fare`,
`txn`, `transaction id`. Including `total` is load-bearing and verified:
`unknownVendorReceipt` contains **only** `Total` out of this entire vocabulary,
so a stricter list would silently break unknown-vendor detection — the exact
capability the 2026-08-11 change was built to add.

A new gate is evaluated immediately after `emailContentForParsing` is computed
(`emailScanner.ts:1045`) and **before** the AI block at `:1050`:

```
reject when:  !isTrustedSender
         AND  isBulkMarketingEmail(headers, bodyText)
         AND  !hasPaymentAssertion(emailContentForParsing)
```

On rejection: `logRejection(..., 'bulk_mail_no_payment_evidence', ...)` then
`continue` — no AI call, no insert.

All three conditions are required. Trusted bank senders bypass it entirely
(condition 1). Genuine receipts bypass it because they carry no bulk markers
(condition 2) — verified against all three fixtures, none of which contain
unsubscribe or opt-out text. A newsletter that happens to discuss payments in an
article bypasses it (condition 3) and is caught instead by layer 2.

### Layer 2 — Anchor the regex path to the amount

**2a. Amount-proximity form of the same gate.** After the amount is resolved and
`windowContent` (±120 chars around it) is computed
(`emailScanner.ts:1177-1179`), apply the identical composition using
`windowContent` as the text:

```
reject when:  !isTrustedSender
         AND  isBulkMarketingEmail(headers, bodyText)
         AND  !hasPaymentAssertion(windowContent)
```

Logged as `bulk_mail_no_payment_near_amount`. This catches the case layer 1
deliberately lets through: a newsletter containing payment vocabulary somewhere
in an article, whose *amount* is nonetheless editorial. Same helpers, different
text window — no duplicated logic.

**2b. Merchant matching is anchored.** `emailScanner.ts:1248` changes from:

```ts
const knownMerchant = extractMerchantFromSnippet(fullText)
```

to search only the subject line and the text surrounding the amount:

```ts
const knownMerchant = extractMerchantFromSnippet(`${subject} ${windowContent}`)
```

A real merchant appears next to its amount ("Rs.250 debited at OLA CABS") or in
the subject ("Your trip with Uber"). A brand mentioned in an article body 40 KB
away is not the merchant. This applies to trusted and untrusted senders alike —
it is a correctness fix independent of the newsletter problem, and it is what
makes a phantom "Ola" row impossible rather than merely unlikely.

`extractDynamicMerchant` is unchanged: its patterns are already anchored to
payment phrasing (`paid ₹X to Y`, `debited at Y`).

### Layer 3 — Defense in depth on the AI path

Neither layer 1 nor 2 guards a non-bulk email that the AI wrongly claims. Two
narrow additions:

**3a. Prompt rule.** Add to the STRICT RULES reject list in
`analyzeTransactionEmailWithAI` (`aiService.ts:383-397`):

> Subscription or product marketing showing pricing tiers, percentage
> discounts ("save 41%"), struck-through "was" prices, or
> "Subscribe Now"/"Upgrade Now"/"Choose your plan" calls to action — an
> advertisement for a purchase the reader has NOT made is not a receipt.

**3b. Honor the model's own confidence.** The prompt already instructs the model
to return `confidence_score` 0-59 for "uncertain cases (these will be reviewed
or rejected)" (`aiService.ts:418`), but the accept branch
(`emailScanner.ts:1054`) gates only on `is_transaction && amount > 0` and never
reads the score. Add: when `confidence_score < 60`, still insert (never silently
drop) but force `approval_status: 'pending'` explicitly at this call site rather
than relying on `applyMerchantRulesFromDB`'s invariant, and log
`ai_low_confidence` for the audit trail. This makes the code honor the contract
the prompt already states.

## Testing

Two-sided harness — new fixtures must be rejected, existing fixtures must keep
passing. The second half is what makes the vocabulary in `hasPaymentAssertion`
safely tunable.

**New fixtures** in `src/services/__fixtures__/`:
- `businessStandardNewsletter.ts` — the real Blueprint email body (thread
  `19feaf8841f4a9ee`), sanitized, retaining the pricing table and footer.
- `bulkMailWithPaymentProse.ts` — synthetic: newsletter markers, an editorial
  amount, and the word "paid" in article prose far from that amount. Proves
  layer 2a catches what layer 1 permits.

**`emailScanGates.test.ts`** (extend):
- `isBulkMarketingEmail` true for a `List-Unsubscribe` header; true for body
  opt-out phrasing with no header; false for all three receipt fixtures.
- `hasPaymentAssertion` true for each receipt fixture — explicitly asserting
  `unknownVendorReceipt` passes on `Total` alone; false for the Blueprint body.
- The composed gate: rejects Blueprint, permits all three receipt fixtures,
  permits any trusted-sender email regardless of the other two conditions.

**`emailScanner.test.ts`** (extend, following the existing mocked-Gmail
integration pattern):
- Blueprint fixture → zero transactions inserted; a
  `bulk_mail_no_payment_evidence` rejection logged; **`askAI` never called**
  (asserted via a spy — this is the quota-preservation guarantee).
- `bulkMailWithPaymentProse` fixture → zero transactions; a
  `bulk_mail_no_payment_near_amount` rejection logged.
- Regression: `uberTripReceipt`, `zomatoOrderReceipt`, `unknownVendorReceipt`,
  and `axisEmiDebit` each still produce exactly one pending transaction with
  unchanged amount, merchant, and type.
- Merchant anchoring: an email whose body mentions "Ola" only in prose far from
  the amount does not yield merchant "Ola".

**`aiService.test.ts`** (extend): the built prompt contains the new
marketing-rejection rule.

## Error handling

Every new path is a rejection that logs before `continue`, matching the existing
gate convention. `logRejection` is already fire-and-forget and cannot throw
(`emailScanGates.ts:89-111`), so a logging failure cannot break a scan. Both new
helpers are pure and total: `isBulkMarketingEmail` treats missing headers or an
empty body as "not bulk" (fail-open, preserving current behavior), and
`hasPaymentAssertion` treats empty text as "no assertion". Fail-open on the
header check is deliberate — a malformed message degrades to today's behavior
rather than silently dropping mail.
