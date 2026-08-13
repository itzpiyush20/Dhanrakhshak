# Email Scanner — Deep-Dive Audit (2026-08-13)

> Full-codebase review of the Gmail scanner, done as a standalone audit (not tied to
> a specific fix task). Covers correctness, spec compliance against
> `plans/email-scanner-requirements.md`, security, and failure-mode reliability.
> Every finding below was read and confirmed against the actual current code —
> not inferred from the two plan docs, which are stale in places (see D-note below).

**Files covered:** `src/services/emailScanner.ts` (2616 lines), `src/services/aiService.ts`,
`api/gemini-proxy.ts`, `api/auto-sync-gmail.ts`, `src/services/emailScanGates.ts`,
`src/services/learningEngine.ts`, `src/services/paymentMerge.ts`, `src/services/currency.ts`,
`src/services/merchantNormalizer.ts`, `supabase/schema.sql` + migrations 013–017.

**Note on the plan docs:** `email-scanner-requirements.md` and
`email-scanner-performance-plan.md` mark D1–D8 and Phase 1–2 "DONE." Most of that holds up
(dedup scoping, merchant-rule hoist, scanMode quota population, currency capture, rejection
logging are all genuinely fixed). But `emailScanner.ts` has grown from the plan's stated
~1558 lines to 2616 lines since, via ~25 more narrow `fix:` commits, and several things the
docs treat as settled are not — see #2, #5, #6, #9 below.

---

## Critical

### 1. ReDoS in `extractCardLast4` — can hang the scan (and the tab) on one crafted email
**`src/services/emailScanner.ts:537`**, called from Stage C at `:2338`

```js
const candidateRegex = /(?:^|\D)(?:[xX*]+-?)*\s*(\d{4})\b/g
```

`(?:[xX*]+-?)*` is a nested-quantifier "evil regex" shape. Confirmed live: matching this
pattern against `'Card ending ' + 'x'.repeat(35) + '!'` (a 48-char string with no trailing
digits) did not finish in 120+ seconds in Node. Real bank/promo emails routinely contain long
runs of masking characters (`xxxxxxxx1234`, horizontal-rule-style `*` runs in HTML-stripped
text). Stage C is not internally yielded per-candidate (only between candidates), and the
scan's 300s deadline (`SCAN_DEADLINE_MS`) is only checked at stage boundaries — it cannot
interrupt a regex mid-catastrophic-backtrack. One such email freezes the entire scan.
This is the same bug class the repo already fixed once elsewhere (`ab460c0`) — reintroduced
here.

**Fix shape:** replace with a bounded/possessive-equivalent pattern, e.g. cap the masking
run length explicitly (`[xX*]{1,20}-?`) and drop the outer `*` around a group that already
has an inner `+`.

### 2. Cron scans hardcode `activeYear = 2026` — diverges from real user setting today, breaks ALL automatic scans after 2026-12-31
**`src/services/emailScanner.ts:1524-1543`**, **`api/auto-sync-gmail.ts:168-182`**

```js
let activeYear = opts?.activeYear ?? 2026
if (opts?.activeYear === undefined) {
  try { const storedYear = localStorage.getItem(...) } catch {}   // no-op on server
}
```

`auto-sync-gmail.ts` never passes `activeYear` into `scanRealGmailInbox`, and the fallback
reads `localStorage`, which doesn't exist in the cron's server runtime. The correct value
lives in `profiles.active_financial_year` (kept in sync client-side per `AuthContext.tsx`),
but the cron's user query (`auto-sync-gmail.ts:120-123`) never selects it.

Two concrete consequences:
- **Today:** any user who rolls their financial year forward in Settings gets scheduled
  scans that still reject all their mail via the `after_active_year` gate, because the cron
  path is stuck on 2026 regardless of what the user set.
- **From 2027-01-01:** `today > activeYearEnd` fires for every user on every cron run — the
  daily automatic scan (R5/R7/R8) silently and permanently stops for the entire user base,
  with no UI path to fix it since this is server-side. This is a stricter, previously-unflagged
  version of the "D1a" open risk in the requirements doc — D1a's framing assumes a user-facing
  fix ("manual click in Settings") that doesn't exist for the cron path at all.

**Fix shape:** select `active_financial_year` in the cron's profile query, pass it through as
`opts.activeYear` per user. This is a real requirement gap, not just a magic-number cleanup —
flag to the owner alongside D1a.

### 3. Non-atomic Gemini proxy quota counter races under the scanner's own concurrency
**`api/gemini-proxy.ts:86-137`**

Read-then-write: `SELECT ai_scan_calls_count` → compute `+1` in JS → `UPDATE`. No atomic
increment, no optimistic `.eq(countColumn, currentCount)` guard, no RPC. Meanwhile
`emailScanner.ts:889` runs `AI_BATCH_CONCURRENCY = 4` chunks in flight via `Promise.all`. With
4 concurrent calls all reading `currentCount = 490` (limit 500) before any writes land, all 4
pass the `< 500` check, all 4 call Gemini, all 4 write back `491` — 4 calls billed, counter
advances by 1. This was flagged as a known risk in the old performance plan (Phase 3.2,
"Atomic quota counter") and explicitly never implemented. Two browser tabs scanning
simultaneously compounds it further. Net effect: the 500/day cap is not actually enforced
once any concurrency is in play — which Phase 1 batching (already shipped) introduced.

**Fix shape:** the plan doc's own proposed fix (a `SELECT ... FOR UPDATE` or single atomic
`UPDATE ... RETURNING` Postgres RPC) is still the right shape — it was written but never
landed.

### 4. Duplicate-payment merge can silently destroy a real, distinct transaction
**`src/services/paymentMerge.ts:112-127`**

The module's own header comment states the design intent: *"Two ₹50 coffees on the same day
are a genuine pair, not a duplicate... deliberately conservative."* The actual merchant/amount
match only refuses to merge when merchant labels are **weak**:

```js
if (a.reference_id && b.reference_id) return a.reference_id === b.reference_id  // only decisive if BOTH sides have one
return merchantsCorrespond(a.merchant, b.merchant)                              // otherwise falls through
```

A bank debit alert usually carries a `reference_id`; a merchant receipt usually doesn't — the
exact asymmetric case this module exists to merge. When only one side has a `reference_id`,
the reference check never activates, and the code falls through to merchant-name matching
alone. Two **real, distinct** transactions to the same known merchant on the same day (two
Swiggy orders — lunch and dinner — for a coincidentally equal amount; two rent/subscription
payments to the same payee) merge into one and the second silently vanishes.
`transaction_time` exists on `MergeableTransaction` but is never consulted, even though it
would disambiguate same-day orders.

**Confirmed by a test-coverage gap**, not just a hypothetical: `paymentMerge.test.ts` covers
same-amount/same-day/weak-merchant and same-amount/same-day/differing-reference-id, but not
same-amount/same-day/**strong**-merchant/**no reference id on either side** — the exact
real-world case the header comment warns about.

**Fix shape:** require *some* additional corroborating signal (transaction_time proximity
tighter than ±1 day, payment_mode match, or a minimum confidence delta) before merging on
merchant-name alone with no reference id on either side; or make the merge conservative by
requiring at least one side to always carry a reference_id/UPI ref for the auto-merge path,
falling back to a user-reviewable "possible duplicate" suggestion otherwise rather than a
silent merge.

---

## High

### 5. Cron has no `maxDuration` and no time budget — a mid-run kill drops the current user with zero log and abandons everyone after
**`api/auto-sync-gmail.ts`** (whole file, loop at 141-211)

No `export const maxDuration`, no wall-clock check inside the per-user loop. On a growing
eligible-user base this will eventually exceed Vercel's function timeout. When Vercel
hard-kills the invocation mid-`await`, the user being scanned at that moment gets **no**
`email_scan_logs` row at all (not even `status: 'failed'`), and every user later in the query
order is silently skipped for the day with no record either. This is Phase 3.1 from the
performance plan, explicitly scoped and never implemented.

### 6. No ordering on the cron's user query — timeouts always starve the same tail of users
**`api/auto-sync-gmail.ts:107-109`**

`.select('user_id, refresh_token')` has no `.order(...)`, so rows come back in stable
insertion order. Combined with #5, once the run starts timing out partway through, the same
users at the end of that order get cut off every single day — their automatic scan silently
never runs, while users near the front always succeed. The performance plan specified
"oldest last-successful-scan first" ordering for exactly this reason; it isn't there.

### 7. Prompt injection: unescaped subject/body interpolation into the Gemini prompt
**`src/services/aiService.ts:482-500`, `:564-592`**

`Subject: "${subject}"` and a `"""`-delimited body block insert attacker-controlled email
content (anyone can email the user) with no escaping of quote/triple-quote sequences. A
crafted email body containing `"""` followed by fabricated instruction-like text can break out
of the intended delimiter and get treated as part of the prompt rather than untrusted data —
potentially flipping `is_transaction` to `true` or fabricating amount/merchant/category.
Bounded today because everything still lands in `pending` (see "confirmed intact" below), but
it's a real gap against the R1/R13 zero-tolerance requirement, and against #10 below (no
downstream validation of the fields an injected response could control).

### 8. Cron eligibility check diverges from the canonical premium check — a trial-with-null-expiry user gets a free daily auto-scan, violating R6
**`api/auto-sync-gmail.ts:50-58`** vs. canonical **`src/services/emailScanner.ts:925-940`** (`isPremiumProfile`)

```js
// auto-sync-gmail.ts — isEligible
if (profile.subscription_status === 'trial' && notExpired) return true   // !expiresAt short-circuits notExpired = true
```
```js
// emailScanner.ts — isPremiumProfile (canonical)
if (profile.subscription_status === 'trial') {
  return !!expiresAt && new Date(expiresAt).getTime() > now   // null expiry => NOT premium
}
```

A `profiles` row with `subscription_status='trial', subscription_expires_at=NULL` is eligible
for the cron's daily automatic scan under `isEligible`, but would be classified free-tier (no
auto-scan) under the canonical `isPremiumProfile` used for manual-scan quota. Direct R6
violation for that user segment, caused by two independent, drifted implementations of the
same eligibility rule living in different files.

### 9. `schema.sql` is missing migrations 013–017 — a fresh bootstrap breaks currency, merge, and rejection-dedup
**`supabase/schema.sql`**

`schema.sql` is the documented "run this to set up" file and does append some later ALTERs
(e.g. the `email_message_id` unique constraint), but has no `currency` column on
`transactions`, no `merged_email_message_ids` column/index, and `email_scan_rejections` has no
`email_message_id` column — all three added by migrations 013/015/016/017 and actively
read/written by `emailScanner.ts`. A new environment built only from `schema.sql` (fresh dev
DB, CI, disaster recovery) gets `column "currency" does not exist` on the first scan, not a
graceful degradation. Also confirms CLAUDE.md's "next migration is `014_`" note is stale — the
repo is actually at `017_`.

---

## Medium

### 10. AI result fields beyond `is_transaction` are never type/range-validated before being stored
**`src/services/aiService.ts:464-466`** (`isUsableResult`), consumed at **`emailScanner.ts:2110, 2145`**

Only `is_transaction` is checked to be a boolean. `amount` is gated by `aiResult.amount > 0`
(loose coercion — a non-numeric string silently drops, but a numeric-looking string like
`"999999999"` sails through with no ceiling); `currency` falls back to default but is never
checked against an ISO-4217 allowlist. Since everything still lands in `pending`, this can't
auto-post bad data, but a hallucinated or injected (#7) huge amount or bogus currency code is
stored and shown to the user with no defensive clamp — undercutting the AI prompt's own
stated worry about fabricated amounts.

### 11. Batch AI failure fallback doesn't treat HTTP 429 as fatal — wasteful retries once quota is already exhausted
**`src/services/aiService.ts:625-647`** (`isFatalProxyError`)

`isFatalProxyError` matches `/404|503|401|Not authenticated/i` but not 429. Once the daily
quota (proxy-side, #3) or the per-IP rate limiter is exhausted, every batch call 429s, and
instead of failing the chunk fast, the code falls into a 5-call single-email retry loop per
chunk — every one of which also 429s. Doesn't break the "must degrade, never crash" invariant,
but burns significant time and rate-limit budget for no benefit once quota is gone.

### 12. `merchant_rules` partial-match can be poisoned by one generic 5-letter merchant name
**`src/services/learningEngine.ts:194-208`**

The 5-character floor meant to stop short false-matches ("jio", "pay") is still short enough
to hit ordinary English words. A rule learned from a merchant literally named "Store" (`store`,
5 chars) will match any future email whose 300-char snippet contains "in-store purchase",
"App Store subscription", "grocery store", etc. Bounded by the always-pending invariant, but
silently mis-suggests categories on unrelated merchants that a trusting user won't
double-check.

### 13. Bare `\btotal\b` / `\bfare\b` in the bulk-mail payment-assertion check let marketing mail past the pre-AI gate
**`src/services/emailScanGates.ts:140-161`**, gate at **`emailScanner.ts:2042-2046`**

`hasPaymentAssertion`'s body-wide use (there's a second, safer ±120-char-window use later at
`:2270`) treats a bare occurrence of "total" or "fare" anywhere in up to 2000 chars as proof
money moved. A `List-Unsubscribe`-bearing marketing email mentioning "Total savings this
festive season!" or a travel-fare promo survives the gate whose whole documented purpose
(comment at `:2031-2039`) is to stop newsletters from consuming AI quota. Directly undercuts
CLAUDE.md invariant #2 ("junk must be rejected before it costs an AI call") for this specific
pattern.

### 14. `HARD_ACCEPT_SUBJECT_PATTERNS` overrides the AI's confident rejection on very broad patterns
**`src/services/emailScanner.ts:135-164`**, applied at **`:2101, :2176`**

`isHardAccepted` overrides `aiConfidentReject` (the AI explicitly saying `is_transaction:
false`) to force a fall-through to the regex ladder. Some patterns are broad — e.g. `/\bcred\b/i`
matches any standalone "cred" in a subject. The downstream regex gates provide a second line
of defense, but discarding the pipeline's strongest rejection signal for a wide subject-text
class is exactly the kind of surface R1/R13 asks to be locked down, not widened.

---

## Low

### 15. Malformed batch JSON burns 6 proxy calls to serve what was designed to cost 1
**`src/services/aiService.ts:594-647`**

If Gemini's batch response fails to parse (already-consumed proxy call, quota already
deducted), the fallback issues 5 more single-email proxy calls. Directly undercuts the
documented "~5x quota reduction" rationale for batching on its most likely failure path
(large-array truncation), and compounds #3 under concurrency.

### 16. `mailTime` silently defaults to "now" if Gmail omits `internalDate`
**`src/services/emailScanner.ts:1962-1963`**

`const mailTime = mail.internalDate ? Number(mail.internalDate) : Date.now()` — a malformed
Gmail API response with no `internalDate` always passes the 7-day window check regardless of
true age, rather than being rejected/logged. Low likelihood (Gmail reliably sets this field).

### 17. CORS allows any `*.vercel.app` origin with credentials
**`api/gemini-proxy.ts:37-38`**

`origin.endsWith('.vercel.app')` accepts any Vercel-hosted origin (anyone can deploy one for
free), paired with `Access-Control-Allow-Credentials: true`. Auth is bearer-token-based (not
ambient cookies), which limits real exploitability, but the allowlist is wider than the app's
actual deployment domain(s) need.

### 18. `logRejection` is dead code with a schema-drifted signature, but CLAUDE.md still describes it as the live mechanism
**`src/services/emailScanGates.ts:177-199`**

The actual production path is `bufferRejection`/`flushRejections` in `emailScanner.ts`
(added later to fix an FK-ordering bug). `logRejection`'s insert payload was never updated for
migration `017`'s new `email_message_id` column. Not currently exploitable since it's unused,
but if anyone reuses it (it's still exported and tested), rejections logged through it won't
dedupe correctly on the next scan.

### 19. Raw Gemini fetch error message echoed to the client
**`api/gemini-proxy.ts:143`**

Minor information disclosure of server-side network/DNS/TLS error strings; no API keys are
present in these messages, confirmed.

---

## Confirmed intact (checked, not bugs)

- **Never auto-approve (R9):** `applyMerchantRulesFromDB` / `applyMerchantRulesFromRows` /
  the localStorage fallback / all AI-path result construction — every path hard-codes
  `approval_status: 'pending'`. `learningEngine.test.ts` genuinely exercises this, not
  tautologically.
- **Gate ordering** (dedup → date window → bulk-marketing → AI → regex) matches CLAUDE.md
  exactly in `emailScanner.ts:1960-2192`.
- **AI failure always degrades to regex, never crashes the scan** — every throw path in both
  AI functions is caught internally.
- **`logRejection`/`bufferRejection` fire-and-forget** — buffered synchronously, flushed once
  post-scan, never awaited per-email.
- **23505 row-by-row insert fallback** preserved verbatim, still backs concurrent-scan safety.
- **Dedup preload is scoped** (window start − 3 days), not the old unbounded full-table load.
- **Merchant rules fetched once per scan**, not per email — perf hoist still holds.
- **R7's "scheduled scans don't consume manual quota"** — `scanMode: 'scheduled'` correctly
  passed by the cron and excluded from the manual-quota count.
- **R10 merge wired bidirectionally** (in-batch and against stored rows) — present, just
  under-guarded (#4).
- **R11 currency captured from the actual matched amount**, not assumed INR; the historical
  currency-blind-merge bug (`$50`/`₹50` merging) is fixed — `isSamePayment` checks currency
  before amount.
- **R12 attachment-only skips are logged**, not silent — `bufferRejection` calls confirmed at
  multiple `continue` sites.
- **No API keys or service-role secrets** found leaking into any response body, log line, or
  client-reachable path.
- **STRICT_RULES prompt text** — the only recent change traces to a legitimate requirement
  (CRED/CHEQ credit-card categorization, commit `0d003ab`), not unauthorized editing.
- **Regex catastrophic-backtracking scan of `emailScanGates.ts`** — clean; all patterns are
  linear-time. The ReDoS risk found (#1) is isolated to `extractCardLast4` in
  `emailScanner.ts`.

---

## Suggested priority order for fixing

1. **#1 (ReDoS)** — trivial regex fix, prevents a full scan hang from a single email.
2. **#2 (cron activeYear)** — real requirement gap with a hard 2027-01-01 deadline; needs an
   owner decision on top of the code fix (same shape as the already-flagged D1a risk).
3. **#4 (merge can destroy a transaction)** — silent data loss, no user-visible error to even
   notice it happened.
4. **#3 (quota race)** — the Phase 3.2 fix that was scoped and never shipped; straightforward
   to land now.
5. **#5/#6 (cron duration/ordering)** — Phase 3.1, same story as #3.
6. **#8 (trial eligibility drift)** — small, share the canonical `isPremiumProfile` logic
   instead of a second copy.
7. **#9 (schema.sql drift)** — mechanical: fold 013–017 into `schema.sql`.
8. Remainder (#7, #10–#19) — bundle into a follow-up hardening pass; none are urgent in
   isolation, but #7+#10 compound each other and are worth fixing together.
</content>
