# Email Scanner Remediation — Design

**Date:** 2026-08-13
**Source:** `plans/email-scanner-audit.md` (19 findings: 4 critical, 5 high, 5 medium, 5 low)
**Base commit:** `56ec010` (rebased onto origin/main during design).
**Baseline:** `npx tsc -b` exit 0, `npm test` **374 passed / 25 files**, all green.

> **Re-validated after rebase.** Three upstream commits landed between the audit and this
> spec. #11 and #15 are fixed upstream and are dropped from Phase 5. #5 is narrowed
> (`maxDuration` now declared; the per-user time budget is still missing). #13 is reframed —
> `\btotal\b` is documented as deliberate and load-bearing, so the fix may not delete it.
> #19 is narrowed. The other 14 findings stand unchanged. **17 of 19 actionable.**

## Goal

Resolve all 19 audit findings without regressing the scanner's classification accuracy.
The last ~25 commits to `emailScanner.ts` were narrow false-positive/false-negative fixes;
the 323 existing tests encode those hard-won outcomes and are the regression suite for this
work. **Any change that reddens an existing fixture gets reverted, not forced green.**

## Owner decisions taken during design

| # | Decision | Rationale |
|---|---|---|
| 1 | **Remove the Financial Year feature entirely** | It only ever gated the scanner and rendered two modals. It never filtered displayed data, so removal is safe. It was the cause of critical finding #2. |
| 2 | **Never silently merge unprovable duplicates — flag them for the user** | A wrong merge destroys a transaction invisibly. A flagged pair costs one tap. Chosen over tightening the auto-merge heuristic. |
| 3 | **Phased delivery, commit per phase, stop for review between phases** | Matches how this repo already works and keeps each diff reviewable. |

`profiles.active_financial_year` is **left in the database, unused.** Dropping a column is
irreversible and buys nothing here. Revisit separately if desired.

## Invariants that constrain every phase

Carried from `CLAUDE.md`; all were verified intact by the audit and must remain so:

1. Nothing auto-approves. Every scanned transaction lands in Pending.
2. Gate ordering is load-bearing: dedup → date window → bulk-marketing → AI → regex.
3. AI failure degrades to the regex ladder, never to a dropped email or a scan failure.
4. `logRejection` / `bufferRejection` stay fire-and-forget, never awaited per-email.
5. The `23505` row-by-row insert fallback is reused, never rewritten.
6. AI prompt STRICT RULES text is not edited except where a phase explicitly requires it
   (Phase 5 touches only the interpolation mechanics around it, never the rule text).

Verification gate for every phase: `npx tsc -b && npm test && npm run build` green before commit.

---

## Phase 1 — ReDoS in `extractCardLast4`

**Fixes:** critical #1.

`src/services/emailScanner.ts:537` uses `(?:[xX*]+-?)*` — a nested quantifier with classic
exponential backtracking. Measured: 5.2 minutes on a 48-character input. It runs inside
Stage C, which is not yielded mid-candidate, and `SCAN_DEADLINE_MS` is only checked at stage
boundaries, so it cannot be interrupted.

**Change:** bound the masking run explicitly (e.g. `[xX*]{1,20}-?`) and remove the outer `*`
wrapping a group that already carries an inner `+`, so the pattern is linear-time.

**Test:** regression case asserting `extractCardLast4('Card ending ' + 'x'.repeat(35) + '!')`
returns promptly. Existing card-extraction fixtures must stay green — the masking formats
they cover (`xxxx1234`, `XXXX-1234`, `****1234`) must all still parse.

**Scope discipline:** this phase touches one function and its tests. Nothing else.

---

## Phase 2 — Remove the Financial Year feature

**Fixes:** critical #2 (which subsumes the hardcoded-`2026` magic-number risk — same root cause).

The cron never reads `profiles.active_financial_year`; it falls back to `localStorage`, which
does not exist server-side, so every scheduled scan uses a hardcoded `2026`. From
2027-01-01 the year-end block fires for every user on every cron run and the daily automatic
scan stops permanently, unfixable from the UI. Rather than plumb the value through, the
feature is removed.

**Changes:**

- `src/services/emailScanner.ts`
  - Delete the year-end hard-block (`:1537-1543`) and its error return.
  - Delete the per-email year-scope filter (`:1995-2007`) including both `bufferRejection`
    calls for `after_active_year` / `before_active_year`.
  - Remove `activeYear` from `ScanGmailOptions` and the localStorage read at `:1524-1534`.
- `src/context/AuthContext.tsx` — remove `activeYear` state, `startNewFinancialYear`, the
  `profiles.active_financial_year` read/write sync, the localStorage keys, and both context
  type entries.
- `src/pages/SettingsPage.tsx` — delete the "Financial Year Management" card and the
  "Start New Financial Year" confirmation modal, plus now-unused imports and state.
- `src/pages/DashboardPage.tsx` — delete the "Financial Year Completed" modal and its
  trigger state.
- Tests asserting the year gates are deleted alongside the gates.

**Result:** the scanner always scans its rolling 7-day window; every transaction is filed by
its own date. No mail is ever lost to a rollover and no user action is ever required.

**Watch for:** unused-import and unused-variable lint in the four touched files, and any
other consumer of `useAuth().activeYear` that the grep did not surface — typecheck will
catch these.

---

## Phase 3 — Duplicate flagging instead of silent merge

**Fixes:** critical #4. Delivered as two commits.

`paymentMerge.ts:112-127` only refuses to merge when the merchant label is *weak*. The
reference-id comparison is decisive only when **both** sides carry one — but the case the
module exists for (bank alert with a ref id + merchant receipt without one) skips it and
falls through to merchant-name matching. Two genuinely distinct same-day, same-amount
payments to one merchant therefore merge, and one disappears with no error and no trace.
`transaction_time` is on the row but never consulted.

### 3a — Logic and migration

- Migration `supabase/018_possible_duplicate.sql`: add nullable `possible_duplicate_of uuid`
  to `transactions`, referencing `transactions(id)`, with an index. Idempotent, no backfill,
  matching the style of 014–017.
- `paymentMerge.ts`: auto-merge **only** when `reference_id` is present on both sides and
  matches. Every other near-match (amount + currency + date window + corresponding merchant)
  becomes a *flagged pair*, not a merge.
- `emailScanner.ts`: where it currently absorbs into an existing payment, insert both rows
  and set `possible_duplicate_of` on the newer one. Applies in both directions the merge
  already covers — within a scan batch, and against stored rows. Stored rows the user has
  already approved or re-categorised are still never rewritten.
- **Test that closes the audit's coverage gap:** same amount, same day, strong matching
  merchant, **no reference_id on either side** → asserts two rows inserted and the flag set,
  where today it asserts one row. Existing merge tests (matching ref ids → merge; weak
  merchant → no merge; differing currency → no merge) must stay green.

### 3b — UI

- PendingPage renders a "possible duplicate" affordance on flagged rows, linking the pair,
  with a merge action that collapses them and a dismiss that clears the flag.
- Merging from the UI must preserve the richer record (reference_id, payment mode, card
  issuer, higher confidence), the same preference the old auto-merge encoded.
- Nothing here auto-approves; both rows remain pending until the user acts.

---

## Phase 4 — Server hardening

**Fixes:** critical #3, high #5, high #6, high #8.

- **Atomic AI quota.** `api/gemini-proxy.ts:86-137` reads the counter, increments in JS, and
  writes back. `emailScanner.ts:889` runs `AI_BATCH_CONCURRENCY = 4`, so four concurrent
  calls read the same value and the counter advances by one — the 500/day cap is not
  enforced. Add migration `supabase/019_atomic_ai_quota.sql` defining
  `increment_ai_call_count(...)` that resets the window if lapsed, increments, and returns
  whether the call is within limit, in a single atomic statement. Restrict the column
  arguments to the two known pairs inside the function; no dynamic SQL on raw input. The
  proxy calls it via `rpc(...)`; `false` returns the existing 429 shape so
  `gemini-proxy.test.ts`'s response contract still holds.
- **Cron duration budget.** `maxDuration = 60` is already declared upstream
  (`auto-sync-gmail.ts:49`), and the timeout ladder is already nested deliberately
  (platform 60s > client 35s > proxy abort 30s) — **do not change those numbers.** The
  remaining gap is the per-user budget: capture `startedAt` and check remaining time before
  each user, stopping early with `skippedForBudget` in the JSON summary rather than being
  hard-killed mid-`await` (which today leaves the in-flight user with no scan log at all).
- **Cron ordering.** The user query has no `ORDER BY`, so a budget stop always starves the
  same tail. Order by oldest last-successful-scan first so skips rotate.
- **Eligibility drift.** `isEligible` (`auto-sync-gmail.ts:50-58`) treats a trial with
  `subscription_expires_at = NULL` as eligible; canonical `isPremiumProfile`
  (`emailScanner.ts:925-940`) deliberately does not. Delete the duplicate and use the
  canonical function so the two cannot drift again. This restores R6 for that segment.

---

## Phase 5 — AI input and output hardening

**Fixes:** high #7, medium #10. (#11 and #15 were fixed upstream by `a9de9a8` and are
dropped from this phase — the retry ladder now separates content faults from transport
failures correctly. Do not re-touch it.)

- **Prompt injection.** `aiService.ts:482-500` and `:564-592` interpolate attacker-controlled
  subject and body into the prompt with no escaping, so a body containing `"""` can break out
  of its delimiter. Sanitize both before interpolation (neutralise delimiter sequences,
  bound length as today). The STRICT RULES text itself is not modified — only the mechanics
  of how untrusted content is fenced around it.
- **Output validation.** `isUsableResult` (`aiService.ts:464-466`) checks only that
  `is_transaction` is a boolean. Add: `amount` must be a finite number above zero and below a
  sane ceiling; `currency` must be in an ISO-4217 allowlist or fall back to default. This is
  the containment for anything injection does get through, and for ordinary hallucination.
**Observability note carried from re-validation:** the AI classifier was dead in production
for ~10 weeks and nothing reported it, because every layer degraded gracefully as designed.
`a9de9a8` added a scan-log note when no AI verdict arrives for any email. When touching this
file, preserve that signal — graceful degradation without an observability path converts an
outage into silence.

---

## Phase 6 — Gate precision and cleanup

**Fixes:** high #9, medium #12, medium #13, medium #14, low #16, low #17, low #18, low #19.

**This is the highest-regression-risk phase and runs last for that reason.**

- `emailScanGates.ts:167-191` — the bare `\btotal\b` / `\bfare\b` payment assertions let
  `List-Unsubscribe` marketing mail past the pre-AI gate. **`\btotal\b` is documented in the
  code as deliberate and load-bearing** — the unknown-vendor receipt fixture contains `Total`
  and none of the other assertion terms. So the fix is *not* deletion: require the assertion
  term to sit adjacent to a parsed currency amount (the ±120-char windowed approach already
  used safely at `emailScanner.ts:2270`) rather than appearing anywhere in 2000 chars. If no
  formulation keeps that fixture green, leave it and document the quota leak as accepted.
- `emailScanner.ts:135-164` — narrow over-broad `HARD_ACCEPT_SUBJECT_PATTERNS`, notably
  `/\bcred\b/i`, which currently overrides the AI's confident rejection on subject text alone.
- `learningEngine.ts:194-208` — guard the 5-character partial-match floor against generic
  English words ("store", "market", "mobile") that match unrelated merchants via the raw
  snippet.
- `supabase/schema.sql` — fold in migrations 013–017 (`currency`, `merged_email_message_ids`,
  `email_scan_rejections.email_message_id`) so a fresh bootstrap does not fail on the first
  scan. Correct `CLAUDE.md`'s stale "next migration is `014_`" note.
- `emailScanGates.ts:177-199` — delete the dead, schema-drifted `logRejection` and its tests;
  update `CLAUDE.md`, which still describes it as the live mechanism when the real path is
  `bufferRejection`/`flushRejections`.
- `emailScanner.ts:1962-1963` — a missing `internalDate` currently defaults to `Date.now()`
  and always passes the window check. Reject and log instead of failing open.
- `api/gemini-proxy.ts:37-38` — pin CORS to known deployment origins instead of any
  `*.vercel.app`.
- `api/gemini-proxy.ts:143` — normalise the echoed fetch error message.

**Regression rule for this phase:** the gate narrowings are exactly the surface the recent
`fix:` commit run was tuning. Every narrowing is made one at a time with the full suite run
between. A narrowing that breaks a fixture is reverted and left as a documented known
limitation, not forced through by editing the fixture.

---

## Out of scope

- Currency conversion (deliberate; needs a rate source and a rate-date policy).
- Budgets / Analytics / Subscriptions currency filtering — known open surface from D6, not
  a finding in this audit.
- The audit doc's own D1a discussion is superseded: removing the feature in Phase 2 closes it.
- Dropping the now-unused `profiles.active_financial_year` column.
