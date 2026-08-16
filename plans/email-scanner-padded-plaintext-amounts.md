# Space-Padded Plain-Text Bodies Hide the Amount — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan
> touches scanner code, which requires the owner's explicit confirmation **twice** before
> any code is written.

**Goal:** Stop the scanner losing the amount in emails whose `text/plain` part is padded
with long runs of whitespace, which pushes the rupee figure past the 2000-character
parsing window and rejects a real transaction as `no_amount_in_body`.

**Architecture:** `extractEmailBody()` collapses whitespace on the HTML branch (inside
`stripHtmlTagsFast`) but never on the plain-text branch. The fix normalizes whitespace on
the plain-text branch too, so both branches produce comparable, dense text. No gate, no
gate ordering, no dedup, no AI prompt, no `currency.ts` changes.

**Tech Stack:** TypeScript, Vitest.

---

## Root cause, measured

Production failure, 2026-08-16: CRED email `your credit card bill payment was successful`
(Gmail id `1a008f9f49b569df`, ₹10,000) rejected with gate `no_amount_in_body`.

The raw message (`Show original`) shows a `multipart/alternative` with both parts
quoted-printable. The plain-text part renders the amount as `=E2=82=B910,000.00` — a
**literal ₹** (UTF-8 E2 82 B9), not an HTML entity — but it is laid out with enormous runs
of spaces used as visual padding.

Decoding that real part and measuring:

```
index of ₹10,000.00 in the plain part      : 2204
index after collapsing whitespace          : 145
length of that region after collapsing     : 182   (from 3109 raw)
```

`emailContentForParsing` is `subject + strippedBody + snippet` capped at **2000**
characters (`src/services/emailScanner.ts:2213`). The amount sits at ~2249 once the
44-character subject is prepended. It falls outside the window, `extractAmountMatches`
returns zero, and the email is rejected at `src/services/emailScanner.ts:2431`.

Why the padded text is the text that gets used: `extractEmailBody` picks between the two
parts by length (`src/services/emailScanner.ts:870`):

```typescript
if (plainHasAmount && (!htmlHasAmount || plainText.length >= parsedHtml.length)) return plainText.trim()
```

`parsedHtml` has already been through `stripHtmlTagsFast`, which ends with
`.replace(/\s+/g, ' ')` — so the HTML text is dense (~1,200 chars). `plainText` is never
collapsed, so its padding makes it *longer* (3,100+ chars for the opening region alone)
and it wins the comparison. The padding is what makes the padded copy win.

### Ruled out by direct measurement, not reasoning

| Suspected cause | Verdict | How |
| --- | --- | --- |
| Gmail query never matched it | Ruled out | Ran the scanner's exact keyword query live; message returned |
| Outside the 7-day window | Ruled out | `internalDate` 2026-08-16T05:09:54Z |
| Spam/Trash exclusion | Ruled out | Labels are `INBOX`, `IMPORTANT` |
| Bulk-marketing gate | Ruled out | Replay: `isBulkMail=true`, `hasPaymentAssertion=true` → passes |
| Regex gate ladder | Ruled out | Replay: `{"rejected":false,"gate":null}` |
| Confidence below 65 | Ruled out | That branch inserts as pending (`emailScanner.ts:2697`) |
| Merged into a bank alert | Ruled out | Zero HDFC emails in the inbox for 2 days either side |
| 60KB HTML parse cap | Ruled out | Message is 60k–100k total; the payment table sits inside the budget |
| Entity-encoded currency (`&#8377;`) | Ruled out **for this email** | Raw source shows `=E2=82=B9` (literal ₹) on the amount. Entities appear only on `&#8377;79.39` and `&#8377;832cr` in the CRED-protect footer — see follow-up below |

---

## File Structure

- **Modify:** `src/services/emailScanner.ts`, function `extractEmailBody` (lines 826-877)
- **Modify:** `src/services/emailScanner.test.ts` — one new `describe` block

---

## Task 1: Normalize whitespace on the plain-text branch

**Files:**
- Modify: `src/services/emailScanner.ts:861-874`
- Test: `src/services/emailScanner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/emailScanner.test.ts`:

```typescript
import { extractAmountMatches } from './currency'

describe('extractEmailBody — space-padded plain-text parts', () => {
  const b64url = (s: string) =>
    Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

  // Mirrors the real CRED bill-payment mail of 2026-08-16: a
  // multipart/alternative whose text/plain part uses long space runs as visual
  // padding, putting ₹10,000.00 at character ~2204 — past the 2000-char
  // parsing window — while the HTML alternative says the same thing densely.
  const pad = (n: number) => ' '.repeat(n)
  const paddedPlain =
    pad(700) + 'Piyush,' + pad(400) + 'here is your payment confirmation' +
    pad(500) + 'Your credit card payment was successful' + pad(300) +
    'HDFC Bank' + pad(200) + '7185' + pad(120) + 'payment details' +
    pad(60) + 'amount paid' + pad(40) + '₹10,000.00' + pad(200) +
    'payment date Aug 16, 2026'

  const html =
    '<html><body><p>Your credit card payment was successful</p>' +
    '<table><tr><td>amount paid</td><td>₹10,000.00</td></tr></table></body></html>'

  const mail = {
    id: 'padded-plain',
    internalDate: String(Date.now()),
    snippet: '',
    payload: {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'Subject', value: 'your credit card bill payment was successful' }],
      parts: [
        { mimeType: 'text/plain', body: { data: b64url(paddedPlain) } },
        { mimeType: 'text/html', body: { data: b64url(html) } },
      ],
    },
  }

  it('puts the amount inside the 2000-character parsing window', () => {
    const body = extractEmailBody(mail)
    expect(body.indexOf('₹10,000.00')).toBeGreaterThanOrEqual(0)
    expect(body.indexOf('₹10,000.00')).toBeLessThan(2000)
  })

  it('extracts ₹10,000 from the same slice the gates read', () => {
    const content = `your credit card bill payment was successful ${extractEmailBody(mail)}`
      .substring(0, 2000)
    const matches = extractAmountMatches(content)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(10000)
    expect(matches[0].currency).toBe('INR')
  })

  it('does not collapse away the separation between words', () => {
    expect(extractEmailBody(mail)).toContain('amount paid ₹10,000.00')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/services/emailScanner.test.ts -t "space-padded plain-text parts"
```

Expected: first two tests FAIL — index is ~2200 (not < 2000) and `matches` has length 0.

- [ ] **Step 3: Normalize the plain-text branch**

In `src/services/emailScanner.ts`, replace lines 861-874:

```typescript
  // Both are now capped on the way out, not just htmlText.
  if (plainText.length > MAX_HTML_PARSE_CHARS) plainText = plainText.slice(0, MAX_HTML_PARSE_CHARS)
  if (htmlText.length > MAX_HTML_PARSE_CHARS) htmlText = htmlText.slice(0, MAX_HTML_PARSE_CHARS)

  const parsedHtml = htmlText.trim() ? stripHtmlTagsFast(htmlText) : ''

  const plainHasAmount = plainText.trim() ? extractAmountMatches(plainText).length > 0 : false
  const htmlHasAmount = parsedHtml ? extractAmountMatches(parsedHtml).length > 0 : false

  if (plainHasAmount && (!htmlHasAmount || plainText.length >= parsedHtml.length)) return plainText.trim()
  if (htmlHasAmount) return parsedHtml.trim()
  if (plainText.trim() && parsedHtml.trim()) return `${plainText.trim()}\n${parsedHtml.trim()}`
  if (plainText.trim()) return plainText.trim()
  if (parsedHtml.trim()) return parsedHtml.trim()
```

with:

```typescript
  // Both are now capped on the way out, not just htmlText.
  if (plainText.length > MAX_HTML_PARSE_CHARS) plainText = plainText.slice(0, MAX_HTML_PARSE_CHARS)
  if (htmlText.length > MAX_HTML_PARSE_CHARS) htmlText = htmlText.slice(0, MAX_HTML_PARSE_CHARS)

  // Collapse runs of whitespace, exactly as stripHtmlTagsFast already does to the
  // HTML branch. Marketing-grade plain-text parts pad their layout with hundreds
  // of spaces: the real CRED bill-payment mail put ₹10,000.00 at character 2204
  // of its plain part and at 145 once collapsed, so the amount fell outside the
  // 2000-character window every gate reads and the mail was rejected as
  // no_amount_in_body.
  //
  // It also makes the length comparison below mean what it says. Uncollapsed,
  // the padding itself made the plain part "longer" than the dense HTML text, so
  // the padded copy won the comparison on the strength of its own padding.
  plainText = plainText.replace(/\s+/g, ' ')

  const parsedHtml = htmlText.trim() ? stripHtmlTagsFast(htmlText) : ''

  const plainHasAmount = plainText.trim() ? extractAmountMatches(plainText).length > 0 : false
  const htmlHasAmount = parsedHtml ? extractAmountMatches(parsedHtml).length > 0 : false

  if (plainHasAmount && (!htmlHasAmount || plainText.length >= parsedHtml.length)) return plainText.trim()
  if (htmlHasAmount) return parsedHtml.trim()
  if (plainText.trim() && parsedHtml.trim()) return `${plainText.trim()}\n${parsedHtml.trim()}`
  if (plainText.trim()) return plainText.trim()
  if (parsedHtml.trim()) return parsedHtml.trim()
```

- [ ] **Step 4: Run the new tests**

```bash
npx vitest run src/services/emailScanner.test.ts -t "space-padded plain-text parts"
```

Expected: 3 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
npx vitest run
```

Expected: 464 passed (baseline 461 passed / 29 files, measured 2026-08-16 before this
change). A failure here means some gate depended on the raw plain-text spacing — stop and
report rather than adjusting the test.

- [ ] **Step 6: Type-check and build**

```bash
npm run build
```

Expected: exit 0. (`npx tsc -b` alone is not sufficient verification in this repo.)

- [ ] **Step 7: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanner.test.ts
git commit -m "fix: collapse whitespace in plain-text bodies so padded receipts keep their amount"
```

---

## Task 2: Verify against the real email

The failing email is now recorded in `email_scan_rejections`, which the scanner treats as
already-considered (`src/services/emailScanner.ts:1922`), so a rescan skips it until the
row is removed.

- [ ] **Step 1: Deploy the fix**

- [ ] **Step 2: Make the email eligible again**

Run in the Supabase SQL editor:

```sql
delete from email_scan_rejections
where email_message_id = '1a008f9f49b569df';
```

- [ ] **Step 3: Run a manual scan from the app**

- [ ] **Step 4: Confirm**

Expected in Pending: a **debit of ₹10,000**, dated 2026-08-16, payment mode `upi`, card
issuer HDFC.

If it is still rejected, read the gate name in the skipped-emails panel and stop.

---

## Follow-up found during this investigation (NOT in this plan)

**HTML entities are never decoded.** `stripHtmlTagsFast` strips tags but leaves entity
text verbatim, and `CURRENCY_TOKENS` (`src/services/currency.ts:31`) requires a literal
`₹` or the words `Rs`/`INR`/`Rupees`. Measured:

```
literal rupee sign       -> amounts=1 (10000 INR)
numeric entity &#8377;   -> amounts=0
hex entity &#x20B9;      -> amounts=0
literal sign + &nbsp;    -> amounts=0
Rs. with &nbsp;          -> amounts=0
```

This email survives it because its amount is a literal ₹ and its plain-text part is used —
but it writes `&#8377;79.39` and `&#8377;832cr` in the HTML footer, so the pattern is real
in production mail. An HTML-only receipt that entity-encodes its amount would be rejected
the same way. Worth fixing; deliberately not bundled here. Decide separately.

## Also out of scope, deliberately

- **The missing ₹10,000.** No code path recovers it. Add it manually.
- **Auto-scan cadence.** Cron is `30 21 * * *` UTC = 03:00 IST (`vercel.json:9`), so mail
  arriving after 03:00 IST waits up to ~24h. Working as designed.
- **Snippet ordering.** `fullText` appends Gmail's snippet last
  (`src/services/emailScanner.ts:2212`), so it is the first thing a long body pushes out of
  the window. Collapsing makes that far less likely to matter. Not changed here, because
  reordering shifts every amount index and therefore the amount tie-break.

## Risk and rollback

Low. One `replace` on a string already bounded to 60KB, applied to the branch whose sibling
already does exactly this. No gate, ordering, dedup, or prompt change.

Behavioural change beyond the amount window: gate text and the AI prompt now see plain-text
bodies with single spaces instead of padding runs — strictly denser and closer to what the
HTML branch already produced.

Rollback is `git revert` of the single commit.

## Invariants preserved

1. Nothing auto-approves — untouched.
2. Gate order dedup → date → bulk → AI → regex — untouched.
3. AI failure still degrades to the regex ladder — untouched.
4. Rejection logging stays fire-and-forget — untouched.
5. The `23505` row-by-row insert fallback — untouched.
6. AI prompt STRICT RULES text — untouched.
