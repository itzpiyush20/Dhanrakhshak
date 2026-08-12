# Email Scanner — Performance & Usability Plan

> Execution plan for the Gmail scanner ("Scan Bank Alerts" / "Sync Now" / daily cron),
> written to be executed by Claude Sonnet phase-by-phase. The scanner is the app's
> crucial function: it must **complete reliably** (not just fail politely), **feel alive**
> while running, and **waste no quota**. Each phase is independently committable; run
> `npx tsc -b && npm test && npm run build` after every phase and keep all existing
> tests green. Do not start a phase until the previous one is committed.

---

## 0. What is already fixed on this branch (do not redo)

Branch `claude/scanner-not-responding-05qrpk` already contains:

- `withTimeout(scanRealGmailInbox(), 90000, 'Gmail scan')` on both manual entry points
  (`src/pages/DashboardPage.tsx` `handleManualBannerSync`, `src/pages/PendingPage.tsx`
  `handleScan`). The background auto-sync already had a 30s wrap (`DashboardPage.tsx:305`).
- `fetchWithTimeout` helper in `src/utils/index.ts` (AbortController, default 20s) used by
  the Gmail list fetch, Gmail detail fetch, and the client-side Gemini proxy call.
- 20s AbortController on the server-side Gemini fetch in `api/gemini-proxy.ts` (504 on abort).
- A static "still working" hint that appears 6s into a scan on both pages (`scanTakingLong`).

These stop the *infinite hang*. They do **not** make a large scan complete: the timeout
converts a hang into an error. This plan removes the reason scans are slow at all.

---

## 1. Architecture map (verified file:line anchors)

| Piece | Where | Notes |
|---|---|---|
| Scan engine | `src/services/emailScanner.ts` → `scanRealGmailInbox()` (line ~725) | 1558 lines; all logic below lives here |
| Cooldown / premium gate | `emailScanner.ts:771-832` | 24h cooldown for non-premium, owner/premium bypass |
| Scan window | `emailScanner.ts:891-914` | first scan = 7 days; else since-last-success + 2h overlap, floor 26h, cap 30 days. **Never change this logic.** |
| Gmail list fetch | `emailScanner.ts:925-939` | paged, `fetchWithTimeout` |
| Gmail detail fetch | `emailScanner.ts:956-998` | batches of 15 via `Promise.all` + `retryWithBackoff` — the pattern to imitate |
| Dedup preload | `emailScanner.ts:1001-1015` | loads `email_message_id, reference_id` for **all** user transactions, unbounded |
| Per-email loop | `emailScanner.ts:1035-1431` | gates → `await askAI()` **sequential** (1086) → `await applyMerchantRulesFromDB()` (1096 AI path, 1367 regex path) |
| Insert | `emailScanner.ts:1448-1478` | single batch insert at the very end; 23505 → row-by-row fallback |
| Scan log | `emailScanner.ts:1486-1498` | one row per scan, id pre-generated (`scanLogId`) so rejections can reference it |
| AI classifier | `src/services/aiService.ts:365-483` → `analyzeTransactionEmailWithAI` | one email per Gemini call, prompt ~1500-char body, `maxOutputTokens: 500`, returns `null` on ANY failure |
| Gemini proxy | `api/gemini-proxy.ts` | per-call: JWT verify + profile read + quota update (2-3 Supabase roundtrips), 20 req/min/IP in-memory limiter (line 12-22), 500/day scan quota, **non-atomic** read-then-write counter (88-103) |
| Merchant rules | `src/services/learningEngine.ts:161-210` → `applyMerchantRulesFromDB` | fetches the user's **entire** `merchant_rules` table (`getMerchantRulesFromDB`, line 174) **once per email** |
| Daily cron | `api/auto-sync-gmail.ts` | all eligible users sequentially in ONE invocation, 500ms inter-user delay, **no `maxDuration` export**, injects `askAI` via `opts` (line 172) |
| Dedup safety net | `supabase/schema.sql:491-495` | `UNIQUE (email_message_id, user_id)` — makes retries and concurrent scans insert-safe |

Tests that must stay green: `src/services/emailScanner.test.ts`,
`emailScanner.eventType.test.ts`, `aiService.test.ts`, `learningEngine.test.ts`,
`emailScanGates.test.ts`, `api/auto-sync-gmail.test.ts`, `api/gemini-proxy.test.ts`.

---

## 2. Why scans still fail: the cost model

Per matched email today, sequentially:

- 1 Gemini proxy round trip ≈ 1.5–3s (proxy auth + profile read + quota write + Gemini itself)
- 1 full `merchant_rules` table fetch ≈ 100–200ms
- rejection logging is fire-and-forget (fine)

So a scan of N AI-worthy emails costs roughly **N × 2–3 seconds**:

| Scan size | Time (today) | Outcome |
|---|---|---|
| 10 emails | 20–30s | breaches the 30s background timeout |
| 30 emails | 60–90s | flirts with / breaches the 90s manual timeout |
| 50 emails (typical **first scan**, 7-day lookback) | 100–160s | **guaranteed timeout error** |

Two compounding hazards:

1. **The proxy's own 20 req/min/IP limiter throttles a single legitimate scan.** At
   ~2s/email a sequential scan approaches 30 calls/min; naive parallelization would 429
   instantly. And because `analyzeTransactionEmailWithAI` swallows every error into
   `null`, each 429 silently downgrades that email to the regex heuristics — the user
   sees no error, just worse categorization. Any concurrency work MUST be paired with
   the proxy limiter change (Phase 1, task 1.4).
2. **All-or-nothing insert.** Transactions insert only after the whole loop finishes
   (`emailScanner.ts:1448`). A timeout at email 40/50 saves **nothing** — the retry
   re-scans and re-pays AI quota for the same window.

Conclusion: the first scan a new user ever runs — their first impression of the app's
crucial feature — is the scan most likely to time out. That is the bug behind
"scanner not responding", and phases 1–2 remove it.

---

## Phase 1 — Make the scan fast (batch AI + hoist rules)

**Goal:** 50-email scan drops from ~100-160s to ~15-25s. No behavioral change to
classification outcomes other than speed and fewer quota units burned.

### 1.1 Batch AI classification — new `analyzeTransactionEmailBatchWithAI`

In `src/services/aiService.ts`, add alongside (not replacing) the single-email function:

```ts
export interface EmailForAI { index: number; subject: string; body: string; emailDate: string }

export async function analyzeTransactionEmailBatchWithAI(
  emails: EmailForAI[],                       // up to 5 per call
  callGemini: (body: Record<string, unknown>) => Promise<any> = callGeminiProxy,
  categoryNames?: string[]
): Promise<Map<number, AITransactionResult | null>>
```

- Prompt: same STRICT RULES / extraction spec as the existing prompt (reuse the rule
  text — factor the shared rule block into a module-level constant so the two prompts
  cannot drift), but presents the emails as a numbered list, each body truncated to the
  same 1500 chars, and demands a JSON **array** of result objects each carrying
  `"email_index"`. `maxOutputTokens: 2000`, same temperature/topP/`responseMimeType`,
  same `purpose: 'scan'`.
- Parsing: extract the JSON array; build the Map keyed by `email_index`. Any index
  missing from the response, out of range, or failing the `typeof is_transaction ===
  'boolean'` shape check maps to `null` (= "AI unavailable for this email", falls to
  regex downstream — same meaning `null` has today).
- **Failure ladder:** if the call throws or the array is unparseable, fall back to
  per-email `analyzeTransactionEmailWithAI` calls for that chunk (sequential, max 5).
  Only if those also fail does the email get `null`. Never throw out of this function.
- Unit tests (extend `aiService.test.ts`, mock `callGemini`): happy path 5-in/5-out;
  response missing one index → that index `null`, others intact; malformed JSON →
  falls back to single calls; single fallback also failing → all `null`.

### 1.2 Restructure the per-email loop into stages

In `scanRealGmailInbox` (`emailScanner.ts:1035-1431`), split the current monolithic
`for (const mail of validDetails)` loop:

- **Stage A (cheap, synchronous, per email — unchanged logic, unchanged order):**
  dedup by `existingMessageIds` (1038), date-window checks (1040-1044), body/header
  extraction, bulk-marketing gate (1075-1079) with its `logRejection`. Survivors become
  `aiCandidates: { mail, subject, strippedBodyText, mailDate, ... }[]`. This ordering
  guarantee matters: **gates must keep running before any AI call** so junk never costs
  quota (that is the documented intent of the bulk-mail gate — see comment at 1064-1072).
- **Stage B (batched AI):** chunk `aiCandidates` into groups of 5; run chunks through
  `analyzeTransactionEmailBatchWithAI` with **concurrency 2** (two chunks in flight,
  mirroring the `Promise.all`-batch pattern at 956-998). Collect verdicts into a
  `Map<messageId, AITransactionResult | null>`.
- **Stage C (per email, sequential, cheap — logic verbatim from today):** for each
  candidate, take its verdict and run the existing AI-result handling (1087-1155)
  or, on `null`/fall-through, the existing regex ladder (1157-1426). Preserve exactly:
  `aiConfidentReject` semantics, low-confidence pending insertion, `logRejection`
  fire-and-forget calls, `existingRefIds` check, `continue` behavior. The only change
  inside Stage C is where the AI verdict and merchant rules come from.
- **Cron injection:** `ScanGmailOptions` gains optional `askAIBatch` next to `askAI`
  (`emailScanner.ts:711-723`). Default: proxy-based batch. In `api/auto-sync-gmail.ts:172`
  also pass an `askAIBatch` built on `callGeminiDirect` so the cron gets the same 5×
  reduction in Gemini calls (its per-run cap at line 82-99 then goes 5× further).
  Keep `askAI` as the single-email fallback both paths use.
- Update `emailScanner.test.ts` / `auto-sync-gmail.test.ts` stubs to provide
  `askAIBatch` where they currently provide `askAI` (or rely on the default fallback —
  keep whichever keeps the tests honest).

### 1.3 Hoist the merchant-rules fetch out of the loop

- In `learningEngine.ts`, extract the pure matching logic of `applyMerchantRulesFromDB`
  (lines 168-203: normalize → exact key match → ≥5-char partial match) into
  `applyMerchantRulesFromRows(rules: MerchantRuleRow[], merchant, snippet, defaultCategory): RuleMatchResult`.
  `applyMerchantRulesFromDB` becomes fetch + delegate, preserving its exact current
  behavior and its localStorage fallback on fetch error. **Invariant that must not
  move: DB rules never return `approval_status: 'approved'`** (comment at 179-180;
  `learningEngine.test.ts` asserts this — keep those tests passing untouched).
- In `scanRealGmailInbox`, fetch rules **once** near the other per-scan preloads
  (~line 1021, beside the categories fetch) via `getMerchantRulesFromDB(user.id, supabase)`,
  then replace both call sites (1096, 1367) with `applyMerchantRulesFromRows(...)`.
  On fetch failure use `[]` and let the in-memory matcher fall through to
  `applyMerchantRules` (localStorage) exactly as the catch block does today.
- Add a `learningEngine.test.ts` case: `applyMerchantRulesFromRows` with a prepared
  rows array returns identical results to today's expectations.

### 1.4 Proxy rate limiter must not throttle the faster scan

In `api/gemini-proxy.ts:19`, raise the in-memory IP limit from 20/min to **60/min**.
Rationale to preserve in a short comment: real cost control lives in the per-user
Postgres quota (500 scan calls/day); the IP limiter is only a pre-auth abuse shield,
and after batching, a legitimate 150-email scan is ~30 calls — the old limit of 20
would 429 it and silently degrade classification. Update `gemini-proxy.test.ts` if it
pins the limit.

### Acceptance for Phase 1

- `npx tsc -b`, `npm test`, `npm run build` all green; no new lint errors in touched files.
- Grep proof: no `await askAI(` and no `await applyMerchantRulesFromDB(` inside the
  Stage C loop; exactly one `getMerchantRulesFromDB` call per scan.
- A scan whose batch AI call fails entirely still completes via regex (test this with
  an injected always-throwing `askAIBatch` + `askAI`).
- Commit separately: 1.1+1.2 (batching) and 1.3 (rules hoist) are cleanly separable;
  1.4 rides with 1.1.

---

## Phase 2 — Make progress visible and partial results durable

**Goal:** the user watches the scan happen, and a scan that dies mid-way keeps
everything found so far. This replaces the static 6s hint with the real thing.

### 2.1 `onProgress` callback

- Add to `ScanGmailOptions`:
  `onProgress?: (p: { phase: 'listing' | 'fetching' | 'analyzing' | 'saving'; current: number; total: number }) => void`.
  Emit: after the Gmail list completes (`total = uniqueMessages.length`), per detail-fetch
  batch (956-998), per AI chunk in Stage B, and once entering insert. Wrap every
  invocation in try/catch — a throwing callback must never kill a scan.
- `PendingPage.handleScan` and `DashboardPage.handleManualBannerSync` pass a callback
  into state, e.g. `Analyzing 12 of 47 emails…`, rendered where the `scanTakingLong`
  hint currently renders (keep the hint as fallback until the first progress event
  arrives, then replace it). Background auto-sync (`DashboardPage.tsx:305`) passes none.
- Test: engine test asserts progress events arrive in phase order with sane totals and
  that a throwing callback doesn't fail the scan.

### 2.2 Incremental inserts

- In Stage C, flush `transactionsToInsert` to Supabase every **10** parsed transactions
  using the existing insert-with-23505-row-fallback as a helper function (extract
  1448-1478 into `insertTransactionsChunk(supabase, rows)` and reuse it for the final
  flush). Accumulate `insertedTxns` across flushes.
- The scan log (1486-1498) still writes once at the end with full totals — unchanged
  schema, unchanged cooldown semantics (cooldown keys off `status: 'success'` logs,
  which still only appear on full completion, so a half-finished scan correctly does
  NOT start the 24h cooldown and the next scan's window still reaches back — dedup +
  the unique constraint make the overlap harmless).
- In the catch block (1511-1533), when some chunks were already inserted, include
  `"N transactions were already saved before the error"` in the error message so the
  timeout toast tells the user their partial results are real.
- Test: inject a Stage-B failure after the first flush; assert first-chunk rows
  inserted, error message carries the count, no `success` log row.

### 2.3 Scan-specific timeout copy

`withTimeout`'s generic message says "Please refresh the page" — wrong advice for a
scan. At both manual call sites, catch the timeout error (`message.includes('timed
out')`) and rewrite to: `Scan is taking longer than expected. Anything already found
has been saved — scan again to continue where it left off.` (True once 2.2 lands.)

---

## Phase 3 — Server-side hardening (cron + proxy)

The daily cron is the path that keeps inboxes fresh so manual scans stay small — if it
dies, every manual scan becomes a large scan. Today it processes **all** users
sequentially in one invocation with no `maxDuration`, so it almost certainly exceeds
Vercel's default function window once there are more than a handful of eligible users.

### 3.1 `api/auto-sync-gmail.ts`

- `export const maxDuration = 300` (also add `maxDuration = 60` to `api/gemini-proxy.ts`).
- Time budget: capture `startedAt = Date.now()` at handler entry; before each user,
  if elapsed > `maxDuration * 1000 - 60_000` (60s safety margin), stop and include
  `skippedForBudget` in the JSON summary. Skipped users self-heal: their next-day run
  or their own scan-window logic covers the gap (window reaches back to last success,
  cap 30 days — see anchor table).
- Order users by **oldest last successful scan first** so budget-skips never starve the
  same users repeatedly: preload latest `email_scan_logs.scanned_at` per user and sort.
- Add AbortController timeouts (reuse the 20s pattern from `gemini-proxy.ts:110-111`)
  to the two raw fetches: token refresh (line 61) and `callGeminiDirect` (line 92).
- Update `auto-sync-gmail.test.ts` for the ordering + budget behavior.

### 3.2 Atomic quota counter in `api/gemini-proxy.ts`

The read-then-write at 88-103 loses increments under the concurrency Phase 1
introduces (two parallel calls read the same count). Replace with a Postgres function:

- New migration `supabase/0XX_atomic_ai_quota.sql` (follow numbering in `supabase/`):
  `increment_ai_call_count(p_user_id uuid, p_column text, p_reset_column text, p_limit int, p_window_hours int) returns boolean`
  — atomically resets the counter if the window lapsed, increments, and returns whether
  the call is within limit (single `UPDATE ... RETURNING`, or `SELECT ... FOR UPDATE`).
  Restrict `p_column` to the two known column pairs inside the function (no dynamic SQL
  on raw input).
- Proxy calls it via `supabaseAdmin.rpc(...)`; `false` → the existing 429 message.
  Keep the response-shape contract `gemini-proxy.test.ts` asserts.

---

## Phase 4 — Polish (small, independent)

- **4.1 First-scan expectation:** on PendingPage, when `lastScanLog` is null (never
  scanned), show one line under the scan button: `First scan reviews your last 7 days
  of mail and takes a minute or two.` Removes the "is it broken?" question exactly
  where new users ask it.
- **4.2 Scope the dedup preload:** `emailScanner.ts:1001-1004` loads every transaction
  the user has ever had. Add `.gte('date', <windowStart minus 35 days, ISO date>)` —
  covers the 30-day max window plus margin; `reference_id` collisions outside that
  range are already impossible because the Gmail query can't fetch older mail.
- **4.3 Re-evaluate the 90s manual timeout** after Phase 1 ships: with batching, p95
  should sit well under 30s; drop manual to 60s and background to 45s only if telemetry
  (scan log timestamps) agrees. Do not lower anything before Phase 1 is deployed.
- **4.4 (Optional) true cancellation:** thread an `AbortSignal` through
  `ScanGmailOptions` into the Gmail/AI fetches so the UI timeout actually stops the
  background work instead of abandoning it. Only worth it if quota telemetry shows
  abandoned scans burning meaningful quota.

---

## Guardrails (apply to every phase)

1. **Never change** the scan-window computation (891-914), the cooldown/premium gating
   (771-832), or the gate ordering (dedup → date → bulk-mail → AI → regex).
2. **Never auto-approve** from merchant rules — `'pending'` invariant, tests assert it.
3. `logRejection` stays fire-and-forget; never `await` it in the loop.
4. The 23505 row-fallback insert semantics are load-bearing for concurrent-scan safety;
   reuse, don't rewrite.
5. AI failure must always degrade to the regex ladder, never to a dropped email; a
   quota/429 response must never surface as a scan failure.
6. Don't touch the AI prompt's STRICT RULES content — it encodes hard-won
   classification fixes (see commits `8b4b42e`, `8457394`, `bdeca15`). Factor, don't edit.
7. Every phase: `npx tsc -b && npm test && npm run build` green before commit; commit
   messages follow the repo's `fix:`/`feat:` convention; push to
   `claude/scanner-not-responding-05qrpk`.
