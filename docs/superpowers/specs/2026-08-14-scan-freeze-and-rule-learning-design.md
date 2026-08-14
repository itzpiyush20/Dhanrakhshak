# Scan Freeze, Unbounded Body Decode, and Broken Rule Learning — Design

**Date:** 2026-08-14
**Base:** `511ba2c` (post AI-classifier hotfix)
**Trigger:** Chrome "Page Unresponsive" during a scan, at "Sorting email 62 of 108".

## Evidence

Browser console from a live scan:

```
[emailScanner] slow email: 37410ms to read body — 96KB from axismf.com — "NFO Alert…"
[emailScanner] slow email:  1332ms to read body — 11KB from cred.club
[emailScanner] slow email:   405ms to read body —  5KB from communications.sbi.co.in
Failed to load resource: …on_conflict=user_id%2Cmerchant_key — status 400  (×6)
```

Cost rises far faster than body size: 5KB→405ms, 11KB→1.3s, 96KB→37s.

## What was measured, and ruled out

Each component was benchmarked in isolation on realistic and pathological input:

| Component | Input | Result |
|---|---|---|
| `stripHtmlTagsFast` | 96KB marketing HTML | 12 ms |
| `extractAmountMatches` | 4 MB | 25 ms |
| All 14 boilerplate regexes | 12KB period-free tail | <1 ms |
| Amount regexes | 8KB digit/comma run | <1 ms |

**None can produce 37 seconds.** The parsing logic is not the hot spot. The cost is
browser-specific — most plausibly `atob` plus the byte-copy loop in `decodeBase64Url`
running once per MIME part, or GC pressure from repeatedly concatenating large strings.
That hypothesis is unconfirmed, and the design below does not depend on it being right.

## The structural flaw (certain, independent of hot spot)

Stage A checks its yield budget *between* emails (`emailScanner.ts:2068`). A single email
that blocks for 37 seconds cannot be interrupted — the budget only decides when the *next*
pause happens. `SCAN_DEADLINE_MS` is likewise only checked at stage boundaries. So any
sufficiently expensive single email freezes the tab, and no amount of yielding between
emails helps.

---

## Change 1 — Cap total decoded body per email

`extractEmailBody` (`emailScanner.ts:815-842`) bounds each part to `MAX_HTML_PARSE_CHARS`
(60,000), but accumulates across parts with **no total cap**:

```ts
if (mimeType === 'text/plain' && bodyData) plainText += decodeBase64Url(bodyData, MAX_HTML_PARSE_CHARS) + '\n'
if (mimeType === 'text/html'  && bodyData) htmlText  += decodeBase64Url(bodyData, MAX_HTML_PARSE_CHARS) + '\n'
```

A multipart email with N text parts therefore decodes up to N × 60,000 chars. `htmlText` is
sliced before parsing (line 831), but `plainText` is never sliced — it flows unbounded into
`extractAmountMatches` (833) and into the returned body (836-838). That is why a newsletter
produces a 96KB body when the documented ceiling is 60KB.

**Fix:** enforce a single total budget across the whole traversal. Stop decoding further
parts once it is reached, and slice `plainText` on the way out exactly as `htmlText`
already is. Bounds worst-case work per email at roughly one part's cost rather than N.

**Test:** a synthetic multipart payload with 40 text parts asserts the returned body never
exceeds the cap and that traversal stops early.

## Change 2 — Report which phase was slow

The current warning names a duration but not a cause, which is what made this cost four
separate benchmark rounds to narrow. Time the three phases separately — decode, HTML
strip, boilerplate strip — and name the worst one in the warning.

Deliberately kept as a `console.warn`, not a new telemetry surface: it is a debugging aid
for a rare pathological email, not something the user acts on.

**Test:** none. This is diagnostic output with no behavioural contract; a test asserting
log text would pin formatting without protecting anything.

## Change 3 — Migration 020, restore rule learning

`learningEngine.ts:148` upserts with `{ onConflict: 'user_id,merchant_key' }`. PostgREST
answers **400** when no unique constraint matches that specification, and the console shows
exactly that, six times per page load.

`schema.sql:386` does declare `UNIQUE(user_id, merchant_key)` — but inside
`CREATE TABLE IF NOT EXISTS public.merchant_rules`. On any database where the table predates
that line, the statement was a no-op and the constraint was never added. Same class as audit
finding #9: drift hidden behind `IF NOT EXISTS`.

**Consequence, which is worse than the noise:** every merchant-rule write fails. The scanner
has not been learning from the user's category corrections at all.

**Fix:** migration `supabase/020_merchant_rules_unique.sql` adding the constraint only if
absent, mirroring the guarded `DO $$` pattern already used for
`transactions_email_message_id_user_id_key` in `schema.sql`. Duplicate `(user_id,
merchant_key)` rows must be collapsed first, keeping the highest `times_confirmed`, or the
constraint cannot be added.

**Test:** covered by applying the migration and confirming the upsert returns 2xx; no unit
test, since the failure lives in the database rather than in application logic.

---

## Deferred: moving body extraction to a Web Worker

The correct structural fix. Synchronous main-thread parsing can always be beaten by a
large enough email, and Change 1 only reduces the constant factor.

Deliberately not done now: it is a substantial change — worker plumbing, message passing,
an async scan loop — and it would be built on a hypothesis that four benchmarks failed to
confirm. If the freeze survives Change 1, Change 2 will name the phase responsible, and a
worker can then be justified by evidence.

## Out of scope

- The `Gmail auto-sync timed out` warning, unless it persists once scans are fast.
- Any change to gate ordering, the AI ladder, or duplicate handling.

## Invariants

Unchanged from `CLAUDE.md`: nothing auto-approves; gate order holds; AI failure degrades to
the regex ladder; rejection logging stays fire-and-forget; the `23505` insert fallback is
reused, not rewritten. Change 1 alters how much body text is read, never which gates run or
in what order.
