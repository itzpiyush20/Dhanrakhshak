# Newsletter False-Positive Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop marketing/newsletter emails from being turned into transactions, for any user and any publisher, without breaking vendor-agnostic receipt detection.

**Architecture:** Two pure, independently testable helpers (`isBulkMarketingEmail`, `hasPaymentAssertion`) in `emailScanGates.ts`. They compose into one rejection rule applied at two points in `emailScanner.ts`: before the AI call (so junk never consumes AI quota) and again against the text surrounding the extracted amount. Separately, `KNOWN_MERCHANTS` matching is anchored to the subject plus the amount's neighbourhood instead of scanning the whole email, and the AI path gains a marketing-rejection prompt rule plus a confidence floor.

**Tech Stack:** TypeScript, Vitest, existing Gmail-mocked integration test harness in `emailScanner.test.ts`.

**Task dependency order:** Tasks 1, 2, and 3 are independent and may run in parallel. Task 4 depends on all three (it imports the helpers and both fixtures). Task 5 is final verification.

---

## Task 1: Bulk-mail and payment-assertion helpers

**Files:**
- Modify: `src/services/emailScanGates.ts` (add two exported functions above the existing `logRejection`)
- Modify: `src/services/emailScanGates.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/services/emailScanGates.test.ts`. Add `isBulkMarketingEmail, hasPaymentAssertion` to the existing import from `./emailScanGates`, and add these imports at the top of the file:

```typescript
import { UBER_TRIP_BODY } from './__fixtures__/uberTripReceipt'
import { ZOMATO_ORDER_BODY } from './__fixtures__/zomatoOrderReceipt'
import { UNKNOWN_VENDOR_BODY } from './__fixtures__/unknownVendorReceipt'
```

If any of those exported constant names differ in the fixture files, use the actual exported body constant from each file instead — check the fixture's exports first.

```typescript
describe('isBulkMarketingEmail', () => {
  it('detects a List-Unsubscribe header', () => {
    const headers = [
      { name: 'Subject', value: 'Anything' },
      { name: 'List-Unsubscribe', value: '<https://example.com/u>' },
    ]
    expect(isBulkMarketingEmail(headers, 'plain body')).toBe(true)
  })

  it('detects a List-Unsubscribe-Post header regardless of casing', () => {
    const headers = [{ name: 'list-unsubscribe-post', value: 'List-Unsubscribe=One-Click' }]
    expect(isBulkMarketingEmail(headers, 'plain body')).toBe(true)
  })

  it('detects opt-out phrasing in the body when no header is present', () => {
    expect(isBulkMarketingEmail([], 'Some content. Opt out of this newsletter.')).toBe(true)
    expect(isBulkMarketingEmail([], 'You are receiving this email because you signed up.')).toBe(true)
    expect(isBulkMarketingEmail([], 'Click here to unsubscribe')).toBe(true)
  })

  it('returns false for an ordinary transactional body with no headers', () => {
    expect(isBulkMarketingEmail([], 'Rs.250 debited from your account.')).toBe(false)
  })

  it('treats missing headers and empty body as not bulk (fail open)', () => {
    expect(isBulkMarketingEmail([], '')).toBe(false)
  })

  it('does not flag any of the genuine receipt fixtures', () => {
    expect(isBulkMarketingEmail([], UBER_TRIP_BODY)).toBe(false)
    expect(isBulkMarketingEmail([], ZOMATO_ORDER_BODY)).toBe(false)
    expect(isBulkMarketingEmail([], UNKNOWN_VENDOR_BODY)).toBe(false)
  })
})

describe('hasPaymentAssertion', () => {
  it('matches explicit money-movement verbs', () => {
    expect(hasPaymentAssertion('Rs.250 debited from your account')).toBe(true)
    expect(hasPaymentAssertion('Amount credited to your wallet')).toBe(true)
    expect(hasPaymentAssertion('You paid Rs.100')).toBe(true)
    expect(hasPaymentAssertion('Your card was charged')).toBe(true)
  })

  it('matches receipt vocabulary', () => {
    expect(hasPaymentAssertion('Total ₹120.00')).toBe(true)
    expect(hasPaymentAssertion('Trip fare ₹224.76')).toBe(true)
  })

  it('accepts every genuine receipt fixture', () => {
    expect(hasPaymentAssertion(UBER_TRIP_BODY)).toBe(true)
    expect(hasPaymentAssertion(ZOMATO_ORDER_BODY)).toBe(true)
    // Load-bearing: this fixture contains 'Total' and none of the other
    // vocabulary. A stricter list would silently break unknown-vendor detection.
    expect(hasPaymentAssertion(UNKNOWN_VENDOR_BODY)).toBe(true)
  })

  it('rejects subscription-advertisement pricing copy', () => {
    const promo = 'save 41% ₹ 6,000 Blueprint Digital ₹ 3,500 annual (digital only) ₹ 291/Month Subscribe Now'
    expect(hasPaymentAssertion(promo)).toBe(false)
  })

  it('returns false for empty text', () => {
    expect(hasPaymentAssertion('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: FAIL — `isBulkMarketingEmail is not a function` / `hasPaymentAssertion is not a function`

- [ ] **Step 3: Implement the helpers**

In `src/services/emailScanGates.ts`, insert immediately after the `evaluateRegexGates` function (before the `import type { SupabaseClient }` line):

```typescript
/**
 * Bulk/marketing distribution markers. `List-Unsubscribe` is mandated for
 * high-volume senders by Gmail's and Yahoo's bulk-sender requirements, while
 * transactional receipts are exempt and typically omit it — so this is a
 * structural signal that generalizes to any publisher, not a per-vendor list.
 */
const BULK_BODY_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bopt[-\s]?out\b/i,
  /manage\s+(?:your\s+)?(?:email\s+)?preferences/i,
  /you\s+(?:are|were)\s+receiving\s+this\s+(?:email|message)\s+because/i,
  /view\s+(?:this\s+)?(?:email\s+)?in\s+(?:your\s+)?browser/i,
]

/**
 * True when the message carries bulk/marketing distribution markers.
 * Fails open (returns false) on missing headers or empty body, so a malformed
 * message degrades to existing behaviour rather than being silently dropped.
 *
 * `bodyText` should be the FULL body, not a truncated prefix — opt-out text
 * lives in footers, past where the other gates stop reading.
 */
export function isBulkMarketingEmail(
  headers: Array<{ name?: string; value?: string }> | null | undefined,
  bodyText: string | null | undefined
): boolean {
  for (const h of headers || []) {
    const name = (h?.name || '').toLowerCase()
    if (name === 'list-unsubscribe' || name === 'list-unsubscribe-post') return true
  }
  const text = bodyText || ''
  if (!text) return false
  return BULK_BODY_PATTERNS.some((p) => p.test(text))
}

/**
 * Vocabulary asserting that money actually moved. `total` is deliberately
 * included and is load-bearing: the unknown-vendor receipt fixture contains
 * `Total` and none of the other terms, so removing it breaks detection for
 * exactly the long-tail vendors this pipeline exists to support.
 */
const PAYMENT_ASSERTION_PATTERNS: RegExp[] = [
  /\bdebited\b/i,
  /\bcredited\b/i,
  /\bpaid\b/i,
  /\bcharged\b/i,
  /\bspent\b/i,
  /\bwithdrawn\b/i,
  /\btransferred\b/i,
  /\bdeducted\b/i,
  /\bbilled\b/i,
  /\bsub\s*total\b/i,
  /\btotal\b/i,
  /\bamount\s+paid\b/i,
  /\bpayment\s+of\b/i,
  /\bfare\b/i,
  /\btxn\b/i,
  /\btransaction\s+id\b/i,
]

/** True when the text asserts that money actually moved. */
export function hasPaymentAssertion(text: string | null | undefined): boolean {
  if (!text) return false
  return PAYMENT_ASSERTION_PATTERNS.some((p) => p.test(text))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: PASS — all existing gate tests plus the new ones

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/emailScanGates.ts src/services/emailScanGates.test.ts
git commit -m "feat: add bulk-mail and payment-assertion detection helpers"
```

---

## Task 2: Newsletter test fixtures

**Files:**
- Create: `src/services/__fixtures__/businessStandardNewsletter.ts`
- Create: `src/services/__fixtures__/bulkMailWithPaymentProse.ts`

Both follow the existing fixture shape — read `src/services/__fixtures__/unknownVendorReceipt.ts` first and match its structure exactly (exported subject/from/body constants, a `toBase64Url` helper, and a `make…GmailMessage()` factory returning a mocked Gmail `messages.get` payload).

- [ ] **Step 1: Create the Business Standard newsletter fixture**

```typescript
// src/services/__fixtures__/businessStandardNewsletter.ts
//
// Sanitized body of a REAL email that was wrongly turned into a ₹6,000
// transaction (Gmail thread 19feaf8841f4a9ee, 2026-08-10). It is a magazine
// subscription advertisement: the ₹6,000 is a struck-through list price in a
// pricing table, not a payment. Retains the pricing table and the newsletter
// footer that make it identifiable as bulk marketing.

export const BS_NEWSLETTER_SUBJECT = 'Blueprint Magazine- August issue is Live'

export const BS_NEWSLETTER_FROM = 'Business Standard <bsemailservices@business-standard.net.in>'

export const BS_NEWSLETTER_BODY = `The headlines report what happened. Blueprint explains why - the calculations, the alliances, the long game behind the day's news.

save 41%
₹ 6,000
Blueprint Digital ₹ 3,500
annual (digital only) ₹ 291/Month

save 62%
₹ 12,000
Blueprint Complete ₹ 4,500
annual (digital & print) ₹ 375/Month

Subscribe Now

Blueprint Magazine August issue

An unfinished mission
India's aeroengine ambitions are at an inflexion point

The long overhaul
Integrated battle groups will change the army's land warfare tactics, experts say

What is the point of Brics?
While India jostles China for influence, some see the bloc as relevant in the Trump era

For more insights, get the BS app now!

For subscription assistance email at assist@bsmail.in

If this is in your Spam/ Junk/ Promotions folder, move it to your Inbox to avoid missing it.

Opt out of this newsletter`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Business Standard newsletter. */
export function makeBusinessStandardGmailMessage(id = 'msg-bs-newsletter-1') {
  return {
    id,
    threadId: 'thread-bs-newsletter-1',
    snippet: "The headlines report what happened. Blueprint explains why - the calculations, the alliances, the long game behind the day's news. save 41% ₹ 6000 Blueprint Digital ₹ 3500 annual (digital only) ₹",
    internalDate: String(Date.UTC(2026, 7, 10, 9, 11, 32)),
    payload: {
      headers: [
        { name: 'Subject', value: BS_NEWSLETTER_SUBJECT },
        { name: 'From', value: BS_NEWSLETTER_FROM },
        { name: 'List-Unsubscribe', value: '<https://business-standard.net.in/unsubscribe>' },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(BS_NEWSLETTER_BODY) },
    },
  }
}
```

- [ ] **Step 2: Create the payment-prose newsletter fixture**

```typescript
// src/services/__fixtures__/bulkMailWithPaymentProse.ts
//
// Synthetic newsletter that DOES contain payment vocabulary — but only in
// article prose, far from the ₹ figure. Proves the amount-proximity gate
// catches what the pre-AI gate deliberately lets through, since the pre-AI
// gate scans the whole message and would find "paid" here.

export const BULK_PROSE_SUBJECT = 'Markets Weekly: what moved and why'

export const BULK_PROSE_FROM = 'Markets Weekly <digest@marketsweekly.example>'

export const BULK_PROSE_BODY = `Markets Weekly

In this issue we look at how the country's largest infrastructure firms paid down debt through a difficult quarter, and what that means for the sector.

Analysts remain divided. One house has charged that the recovery is uneven.

${'Filler commentary to separate the payment prose above from the figure below. '.repeat(12)}

Shares of the company closed at ₹ 95.30 on Friday, up marginally on the week.

You are receiving this email because you signed up at marketsweekly.example.
Click here to unsubscribe.`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the payment-prose newsletter. */
export function makeBulkProseGmailMessage(id = 'msg-bulk-prose-1') {
  return {
    id,
    threadId: 'thread-bulk-prose-1',
    snippet: 'Markets Weekly. In this issue we look at how the largest infrastructure firms paid down debt...',
    internalDate: String(Date.UTC(2026, 7, 10, 10, 0, 0)),
    payload: {
      headers: [
        { name: 'Subject', value: BULK_PROSE_SUBJECT },
        { name: 'From', value: BULK_PROSE_FROM },
        { name: 'List-Unsubscribe', value: '<https://marketsweekly.example/u>' },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(BULK_PROSE_BODY) },
    },
  }
}
```

- [ ] **Step 3: Verify the fixtures compile and nothing regressed**

Run: `npx vitest run`
Expected: PASS (no test imports them yet — this only confirms they parse)

- [ ] **Step 4: Commit**

```bash
git add src/services/__fixtures__/businessStandardNewsletter.ts src/services/__fixtures__/bulkMailWithPaymentProse.ts
git commit -m "test: add newsletter false-positive fixtures"
```

---

## Task 3: AI prompt marketing-rejection rule

**Files:**
- Modify: `src/services/aiService.ts` (the STRICT RULES block inside `analyzeTransactionEmailWithAI`)
- Modify: `src/services/aiService.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/services/aiService.test.ts`. It calls `analyzeTransactionEmailWithAI` with an injected fake `callGemini` that captures the prompt rather than making a network call (this is the 4th positional parameter — check the existing test in the file for the established calling convention and match it).

```typescript
describe('analyzeTransactionEmailWithAI — marketing rejection rule', () => {
  it('includes a rule rejecting subscription/pricing-table marketing', async () => {
    let capturedPrompt = ''
    const fakeCallGemini = async (body: any) => {
      capturedPrompt = body?.contents?.[0]?.parts?.[0]?.text || ''
      return { candidates: [{ content: { parts: [{ text: '{"is_transaction":false,"confidence_score":0}' }] } }] }
    }

    await analyzeTransactionEmailWithAI('Subject', 'Body', '2026-08-10', fakeCallGemini)

    expect(capturedPrompt).toMatch(/pricing tiers/i)
    expect(capturedPrompt).toMatch(/subscribe now/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/aiService.test.ts`
Expected: FAIL — the prompt contains neither string

- [ ] **Step 3: Add the rule to the prompt**

In `src/services/aiService.ts`, inside the `STRICT RULES — set is_transaction to FALSE for ALL of:` list, add this line immediately after the existing `- Promotional emails, cashback OFFERS (not credits), discount codes, coupons` line:

```
- Subscription or product marketing showing pricing tiers, percentage discounts ("save 41%"), struck-through "was" prices, or "Subscribe Now"/"Upgrade Now"/"Choose your plan" calls to action — an advertisement for a purchase the reader has NOT made is not a receipt, and its prices are not transaction amounts
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/aiService.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/aiService.ts src/services/aiService.test.ts
git commit -m "feat: teach the AI classifier to reject subscription marketing emails"
```

---

## Task 4: Wire the gates into the scan pipeline

**Files:**
- Modify: `src/services/emailScanner.ts`
- Modify: `src/services/emailScanner.test.ts` (extend)

Depends on Tasks 1, 2, and 3 being merged first. All line numbers below are pre-change references — locate by the quoted content, not the number.

- [ ] **Step 1: Update the gate import**

Change the existing import (currently line 15):

```typescript
import { evaluateRegexGates, logRejection } from './emailScanGates.js'
```

to:

```typescript
import { evaluateRegexGates, logRejection, isBulkMarketingEmail, hasPaymentAssertion } from './emailScanGates.js'
```

- [ ] **Step 2: Add the pre-AI bulk gate**

Find the end of the content-preparation block inside the `for (const mail of validDetails)` loop:

```typescript
      const strippedBodyText = stripBoilerplate(bodyText)
      const fullText = `${subject} ${strippedBodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)

      let parsedTxn: TransactionInsert | null = null
      let aiConfidentReject = false
```

and insert the gate between `emailContentForParsing` and `let parsedTxn`:

```typescript
      const strippedBodyText = stripBoilerplate(bodyText)
      const fullText = `${subject} ${strippedBodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)

      // Bulk marketing with no payment language anywhere is an advertisement,
      // not a receipt. Rejected BEFORE the AI call so newsletters never consume
      // the daily AI scan quota — a newsletter-heavy inbox would otherwise
      // exhaust it on junk and force genuine receipts onto the regex fallback.
      // All three conditions are required: banks bypass on the first, and
      // genuine receipts bypass on the second (they carry no bulk markers).
      // `bodyText` is passed unstripped and untruncated on purpose — opt-out
      // text lives in footers, past where the other gates stop reading.
      const isBulkMail = isBulkMarketingEmail(mail.payload?.headers || [], bodyText)
      if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(emailContentForParsing)) {
        logRejection(supabase, user.id, scanLogId, 'bulk_mail_no_payment_evidence', senderDomain, subject, subject.substring(0, 120))
        continue
      }

      let parsedTxn: TransactionInsert | null = null
      let aiConfidentReject = false
```

- [ ] **Step 3: Add the AI confidence floor**

Inside the AI accept branch, find:

```typescript
              const approval_status = ruleResult.approval_status
```

and replace with:

```typescript
              // The prompt tells the model to score 0-59 for "uncertain cases
              // (these will be reviewed or rejected)", but this call site never
              // read the score. Honour that contract: still insert (never
              // silently drop), but pin it to pending explicitly here rather
              // than relying on applyMerchantRulesFromDB's invariant.
              const aiLowConfidence =
                typeof aiResult.confidence_score === 'number' && aiResult.confidence_score < 60
              if (aiLowConfidence) {
                logRejection(supabase, user.id, scanLogId, 'ai_low_confidence', senderDomain, subject, `confidence=${aiResult.confidence_score}`)
              }
              const approval_status = aiLowConfidence ? 'pending' : ruleResult.approval_status
```

- [ ] **Step 4: Add the amount-proximity gate**

Find the window computation in the regex path:

```typescript
        const winStart = Math.max(0, resolvedMatch.index - 120)
        const winEnd = Math.min(emailContentForParsing.length, resolvedMatch.index + resolvedMatch.text.length + 120)
        const windowContent = emailContentForParsing.substring(winStart, winEnd).toLowerCase()
        const lowerContent = emailContentForParsing.toLowerCase()
```

and insert immediately after it:

```typescript
        // Second form of the pre-AI gate, now that an amount exists. Catches
        // bulk mail that mentions payments somewhere in an article but whose
        // *amount* is editorial — a share price or an advertised list price.
        if (!isTrustedSender && isBulkMail && !hasPaymentAssertion(windowContent)) {
          logRejection(supabase, user.id, scanLogId, 'bulk_mail_no_payment_near_amount', senderDomain, subject, `amount=${amount}`)
          continue
        }
```

- [ ] **Step 5: Anchor merchant matching to the amount**

Find:

```typescript
        const knownMerchant = extractMerchantFromSnippet(fullText)
```

and replace with:

```typescript
        // Anchored to the subject and the amount's neighbourhood, never the
        // whole body: a real merchant sits next to its amount ("Rs.250 debited
        // at OLA CABS") or in the subject ("Your trip with Uber"), whereas a
        // brand mentioned in an article tens of KB away is not the merchant.
        // Scanning fullText is how a news story about Ola Electric became an
        // "Ola Cab Ride" transaction.
        const knownMerchant = extractMerchantFromSnippet(`${subject} ${windowContent}`)
```

- [ ] **Step 6: Write the integration tests**

Append to `src/services/emailScanner.test.ts`. Add these imports at the top alongside the existing fixture imports:

```typescript
import { makeBusinessStandardGmailMessage } from './__fixtures__/businessStandardNewsletter'
import { makeBulkProseGmailMessage } from './__fixtures__/bulkMailWithPaymentProse'
```

```typescript
describe('scanRealGmailInbox — newsletter false positives', () => {
  const insertedTransactions: any[] = []
  const insertedRejections: any[] = []
  let mockDb: any

  beforeEach(() => {
    insertedTransactions.length = 0
    insertedRejections.length = 0
    mockDb = makeMockDb(insertedTransactions, insertedRejections)
  })

  it('rejects a subscription-advertisement newsletter without calling the AI', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bs-newsletter-1', threadId: 'thread-bs-newsletter-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bs-newsletter-1')) {
        return { ok: true, status: 200, json: async () => makeBusinessStandardGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const askAISpy = vi.fn(async () => null)
    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: askAISpy as any })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    // The quota-preservation guarantee: junk must not reach the AI at all.
    expect(askAISpy).not.toHaveBeenCalled()
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_evidence')
  })

  it('rejects bulk mail whose payment language is far from the amount', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'msg-bulk-prose-1', threadId: 'thread-bulk-prose-1' }] }) } as any
      }
      if (url.includes('/messages/msg-bulk-prose-1')) {
        return { ok: true, status: 200, json: async () => makeBulkProseGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any

    const { scanRealGmailInbox } = await import('./emailScanner')
    const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(0)
    const gates = insertedRejections.flat().map((r: any) => r.gate)
    expect(gates).toContain('bulk_mail_no_payment_near_amount')
  })
})

describe('scanRealGmailInbox — genuine receipts still detected (regression)', () => {
  const cases = [
    { name: 'Uber trip receipt', id: 'msg-uber-trip-1', make: makeUberTripGmailMessage },
    { name: 'Zomato order receipt', id: 'msg-zomato-order-1', make: makeZomatoOrderGmailMessage },
    { name: 'unknown vendor receipt', id: 'msg-unknown-vendor-1', make: makeUnknownVendorGmailMessage },
  ]

  for (const c of cases) {
    it(`still inserts a pending transaction for the ${c.name}`, async () => {
      const insertedTransactions: any[] = []
      const insertedRejections: any[] = []
      const mockDb = makeMockDb(insertedTransactions, insertedRejections)

      global.fetch = vi.fn(async (url: string) => {
        if (url.includes('/messages?')) {
          return { ok: true, status: 200, json: async () => ({ messages: [{ id: c.id, threadId: `thread-${c.id}` }] }) } as any
        }
        if (url.includes(`/messages/${c.id}`)) {
          return { ok: true, status: 200, json: async () => c.make() } as any
        }
        throw new Error(`Unexpected fetch URL in test: ${url}`)
      }) as any

      const { scanRealGmailInbox } = await import('./emailScanner')
      const result = await scanRealGmailInbox({ db: mockDb, activeYear: 2026, askAI: async () => null })

      expect(result.error).toBeNull()
      expect(insertedTransactions).toHaveLength(1)
      expect(insertedTransactions[0][0].approval_status).toBe('pending')
    })
  }
})
```

Note: the fixture message ids above must match the default `id` argument of each fixture's factory function — open each fixture and confirm before running.

- [ ] **Step 7: Run the scanner tests**

Run: `npx vitest run src/services/emailScanner.test.ts`
Expected: PASS — new rejection tests and all regression tests green

If a regression test fails, the payment vocabulary in `hasPaymentAssertion` (Task 1) is too narrow for that fixture. Widen it there and re-run both test files — do not weaken the gate composition in `emailScanner.ts`.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanner.test.ts
git commit -m "fix: reject bulk marketing email before it becomes a transaction"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — every file green, including the new gate, fixture, and regression tests

- [ ] **Step 2: TypeScript build**

Run: `npx tsc -b`
Expected: PASS — no output

- [ ] **Step 3: Lint check for newly introduced problems**

Run: `npm run lint`
Expected: the repository has a pre-existing baseline of lint errors. Confirm no *new* errors reference `emailScanGates.ts`, `emailScanner.ts`, `aiService.ts`, or the new fixture files. Verify any hit in those files is pre-existing with `git log -1 -L <line>,<line>:<file>` before treating it as introduced.
