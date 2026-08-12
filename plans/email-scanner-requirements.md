# Email Scanner — Product Requirements (owner-specified)

> **Status: canonical.** These are the owner's stated requirements for the Gmail
> scanner, captured 2026-08-12. Where a requirement conflicts with current code, the
> requirement wins and the delta is spelled out below with file:line anchors.
> Companion document: `plans/email-scanner-performance-plan.md` (how to make the
> scanner fast enough to satisfy these). Read both before touching scanner code.

---

## 1. Requirements as stated

| # | Area | Requirement |
|---|---|---|
| R1 | Detection posture | Balanced confidence, but **zero tolerance** for marketing emails, OTPs, and coupon-code/promo images being detected as transactions |
| R2 | Scope | **Everything financial**: bank/card/UPI alerts, vendor receipts, bills, subscription renewals, insurance premiums, salary credits, SIP/investment debits, refunds |
| R3 | Scan window | **Strict rolling 7 days**, always — first scan and every scan thereafter. Never reach further back, even after an outage |
| R4 | Reprocessing | **Never** reconsider an email already considered in an earlier scan |
| R5 | Cadence | Automatic scan runs **once every day** |
| R6 | Free tier | 1 manual scan per day, **no** automatic scan |
| R7 | Premium / trial | Daily automatic scan **plus 2 manual scans per day** |
| R8 | Owner | Daily automatic scan **plus unlimited** manual scans |
| R9 | Approval | **Nothing auto-approves.** Every detected transaction waits in Pending for explicit approval |
| R10 | Duplicates | Bank alert + merchant receipt for the same payment **smart-merge into one** transaction |
| R11 | Currency | Non-INR transactions **captured properly** with their real currency |
| R12 | Attachments | Amount only in a PDF/image → **skip**. No OCR, no manual-entry queue |
| R13 | False-positive regression | Known marketing/OTP/coupon offenders get **locked down with tests** so widening scope to R2 cannot reintroduce them |

---

## 2. Deltas against the current implementation

### D1 — Scan window becomes strict 7 days (R3, R4)

**Today** (`emailScanner.ts:891-914`): first scan is 7 days; every later scan uses
`min(lastSuccessfulScan − 2h, now − 26h)`, floored at `now − 30 days`.

**Required:** every scan, first or not, uses exactly `now − 7 days`. `MAX_LOOKBACK_MS`
collapses to 7 days and the last-scan anchoring logic is deleted. R4 is already
satisfied structurally and needs no new mechanism: `existingMessageIds`
(`emailScanner.ts:1010-1012`) skips any email whose `email_message_id` is already on a
transaction, and `UNIQUE (email_message_id, user_id)` (`schema.sql:491-495`) enforces it
at the database. Overlapping windows are therefore free — re-fetching an already-processed
email costs one cheap set lookup and never a duplicate row or an AI call.

**Accepted risk (owner chose "strict 7 days always" when shown this):** any interruption
longer than 7 days — cron outage, expired or revoked Gmail token, subscription lapse —
makes the transactions in that gap **permanently unreachable**, because the Gmail query
itself will never fetch them again and dedup cannot recover mail that was never fetched.

**This risk is sharpest for free users.** R6 gives them no automatic scan, so a free user
who opens the app every 10 days permanently loses ~3 days of transactions on every cycle,
silently. Flag this to the owner again before shipping; the mitigation (stretch the window
to cover a detected gap, capped at 30 days) is a ~5-line change if they reconsider.

### D2 — Tiered scan quotas (R5, R6, R7, R8)

**Today** (`emailScanner.ts:812-832`): owner **and** premium bypass the cooldown entirely
(effectively unlimited manual scans); everyone else is blocked if a successful scan
happened in the last 24 hours. The daily cron (`api/auto-sync-gmail.ts:50-58`) runs only
for owner / active / trial.

**Required:**

| Tier | Daily auto-scan | Manual scans |
|---|---|---|
| Free | No | 1 per day |
| Premium / trial | Yes | 2 per day |
| Owner | Yes | Unlimited |

Note this **tightens premium** from unlimited to 2 per day. Trial is treated as premium
throughout (it already is, in `isEligible`).

**Implementation — the schema is already ready.** `email_scan_logs.scan_mode TEXT CHECK
(scan_mode IN ('manual','scheduled'))` exists at `schema.sql:186` but **is never
populated** by any insert path (`emailScanner.ts:1436-1443`, `1487-1495`, `1524-1531`;
`auto-sync-gmail.ts:155-161`, `176-182`, `191-197`). Populate it:

- Add `scanMode?: 'manual' | 'scheduled'` to `ScanGmailOptions` (`emailScanner.ts:711-723`),
  defaulting to `'manual'`; the cron passes `'scheduled'`. Write it on every scan-log insert.
- Replace the cooldown check with a quota check counting **only**
  `scan_mode = 'manual' AND status = 'success'` rows in the trailing 24 hours, so the
  daily automatic scan never consumes a user's manual allowance (R7 says "in addition to").
- Limits: owner `Infinity`, premium/trial `2`, free `1`. Keep the existing user-facing
  error shape so the cooldown banner and countdown on PendingPage keep working, but the
  copy should now say how many manual scans remain today rather than implying one.

### D3 — Widen fetch to "everything financial" (R2)

The Gmail query (`emailScanner.ts:887-889`) is the hard ceiling on coverage: an email
matching none of its keywords is **never fetched**, so no gate, AI, or dedup improvement
can recover it. Extend `RECEIPT_KEYWORDS` with the R2 vocabulary — premium, policy,
renewal, EMI, SIP, mutual fund, dividend, interest, salary, credited, refund, autopay,
mandate, e-mandate, NACH.

Widening the *fetch* is low-risk because every gate still runs downstream; widening what
the *AI accepts* is the risky half, and R1/R13 constrain it. Keep the prompt's existing
rejection of statements, summaries and account overviews — those are not transactions
even under R2.

### D4 — Zero-tolerance false positives (R1, R13)

Owner reports this "happened before, seems better" — so it is a **regression-prevention**
requirement, not a live bug hunt. Before widening anything under D3, add a fixture-based
test suite (extend `emailScanGates.test.ts` and `aiService.test.ts`) covering: promotional
and sale emails, OTP and verification codes, coupon-code emails whose body is essentially
one image with little text, cashback *offers* as distinct from cashback *credits*, and
pre-approved loan and credit-limit offers. These must assert rejection both before and
after the D3 widening. The `List-Unsubscribe` bulk-mail gate
(`emailScanGates.ts:103-114`) is the primary defence for image-only promos, since they
carry almost no parseable text.

### D5 — Smart-merge duplicate payments (R10)

New capability; nothing like it exists. Dedup today is exact-match only, on
`email_message_id` and `reference_id` (`emailScanner.ts:1010-1015`, `1089`), which cannot
associate a bank alert with a merchant receipt for the same payment — different message
ids, and the receipt usually has no UPI reference.

Required behaviour: treat two transactions as the same payment when the amount matches
exactly, the dates are within ±1 day (bank and merchant frequently differ by a day), and
the merchants correspond — use `normalizeMerchant` / `getMerchantKey`
(`src/services/merchantNormalizer.ts`) rather than raw string comparison. Merge into one
row, preferring the **richer** source: the record carrying a `reference_id`, payment mode,
card issuer, and higher `confidence_score`. Must run in both directions — against
transactions already stored, and between two emails inside the same scan batch.

**Connected prompt change:** the AI prompt currently rejects merchant "We received your
payment" receipts (`aiService.ts:400`) with a parenthetical that argues the opposite of
the rule it states. That rule reads as a crude anti-double-count guard. Once real merging
exists it becomes actively harmful — it discards the only record of any payment the bank
never alerted on — so **remove it as part of this change, not before.**

### D6 — Multi-currency (R11)

Today amount extraction matches only `Rs`, `INR`, `₹`, `Rupees`
(`emailScanner.ts:1173-1174`), and the transactions table has no currency column. **This
is a correctness bug, not just a coverage gap:** a `$50` charge that reaches the AI path
can be extracted as `50` and stored indistinguishably from ₹50 — a wrong number in the
ledger, worse than a missing one.

Required work: migration `supabase/014_transaction_currency.sql` adding
`currency TEXT NOT NULL DEFAULT 'INR'` to `transactions`; amount regexes taught `$`, `€`,
`£`, `USD`, `EUR`, `GBP`, `AED`; a `currency` field added to `AITransactionResult` and the
prompt's JSON contract; and display updated — `formatCurrency`, `formatCurrencyCompact`
and `getGlobalCurrencySymbol` in `src/utils/index.ts:6-33` all hardcode INR and need a
currency argument. Aggregates (totals, budgets, analytics) must not sum mixed currencies
naively; simplest correct approach is to keep non-INR out of INR totals and show them
separately rather than inventing an exchange rate.

### D7 — Attachment-only receipts are skipped (R12)

No OCR, no PDF parsing, no manual-entry queue. `extractEmailBody`
(`emailScanner.ts:666-693`) stays as-is.

**One deliberate interpretation:** the "no amount found" path (`emailScanner.ts:1185`) is
currently a bare `continue` with no rejection log. Add a `logRejection(..., 'no_amount_in_body', ...)`
call there. This changes nothing the user sees or has to act on — it satisfies "skip
silently" — but it makes these misses visible in the `email_scan_rejections` audit trail,
so the cost of R12 can be measured later rather than guessed at.

### D8 — Everything stays pending (R9)

No change; this **confirms** an existing invariant. `applyMerchantRulesFromDB` never
returns `approved` (`learningEngine.ts:179-186`) and `learningEngine.test.ts` asserts it.
Treat as a hard guardrail: no future performance or coverage work may introduce
auto-approval.

---

## 3. Pre-existing bug that R3 makes certain

The active-financial-year filter (`emailScanner.ts:1043-1044`) silently drops any email
dated outside the active year, via two bare `continue`s with no rejection log.

With a strict 7-day window (D1), this becomes a **guaranteed annual loss**: a scan run on
3 January covers 27 December to 3 January, and once `activeYear` rolls over, every
transaction dated in late December is discarded — with no audit trail, and with no
possibility of recovery because the window will never reach back that far again.

Fix alongside D1: allow the scan window to span the year boundary, attribute each
transaction to the year its date falls in, and log any genuine year-scope rejection
instead of dropping it silently.

---

## 4. Implementation order

Dependencies matter more than size here.

1. **D4** (false-positive regression tests) — first, so everything after it is guarded.
2. **Performance Phase 1** (`email-scanner-performance-plan.md`) — batching and the rules
   hoist. R2 increases matched emails per scan, so the pipeline must be fast before scope
   widens or scans will time out again.
3. **D1 + section 3** (7-day window + year-boundary fix) — small, and D2 depends on it.
4. **D2** (tier quotas via `scan_mode`).
5. **D3** (widen fetch to everything financial) — only after D4 is green.
6. **D5** (smart merge) — must land with or before D3's vendor-receipt volume increase,
   or duplicates get worse.
7. **D6** (multi-currency) — independent; sequence by owner priority.
8. **D7** (rejection logging for missing amounts) — trivial, anytime.
9. **Performance Phase 2** (progress + incremental inserts) — do before D3 if first-scan
   volume grows enough to risk timeouts.

---

## 5. Standing guardrails

1. Never auto-approve (R9 / D8) — tests assert it.
2. Gate ordering is load-bearing: dedup → date window → bulk-marketing → AI → regex.
   Junk must be rejected **before** it costs an AI call.
3. AI failure always degrades to the regex ladder, never to a dropped email. A 429 or
   quota rejection must never surface to the user as a scan failure.
4. `logRejection` stays fire-and-forget; never awaited in the per-email loop.
5. The `23505` row-by-row insert fallback (`emailScanner.ts:1454-1475`) is what makes
   concurrent and retried scans safe. Reuse it; do not rewrite it.
6. Don't edit the AI prompt's STRICT RULES text except where D5 explicitly requires it —
   it encodes hard-won fixes (commits `8b4b42e`, `8457394`, `bdeca15`).
7. Every change: `npx tsc -b && npm test && npm run build` green before commit.
