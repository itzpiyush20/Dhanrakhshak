# Scanner Hardening Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three verified gaps in the email scan pipeline: trusted senders bypass the bulk-marketing gate entirely, transient Gmail fetch failures are silently and untraceably dropped, and a single racing row can sink an entire batch of otherwise-valid transactions.

**Architecture:** A1 removes one condition from an existing gate (no new code). B1 wraps an existing fetch call with the existing `retryWithBackoff` utility. B2 adds a fallback path to an existing insert call, triggered only on the specific Postgres unique-violation error code.

**Tech Stack:** TypeScript, Vitest, existing Gmail-mocked integration test harness in `emailScanner.test.ts`.

**Task dependency order:** Tasks 1, 2, and 3 touch disjoint regions of `emailScanner.ts` (the gate conditions, the fetch loop, the insert call) and are independent — they may run in parallel. Task 4 is final verification.

---

## Task 1: Remove the trusted-sender exemption from the bulk-mail gate

**Files:**
- Modify: `src/services/emailScanner.ts` (two gate conditions)
- Create: `src/services/__fixtures__/bankMarketingFromTrustedSender.ts`
- Modify: `src/services/emailScanGates.test.ts`
- Modify: `src/services/emailScanner.test.ts`

- [ ] **Step 1: Create the fixture**

Match the structure of `src/services/__fixtures__/unknownVendorReceipt.ts` exactly (exported subject/from/body constants, local `toBase64Url` helper, `make…GmailMessage()` factory). Open that file first to confirm the exact shape before writing this one.

```typescript
// src/services/__fixtures__/bankMarketingFromTrustedSender.ts
//
// A marketing email from a TRUSTED sender domain (a bank already in
// TRUSTED_SENDER_DOMAINS). Proves the bulk-mail gate must not exempt trusted
// senders — banks send cashback/upsell marketing from the same domains as
// their real transaction alerts, and that marketing carries the same
// List-Unsubscribe signal any other bulk mail does.

export const BANK_MARKETING_SUBJECT = 'Get up to Rs.5000 cashback on your new HDFC Credit Card'

export const BANK_MARKETING_FROM = 'HDFC Bank Offers <offers@alerts.hdfcbank.com>'

export const BANK_MARKETING_BODY = `Dear Customer,

Apply for the new HDFC Millennia Credit Card and get up to Rs.5000 cashback on your first purchase. Limited period offer.

Enjoy 5% cashback on Amazon, Flipkart, and Swiggy. No annual fee for the first year.

Apply Now

This is a promotional email. If you no longer wish to receive offers from HDFC Bank, you can opt out of this newsletter at any time.`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the trusted-sender bank marketing email. */
export function makeBankMarketingGmailMessage(id = 'msg-bank-marketing-1') {
  return {
    id,
    threadId: 'thread-bank-marketing-1',
    snippet: 'Apply for the new HDFC Millennia Credit Card and get up to Rs.5000 cashback on your first purchase...',
    internalDate: String(Date.UTC(2026, 7, 10, 11, 0, 0)),
    payload: {
      headers: [
        { name: 'Subject', value: BANK_MARKETING_SUBJECT },
        { name: 'From', value: BANK_MARKETING_FROM },
        { name: 'List-Unsubscribe', value: '<https://hdfcbank.com/unsubscribe>' },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(BANK_MARKETING_BODY) },
    },
  }
}
```

Note: `TRUSTED_SENDER_DOMAINS` in `emailScanner.ts` (line 96) already lists `alerts.hdfcbank.com` directly. The scanner extracts the sender domain via `fromValue.match(/@([\w.-]+)>?/i)`, which requires an `@domain` shape — `BANK_MARKETING_FROM` above is already formatted as `offers@alerts.hdfcbank.com` so the extracted domain matches the whitelist entry exactly. No further verification needed on this point.

- [ ] **Step 2: Write the failing gate-composition test**

Append to `src/services/emailScanGates.test.ts`:

```typescript
import { BANK_MARKETING_BODY } from './__fixtures__/bankMarketingFromTrustedSender'

describe('bulk-mail gate — trusted-sender marketing', () => {
  it('flags trusted-sender marketing as bulk (List-Unsubscribe present)', () => {
    const headers = [{ name: 'List-Unsubscribe', value: '<https://hdfcbank.com/unsubscribe>' }]
    expect(isBulkMarketingEmail(headers, BANK_MARKETING_BODY)).toBe(true)
  })

  it('has no payment assertion in bank marketing copy', () => {
    expect(hasPaymentAssertion(BANK_MARKETING_BODY)).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify current behavior (informational — this should already pass)**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: PASS — these two helpers are sender-agnostic already (built in the prior round), so this step just confirms the fixture is well-formed before wiring the pipeline change.

- [ ] **Step 4: Write the failing integration test**

Append to `src/services/emailScanner.test.ts`, alongside the existing newsletter-rejection tests (add the import at the top with the other fixture imports):

```typescript
import { makeBankMarketingGmailMessage } from './__fixtures__/bankMarketingFromTrustedSender'
```

```typescript
describe('scanRealGmailInbox — trusted-sender marketing', () => {
  it('rejects marketing from a trusted bank domain (no more exemption)', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bank-marketing-1', threadId: 'thread-bank-marketing-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bank-marketing-1')) {
        return { ok: true, status: 200, json: async () => makeBankMarketingGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_evidence')
  })
})
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/services/emailScanner.test.ts -t "trusted-sender marketing"`
Expected: FAIL — the trusted-sender exemption currently lets this email skip the gate and fall through to `askAI` (mocked to `null`) and then the regex path, likely inserting a low-confidence pending transaction instead of being rejected outright.

- [ ] **Step 6: Remove the exemption**

In `src/services/emailScanner.ts`, find the pre-AI gate (added in the prior round, reads roughly):

```typescript
      const isBulkMail = isBulkMarketingEmail(mail.payload?.headers || [], bodyText)
      if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(emailContentForParsing)) {
```

Change to:

```typescript
      const isBulkMail = isBulkMarketingEmail(mail.payload?.headers || [], bodyText)
      if (isBulkMail && !hasPaymentAssertion(emailContentForParsing)) {
```

Find the amount-proximity gate (also from the prior round, reads roughly):

```typescript
        if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(windowContent)) {
```

Change to:

```typescript
        if (isBulkMail && !hasPaymentAssertion(windowContent)) {
```

Update the comment immediately above the pre-AI gate if it references the trusted-sender exemption, to reflect that the gate now applies uniformly.

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run src/services/emailScanner.test.ts -t "trusted-sender marketing"`
Expected: PASS

- [ ] **Step 8: Run the full scanner regression suite**

Run: `npx vitest run src/services/emailScanner.test.ts`
Expected: PASS — including the `axisEmiDebit`, `uberTripReceipt`, `zomatoOrderReceipt`, `unknownVendorReceipt` regression tests from the prior round, all still producing their transactions unchanged. If `axisEmiDebit` starts failing, STOP — that means the real-bank fixture unexpectedly trips the bulk-mail signal, which contradicts this plan's safety argument, and needs investigation before proceeding, not a workaround.

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanGates.test.ts src/services/emailScanner.test.ts src/services/__fixtures__/bankMarketingFromTrustedSender.ts
git commit -m "fix: close trusted-sender bypass of the bulk-marketing gate"
```

---

## Task 2: Retry Gmail message fetch on transient failure

**Files:**
- Modify: `src/services/emailScanner.ts` (the per-message fetch loop)
- Modify: `src/services/emailScanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/emailScanner.test.ts`:

```typescript
describe('scanRealGmailInbox — transient fetch failure handling', () => {
  it('retries a message fetch that returns 429 and succeeds on a later attempt', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    let messageFetchAttempts = 0
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }) } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        messageFetchAttempts++
        if (messageFetchAttempts < 3) {
          return { ok: false, status: 429, json: async () => ({}) } as any
        }
        return { ok: true, status: 200, json: async () => makeAxisEmiGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(messageFetchAttempts).toBe(3)
    expect(insertedTransactions).toHaveLength(1)
  })

  it('logs a fetch_failed rejection and drops the message when retries exhaust', async () => {
    const insertedTransactions: any[] = []
    const insertedRejections: any[] = []
    const mockDb = makeMockDb(insertedTransactions, insertedRejections)

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }) } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        return { ok: false, status: 429, json: async () => ({}) } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('fetch_failed')
  }, 15000)
})
```

The second test's retry-and-backoff delays will run for real (2 retries at 500ms/1000ms per the implementation in Step 2 below — under 2 seconds total), so a 15-second test timeout is set explicitly to avoid flakiness on a slow CI runner; do not reduce the actual backoff delays just to speed up this test.

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run src/services/emailScanner.test.ts -t "transient fetch failure"`
Expected: FAIL — current code has no retry, so the first test's `messageFetchAttempts` stays at 1 and no transaction is inserted; the second test finds no `fetch_failed` gate since failures aren't logged today.

- [ ] **Step 3: Add the retry import**

In `src/services/emailScanner.ts`, find the existing import from `@/utils` (or add one if none exists — check the top of the file for the current import list) and add `retryWithBackoff`:

```typescript
import { extractBankName, retryWithBackoff } from '../utils/index.js'
```

(Adjust to match whatever the existing `extractBankName` import line actually looks like — add `retryWithBackoff` to that same import rather than creating a duplicate import line.)

- [ ] **Step 4: Wrap the fetch call with retry, and log on exhaustion**

Find the per-message fetch inside the batch loop:

```typescript
      const batchResults = await Promise.all(
        batch.map(async (m: { id: string }) => {
          try {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
              { headers: { Authorization: `Bearer ${providerToken}` } }
            )
            if (res.status === 401 || res.status === 403) {
              tokenExpiredDuringBatch = true
              return null
            }
            if (!res.ok) return null
            return await res.json()
          } catch { return null }
        })
      )
```

Replace with:

```typescript
      const batchResults = await Promise.all(
        batch.map(async (m: { id: string }) => {
          try {
            const res = await retryWithBackoff(async () => {
              const r = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`,
                { headers: { Authorization: `Bearer ${providerToken}` } }
              )
              // 401/403 are auth failures, not transient — surface immediately,
              // don't burn retries on a token that isn't coming back this batch.
              if (r.status === 401 || r.status === 403) return r
              // 429/5xx are transient — throwing here is what makes
              // retryWithBackoff retry; anything else (2xx, 4xx other than
              // 401/403) returns normally and is handled below.
              if (r.status === 429 || r.status >= 500) {
                throw new Error(`Transient Gmail fetch failure: ${r.status}`)
              }
              return r
            }, 2, 500)

            if (res.status === 401 || res.status === 403) {
              tokenExpiredDuringBatch = true
              return null
            }
            if (!res.ok) return null
            return await res.json()
          } catch {
            logRejection(supabase, user.id, scanLogId, 'fetch_failed', '', '', `messageId=${m.id}`)
            return null
          }
        })
      )
```

- [ ] **Step 5: Run to verify both tests pass**

Run: `npx vitest run src/services/emailScanner.test.ts -t "transient fetch failure"`
Expected: PASS

- [ ] **Step 6: Run the full scanner regression suite**

Run: `npx vitest run src/services/emailScanner.test.ts`
Expected: PASS — including all fixture-based regression tests, unaffected since they return `ok: true` on the first attempt and never enter the retry path.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanner.test.ts
git commit -m "fix: retry transient Gmail fetch failures instead of silently dropping messages"
```

---

## Task 3: Isolate the batch transaction insert against a single conflicting row

**Files:**
- Modify: `src/services/emailScanner.ts` (the final insert call)
- Modify: `src/services/emailScanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/emailScanner.test.ts`:

```typescript
describe('scanRealGmailInbox — batch insert fault isolation', () => {
  it('falls back to per-row insert when the batch hits a unique-constraint conflict, keeping the non-conflicting rows', async () => {
    const insertedRejections: any[] = []
    let batchInsertAttempted = false
    const perRowInserted: any[] = []

    const mockDb: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        const baseHandler: any = {
          select: () => baseHandler,
          eq: () => baseHandler,
          order: () => baseHandler,
          limit: () => baseHandler,
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        if (table === 'profiles') return baseHandler
        if (table === 'email_scan_logs') {
          return {
            ...baseHandler,
            insert: (row: any) => ({ select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
          }
        }
        if (table === 'cards') return baseHandler
        if (table === 'categories') return { ...baseHandler, then: (resolve: any) => resolve({ data: [{ name: 'Food & Dining', is_permanent: false }, { name: 'Other', is_permanent: true }], error: null }) }
        if (table === 'email_scan_rejections') {
          return { ...baseHandler, insert: (row: any) => { insertedRejections.push(row); return Promise.resolve({ error: null }) } }
        }
        if (table === 'transactions') {
          return {
            ...baseHandler,
            insert: (rows: any) => {
              const rowArray = Array.isArray(rows) ? rows : [rows]
              if (rowArray.length > 1) {
                batchInsertAttempted = true
                return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }
              }
              // Per-row fallback: second row (the one "already inserted by another scan") conflicts, first succeeds.
              const row = rowArray[0]
              if (perRowInserted.length === 1) {
                return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }
              }
              perRowInserted.push(row)
              return { select: () => Promise.resolve({ data: [row], error: null }) }
            },
          }
        }
        return baseHandler
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 't1' }, { id: 'msg-zomato-order-1', threadId: 't2' }] }) } as any
      }
      if (url.includes('/messages/msg-uber-trip-1')) {
        return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      }
      if (url.includes('/messages/msg-zomato-order-1')) {
        return { ok: true, status: 200, json: async () => makeZomatoOrderGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(batchInsertAttempted).toBe(true)
    expect(result.error).toBeNull()
    // One of the two rows conflicted and was skipped; the other succeeded —
    // the scan must not throw and must not lose the non-conflicting row.
    expect(perRowInserted).toHaveLength(1)
  })

  it('still throws on a non-conflict database error', async () => {
    const mockDb: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } } }) },
      from: (table: string) => {
        const baseHandler: any = {
          select: () => baseHandler, eq: () => baseHandler, order: () => baseHandler, limit: () => baseHandler,
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        if (table === 'profiles') return baseHandler
        if (table === 'cards') return baseHandler
        if (table === 'categories') return { ...baseHandler, then: (resolve: any) => resolve({ data: [{ name: 'Transport', is_permanent: false }, { name: 'Other', is_permanent: true }], error: null }) }
        if (table === 'email_scan_rejections') return { ...baseHandler, insert: () => Promise.resolve({ error: null }) }
        if (table === 'email_scan_logs') return { ...baseHandler, insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }
        if (table === 'transactions') {
          return { ...baseHandler, insert: () => ({ select: () => Promise.resolve({ data: null, error: { code: '500', message: 'connection reset' } }) }) }
        }
        return baseHandler
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-uber-trip-1', threadId: 't1' }] }) } as any
      }
      if (url.includes('/messages/msg-uber-trip-1')) {
        return { ok: true, status: 200, json: async () => makeUberTripGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npx vitest run src/services/emailScanner.test.ts -t "batch insert fault isolation"`
Expected: first test FAILS (current code throws on the batch `23505` and never falls back to per-row, so `result.error` is not null and the scan reports failure instead of the partial success asserted). Second test likely already passes today (unchanged non-`23505` throw behavior) — confirm it does; if it doesn't, investigate before proceeding.

- [ ] **Step 3: Add per-row fallback to the insert call**

Find:

```typescript
    const { data: insertedTxns, error: txnError } = await supabase
      .from('transactions')
      .insert(transactionsToInsert)
      .select()

    if (txnError) throw txnError
```

Replace with:

```typescript
    let insertedTxns: any[] = []
    const { data: batchInsertedTxns, error: batchTxnError } = await supabase
      .from('transactions')
      .insert(transactionsToInsert)
      .select()

    if (batchTxnError) {
      // 23505 = Postgres unique_violation. transactions_email_message_id_user_id_key
      // (schema.sql:493-495) exists precisely to stop two concurrent scans from
      // double-inserting the same email — but a batch insert throws on the WHOLE
      // batch if even one row trips it, discarding every unrelated legitimate
      // transaction alongside it. Fall back to inserting row-by-row so only the
      // actually-conflicting row (already inserted by the other scan) is skipped.
      if (batchTxnError.code === '23505') {
        for (const txn of transactionsToInsert) {
          const { data: rowData, error: rowError } = await supabase
            .from('transactions')
            .insert(txn)
            .select()
          if (rowError) {
            if (rowError.code === '23505') continue // already inserted by a concurrent scan — not a fault
            throw rowError // any other error on an individual row still fails loud
          }
          if (rowData) insertedTxns.push(...rowData)
        }
      } else {
        throw batchTxnError // non-conflict error — unchanged fail-loud behavior
      }
    } else {
      insertedTxns = batchInsertedTxns || []
    }
```

- [ ] **Step 4: Run to verify both tests pass**

Run: `npx vitest run src/services/emailScanner.test.ts -t "batch insert fault isolation"`
Expected: PASS

- [ ] **Step 5: Run the full scanner regression suite**

Run: `npx vitest run src/services/emailScanner.test.ts`
Expected: PASS — all existing tests use a mock `insert` that succeeds on the first (batch) call, so none of them exercise the new fallback branch and all should be unaffected.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanner.test.ts
git commit -m "fix: isolate batch transaction insert from a single conflicting row"
```

---

## Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — every file green, including all new tests from Tasks 1-3 and every existing regression fixture.

- [ ] **Step 2: TypeScript build**

Run: `npx tsc -b`
Expected: PASS — no output

- [ ] **Step 3: Lint check for newly introduced problems**

Run: `npm run lint`
Expected: the repository has a pre-existing baseline of lint errors. Confirm no *new* errors reference `emailScanner.ts`, `emailScanGates.test.ts`, `emailScanner.test.ts`, or the new fixture file. Verify any hit in those files is pre-existing with `git log -1 -L <line>,<line>:<file>` before treating it as introduced.
