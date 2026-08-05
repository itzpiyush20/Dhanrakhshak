# Email Scan Recall Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Gmail transaction scanner from silently dropping genuine bank/fintech emails, make every rejection diagnosable, guarantee every scan window is processed completely (no message-count cap, ever), and recover transactions already missed via a manual deep rescan.

**Architecture:** A new pure `stripBoilerplate()` step removes security/legal footer text before any gate or field-extraction logic sees it. Rejection-gate logic is extracted into a standalone, independently-testable module (`emailScanGates.ts`). Every rejection point in `scanRealGmailInbox()` calls a fire-and-forget `logRejection()` into a new `email_scan_rejections` table, correlated by a client-generated `scanLogId`. The 100-message pagination cap is removed entirely so windowed completeness is guaranteed. `scanRealGmailInbox()` is parameterized internally with a `mode: 'normal' | 'deep'` so `deepRescanGmailInbox()` shares the exact same parsing/gating code path with only the time window changed.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres + RLS), Vercel serverless functions, React (PendingPage UI).

---

### Task 1: Migration — `email_scan_rejections` table

**Files:**
- Create: `supabase/010_email_scan_rejections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 010_email_scan_rejections.sql
-- Diagnostic log of emails the scanner rejected, and why. Lets a missed
-- transaction be traced to the exact gate that dropped it (sender domain +
-- subject + gate name + matched text) instead of requiring a manual code
-- trace, as happened for the Axis Bank EMI-debit sample that motivated this
-- table. Diagnostic data only — rows expire after 30 days (see cleanup cron
-- added in Task 15).

CREATE TABLE IF NOT EXISTS public.email_scan_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_log_id UUID REFERENCES public.email_scan_logs(id) ON DELETE CASCADE,
  sender_domain TEXT,
  subject TEXT,
  gate TEXT NOT NULL,
  matched_snippet TEXT,
  rejected_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_user
  ON public.email_scan_rejections(user_id, rejected_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_scan_rejections_scan_log
  ON public.email_scan_rejections(scan_log_id);

ALTER TABLE public.email_scan_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan rejections"
  ON public.email_scan_rejections FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT policy for the anon/authenticated role by design: rows are
-- written by scanRealGmailInbox() running under the caller's own session
-- (browser path) or the service-role key (cron path). The authenticated
-- role still needs INSERT for the browser path, scoped to its own user_id:
CREATE POLICY "Users can insert own scan rejections"
  ON public.email_scan_rejections FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

Run against your Supabase project (SQL editor or CLI):

```bash
# Using the Supabase CLI, from the project root:
supabase db push
```

If you don't use the CLI for this project, paste the file contents into the Supabase Dashboard → SQL Editor and run it.

- [ ] **Step 3: Commit**

```bash
git add supabase/010_email_scan_rejections.sql
git commit -m "feat(db): add email_scan_rejections table for scan diagnostics"
```

---

### Task 2: Database types for the new table

**Files:**
- Modify: `src/types/database.ts:201-225` (existing `email_scan_logs` type block)

- [ ] **Step 1: Add an `id?` field to `email_scan_logs` Insert**

The scan functions will generate the log row's UUID client-side (so per-email rejection rows can reference it before the log row itself is inserted). Find this exact block:

```typescript
      email_scan_logs: {
        Row: {
          id: string
          user_id: string
          scanned_at: string
          emails_processed: number
          transactions_found: number
          status: 'success' | 'failed' | 'partial'
          error_message: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
        Update: {
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
      }
```

Replace with:

```typescript
      email_scan_logs: {
        Row: {
          id: string
          user_id: string
          scanned_at: string
          emails_processed: number
          transactions_found: number
          status: 'success' | 'failed' | 'partial'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
        Update: {
          emails_processed?: number
          transactions_found?: number
          status?: 'success' | 'failed' | 'partial'
          error_message?: string | null
        }
      }
      email_scan_rejections: {
        Row: {
          id: string
          user_id: string
          scan_log_id: string | null
          sender_domain: string | null
          subject: string | null
          gate: string
          matched_snippet: string | null
          rejected_at: string
        }
        Insert: {
          user_id: string
          scan_log_id?: string | null
          sender_domain?: string | null
          subject?: string | null
          gate: string
          matched_snippet?: string | null
        }
        Update: {
          gate?: string
        }
      }
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npm run build`
Expected: no new TypeScript errors (this is a type-only addition).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add email_scan_rejections table type"
```

---

### Task 3: Shared test fixture — the real Axis EMI email

**Files:**
- Create: `src/services/__fixtures__/axisEmiDebit.ts`

This fixture is reused by Tasks 4, 5, and 14. It captures the actual reported email verbatim (redacted account digits only where the user already redacted them), both as raw text (for the boilerplate/gate unit tests) and as a full mocked Gmail API message object (for the end-to-end integration test).

- [ ] **Step 1: Write the fixture file**

```typescript
// src/services/__fixtures__/axisEmiDebit.ts
//
// Real (redacted) Axis Bank EMI debit alert that the scanner silently
// dropped before this fix — the case that drove the recall-fix investigation.
// Two footer sentences killed it: "has not been initiated by you" tripped
// the declined/initiated reject gate, and "do not share ... CVV/OTP" tripped
// the OTP gate. Both are standard security boilerplate, not transaction
// content.

export const AXIS_EMI_SUBJECT = 'Debit transaction alert for Axis Bank A/c'

export const AXIS_EMI_FROM = 'Axis Bank Alerts <alerts@axis.bank.in>'

export const AXIS_EMI_BODY = `AXIS BANK
05-08-2026

Dear Piyush Khandelwal,

Thank you for banking with us.

We wish to inform you that your A/c no. XX5154 has been debited with INR 42293.00 on 05-08-2026 10:02:30 IST by PPR030614052540_EMI_05-08-.

To check your available balance, please click here. 

Please SMS BLOCKALL <Space> <Cust ID> to +91 9951860002, if the transaction has not been initiated by you.

Should you wish to reach us, please call 18001035577.

Always open to help you.

Regards,
Axis Bank Ltd.
 
****This is a system generated communication and does not require signature. ****

E001001828_07_2023

 
Reach us at: 
Axis Bank1	Axis Bank	Axis Bank	Axis Bank	Axis Bank	Axis Bank
CHAT	WEB Support	Mobile app	INTERNET BANKING	WHATSAPP	BRANCH LOCATOR
Copyright Axis Bank Ltd. All rights reserved. Terms & Conditions apply.
Please do not share your Internet Banking details, such as user ID/password or your Credit/Debit Card number/CVV/OTP
with anyone, either over phone or through email.
RBI never deals with individuals for Savings Account, Current Account, Credit Card, Debit Card, etc. Don't be victim to such
offers coming to you on phone or email in the name of RBI.
Do not click on Links from unknown/unsecure Sources that seek your confidential information.
This email is confidential. It may also be legally privileged. If you are not the addressee, you may not copy, forward,
disclose or use any part of it. Internet communications cannot be guaranteed to be timely, secure, error or virus-free.
The sender does not accept liability for any errors or omissions. We maintain strict security standards and procedures to
prevent unauthorised access to information about you. Know more >>`

/** Base64url-encode text the way Gmail's API does for message body parts. */
function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Axis EMI email, for integration tests. */
export function makeAxisEmiGmailMessage(id = 'msg-axis-emi-1') {
  return {
    id,
    threadId: 'thread-axis-emi-1',
    snippet: 'We wish to inform you that your A/c no. XX5154 has been debited with INR 42293.00...',
    internalDate: String(Date.UTC(2026, 7, 5, 10, 2, 30)),
    payload: {
      headers: [
        { name: 'Subject', value: AXIS_EMI_SUBJECT },
        { name: 'From', value: AXIS_EMI_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(AXIS_EMI_BODY) },
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/__fixtures__/axisEmiDebit.ts
git commit -m "test: add shared Axis EMI email fixture"
```

---

### Task 4: `stripBoilerplate()` — remove security/legal footer text

**Files:**
- Create: `src/services/emailBoilerplate.ts`
- Test: `src/services/emailBoilerplate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/emailBoilerplate.test.ts
import { describe, it, expect } from 'vitest'
import { stripBoilerplate } from './emailBoilerplate'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'

describe('stripBoilerplate', () => {
  it('removes the "not initiated by you" security sentence but keeps the transaction sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/has not been initiated by you/i)
    expect(result).toMatch(/debited with INR 42293\.00/i)
  })

  it('removes the "do not share ... CVV/OTP" security sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/do not share your internet banking details/i)
    expect(result).not.toMatch(/CVV\/OTP/i)
  })

  it('removes RBI advisory, confidentiality, and "know more" boilerplate', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/RBI never deals with individuals/i)
    expect(result).not.toMatch(/This email is confidential/i)
    expect(result).not.toMatch(/Know more/i)
  })

  it('removes the SMS BLOCKALL helpline instruction sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/SMS BLOCKALL/i)
  })

  it('keeps the amount and reference token intact', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).toContain('INR 42293.00')
    expect(result).toContain('PPR030614052540_EMI_05-08-')
  })

  it('returns unstripped text unchanged when it contains no boilerplate', () => {
    const clean = 'Your account was debited with INR 500.00 for Zomato order.'
    expect(stripBoilerplate(clean)).toBe(clean)
  })

  it('handles empty input', () => {
    expect(stripBoilerplate('')).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/emailBoilerplate.test.ts`
Expected: FAIL — `Cannot find module './emailBoilerplate'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/emailBoilerplate.ts
//
// Strips known non-transactional security/legal boilerplate out of a bank
// or fintech email body *before* any rejection gate or field-extraction
// regex sees the text. Every bank appends its own security footer, and a
// footer phrase colliding with a rejection keyword (e.g. "has not been
// initiated by you" containing "initiated", or "do not share your ...
// CVV/OTP" containing "OTP") was silently discarding genuine transaction
// emails — see the Axis Bank EMI-debit sample this was built from.
//
// Deliberately conservative: only removes whole sentences matching known
// boilerplate patterns, never touches arbitrary keywords. New banks with
// new footer wording get a new pattern appended here — this list is meant
// to grow over time, not the gate logic that reads its output.

const BOILERPLATE_SENTENCE_PATTERNS: RegExp[] = [
  // "if the transaction has not been initiated by you", "if this was not done by you"
  /\bif\s+(?:the\s+)?(?:this\s+)?transaction[^.]*?not\s+(?:been\s+)?(?:done|initiated)\s+by\s+you[^.]*\./gi,
  /\bif\s+(?:this|it)\s+(?:was\s+)?not\s+(?:done|initiated)\s+by\s+you[^.]*\./gi,
  // "please do not share your ... OTP/CVV/PIN/password ..."
  /\bplease\s+do\s+not\s+share\s+your[^.]*\./gi,
  /\bdo\s+not\s+share\s+your[^.]*?(?:otp|cvv|pin|password|card\s*number)[^.]*\./gi,
  // RBI / fraud advisory boilerplate
  /\bRBI\s+never\s+deals\s+with\s+individuals[^.]*\./gi,
  /\bdo\s+not\s+click\s+on\s+links?\s+from\s+unknown[^.]*\./gi,
  // Legal/confidentiality footer
  /\bthis\s+email\s+is\s+confidential[^.]*\./gi,
  /\bit\s+may\s+also\s+be\s+legally\s+privileged[^.]*\./gi,
  /\bif\s+you\s+are\s+not\s+the\s+addressee[^.]*\./gi,
  /\binternet\s+communications\s+cannot\s+be\s+guaranteed[^.]*\./gi,
  /\bthe\s+sender\s+does\s+not\s+accept\s+liability[^.]*\./gi,
  /\bwe\s+maintain\s+strict\s+security\s+standards[^.]*\./gi,
  /\bknow\s+more\s*>>?/gi,
  /\bthis\s+is\s+a\s+system\s+generated\s+communication[^.]*\./gi,
  /\bcopyright\s+[^.]*?(?:ltd|limited)[^.]*?(?:rights\s+reserved)[^.]*\./gi,
  /\bterms\s*&?\s*conditions\s+apply\.?/gi,
  // Non-transactional helpline instructions
  /\bplease\s+SMS\s+\S+[^.]*\./gi,
  /\bshould\s+you\s+wish\s+to\s+reach\s+us[^.]*\./gi,
]

export function stripBoilerplate(text: string): string {
  if (!text) return text
  let result = text
  for (const pattern of BOILERPLATE_SENTENCE_PATTERNS) {
    result = result.replace(pattern, ' ')
  }
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/emailBoilerplate.test.ts`
Expected: PASS (7 tests)

If any test still fails, check which pattern isn't matching the exact fixture wording (case, punctuation) and adjust that one pattern — don't broaden it into a keyword-only match.

- [ ] **Step 5: Commit**

```bash
git add src/services/emailBoilerplate.ts src/services/emailBoilerplate.test.ts
git commit -m "feat: add stripBoilerplate to remove security/legal footer text before gating"
```

---

### Task 5: Fix underscore word-boundary bug in `classifyEventType`

**Files:**
- Modify: `src/services/emailScanner.ts:420-440` (`classifyEventType`)
- Test: `src/services/emailScanner.eventType.test.ts`

Found while building the regression test for the Axis email: `classifyEventType()`'s keyword regexes use `\b` word boundaries, but `_` is a word character in regex, so a reference token like `PPR030614052540_EMI_05-08-` never matches `\bemi\b` — the boundary doesn't exist between `_` and `E`. This silently affects every keyword in the function (emi, sip, loan_repayment, atm_withdrawal, transfer, insurance) whenever a bank embeds it in an underscore-delimited reference. Fix: normalize underscores to spaces in the text handed to the classifier only (not the general parsing text, to avoid unrelated side effects).

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/emailScanner.eventType.test.ts
import { describe, it, expect } from 'vitest'

// classifyEventType is not exported today — this test exports it via a
// minimal re-export shim so it's directly testable without mocking Gmail.
// (Task 5 also adds `export` to the function in emailScanner.ts.)
import { classifyEventType } from './emailScanner'

describe('classifyEventType — underscore-delimited reference tokens', () => {
  it('detects EMI when the keyword is embedded in an underscore-delimited reference (Axis Bank format)', () => {
    const text = 'debited with INR 42293.00 on 05-08-2026 by PPR030614052540_EMI_05-08-.'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('emi')
  })

  it('still detects EMI with normal word-boundary spacing', () => {
    const text = 'Your EMI payment of INR 5000 has been debited.'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('emi')
  })

  it('detects SIP when embedded in an underscore-delimited reference', () => {
    const text = 'debited for MUTUAL_FUND_SIP_INSTALLMENT_2026'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('sip')
  })

  it('falls back to generic debit when no keyword matches', () => {
    const text = 'debited for Zomato food order'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('debit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/emailScanner.eventType.test.ts`
Expected: FAIL — `classifyEventType` is not exported, and even once exported, the first test fails (`'debit'` !== `'emi'`)

- [ ] **Step 3: Export `classifyEventType` and normalize underscores before matching**

In `src/services/emailScanner.ts`, find:

```typescript
function classifyEventType(text: string, txType: 'debit' | 'credit', category: string): EventType {
  const t = text.toLowerCase()
```

Replace with:

```typescript
export function classifyEventType(text: string, txType: 'debit' | 'credit', category: string): EventType {
  // Bank reference tokens often embed the keyword between underscores
  // (e.g. "PPR030614052540_EMI_05-08-") — `_` is a \w character, so a bare
  // `\bemi\b` never matches there. Normalizing underscores to spaces here
  // (scoped to this classifier only) restores word-boundary matching
  // without touching the general parsing text used elsewhere.
  const t = text.replace(/_/g, ' ').toLowerCase()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/emailScanner.eventType.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/emailScanner.ts src/services/emailScanner.eventType.test.ts
git commit -m "fix: classifyEventType misses keywords embedded in underscore-delimited reference tokens"
```

---

### Task 6: Extract and narrow rejection gates into `emailScanGates.ts`

**Files:**
- Create: `src/services/emailScanGates.ts`
- Test: `src/services/emailScanGates.test.ts`

Extracts the regex rejection gates out of the inline loop body so they're independently testable, and narrows the declined/initiated gate so it no longer fires on negated security-footer phrasing ("has not been initiated by you") while still catching genuine pending-payment language ("your request has been initiated").

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/emailScanGates.test.ts
import { describe, it, expect } from 'vitest'
import { isGenuinePendingInitiation, evaluateRegexGates } from './emailScanGates'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'
import { stripBoilerplate } from './emailBoilerplate'

describe('isGenuinePendingInitiation', () => {
  it('does NOT flag "has not been initiated by you" as a pending signal', () => {
    const text = 'if the transaction has not been initiated by you, call us.'
    expect(isGenuinePendingInitiation(text).matched).toBe(false)
  })

  it('DOES flag "your request has been initiated" as a pending signal', () => {
    const text = 'Your fund transfer request has been initiated and will be processed shortly.'
    expect(isGenuinePendingInitiation(text).matched).toBe(true)
  })

  it('DOES flag "requested" without a negation nearby', () => {
    const text = 'Your auto-debit mandate has been requested and is pending confirmation.'
    expect(isGenuinePendingInitiation(text).matched).toBe(true)
  })
})

describe('evaluateRegexGates', () => {
  it('does not reject the Axis EMI email after boilerplate stripping (regression for the reported miss)', () => {
    const stripped = stripBoilerplate(AXIS_EMI_BODY)
    const content = `Debit transaction alert for Axis Bank A/c ${stripped}`.substring(0, 2000)
    const result = evaluateRegexGates('Debit transaction alert for Axis Bank A/c', content, true)
    expect(result.rejected).toBe(false)
  })

  it('still rejects a genuine OTP email', () => {
    const content = 'Your OTP for login is 482913. Do not share this OTP with anyone.'
    const result = evaluateRegexGates('OTP for your login', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('otp_or_security_code')
  })

  it('still rejects a promotional cashback offer', () => {
    const content = 'Get cashback on your next purchase! Limited period offer, shop now.'
    const result = evaluateRegexGates('Exclusive cashback offer', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('promotional_spam')
  })

  it('still rejects a declined payment', () => {
    const content = 'Your payment of INR 500 was declined due to insufficient balance.'
    const result = evaluateRegexGates('Payment declined', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('declined_or_void')
  })

  it('still rejects a payment-due reminder when the subject is not hard-accepted', () => {
    const content = 'Your credit card payment of INR 5000 is due on 15th August. Minimum due: INR 500.'
    const result = evaluateRegexGates('Payment reminder', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('due_or_statement_reminder')
  })

  it('still rejects an order-placed email with no debit confirmation', () => {
    const content = 'Your order has been placed successfully. It will ship in 2 days.'
    const result = evaluateRegexGates('Order Confirmation', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('order_placed_no_debit')
  })

  it('does not reject an order-placed email that also confirms a debit', () => {
    const content = 'Your order has been placed successfully. INR 1200 has been debited from your account.'
    const result = evaluateRegexGates('Order Confirmation', content, false)
    expect(result.rejected).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: FAIL — `Cannot find module './emailScanGates'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/emailScanGates.ts
//
// Rejection gates for the regex fallback path in scanRealGmailInbox(),
// extracted so they're independently testable without mocking Gmail.
// Preserves the original gate order and semantics exactly, except for
// isGenuinePendingInitiation (see below) which fixes a real false-negative:
// the original single regex `\b(...|initiated|requested|...)\b` rejected
// any email containing "initiated" or "requested" ANYWHERE, including
// inside a negated security-footer sentence like "has not been initiated
// by you" — which is the opposite of a pending-payment notice.

export interface GateCheckResult {
  rejected: boolean
  gate: string | null
  snippet: string | null
}

/**
 * True only when "initiated"/"requested" signals a genuinely pending
 * (not-yet-settled) payment — e.g. "your transfer request has been
 * initiated" — and false when it's part of a negated security-footer
 * sentence like "has not been initiated by you".
 */
export function isGenuinePendingInitiation(text: string): { matched: boolean; snippet: string | null } {
  const re = /\b(initiated|requested)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const windowStart = Math.max(0, m.index - 30)
    const windowEnd = Math.min(text.length, m.index + m[0].length + 15)
    const window = text.substring(windowStart, windowEnd)
    // "not ... initiated/requested" within a short span is a negation
    // (security-footer phrasing), never a pending-payment signal.
    if (/\bnot\b[\s\S]{0,20}\b(initiated|requested)\b/i.test(window)) continue
    return { matched: true, snippet: window.trim() }
  }
  return { matched: false, snippet: null }
}

/**
 * Runs the full regex rejection-gate chain against already boilerplate-
 * stripped email content. Returns the first gate that rejects, or
 * { rejected: false } if the email survives all gates.
 */
export function evaluateRegexGates(
  _subject: string,
  emailContentForParsing: string,
  isHardAccepted: boolean
): GateCheckResult {
  const promoMatch = /\b(?:promo(?:tion)?|coupon|unsubscribe|shop\s+now|buy\s+now|special\s+offer|limited\s+period|earn\s+cashback|get\s+cashback|cashback\s+on\s+your\s+next|exclusive\s+deal)\b/i.exec(emailContentForParsing)
  if (promoMatch) return { rejected: true, gate: 'promotional_spam', snippet: promoMatch[0] }

  const declinedMatch = /\b(?:declined|failed|unsuccessful|rejected|cancelled|void|voided)\b/i.exec(emailContentForParsing)
  if (declinedMatch) return { rejected: true, gate: 'declined_or_void', snippet: declinedMatch[0] }

  const pendingInitiation = isGenuinePendingInitiation(emailContentForParsing)
  if (pendingInitiation.matched) return { rejected: true, gate: 'pending_initiation', snippet: pendingInitiation.snippet }

  const otpMatch = /\b(?:otp|one\s*time\s*pass(?:word|code)|verification\s*code|verification\s*pin|passcode|security\s*pin|security\s*code|m-?pin|t-?pin|2fa|two\s*factor|auth\s*code|do\s*not\s*share)\b/i.exec(emailContentForParsing)
  if (otpMatch) return { rejected: true, gate: 'otp_or_security_code', snippet: otpMatch[0] }

  const orderPlacedMatch = /\b(?:order\s*(?:placed|confirmed|received|acknowledged)|booking\s*(?:confirmed|received)|your\s*order\s*(?:is|has been))\b/i.exec(emailContentForParsing)
  const hasDebitConfirmation = /\b(?:debited|charged|deducted|payment\s*(?:successful|done|completed|received)|amount\s*debited)\b/i.test(emailContentForParsing)
  if (orderPlacedMatch && !hasDebitConfirmation) {
    return { rejected: true, gate: 'order_placed_no_debit', snippet: orderPlacedMatch[0] }
  }

  if (!isHardAccepted) {
    const dueMatch = /\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement|e-?statement|estatement)\b/i.exec(emailContentForParsing)
    if (dueMatch) return { rejected: true, gate: 'due_or_statement_reminder', snippet: dueMatch[0] }

    const scheduledMatch = /(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|auto-?debit\s+has\s+been\s+scheduled|is\s+scheduled\s+for)/i.exec(emailContentForParsing)
    if (scheduledMatch) return { rejected: true, gate: 'scheduled_future_debit', snippet: scheduledMatch[0] }

    const policyMatch = /\b(?:policy\s+update|security\s+policy|terms\s+of\s+service|agreement\s+update|privacy\s+update|will\s+not\s+be\s+charged|no\s+charges\s+apply)\b/i.exec(emailContentForParsing)
    if (policyMatch) return { rejected: true, gate: 'policy_or_no_charge', snippet: policyMatch[0] }
  }

  return { rejected: false, gate: null, snippet: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/emailScanGates.ts src/services/emailScanGates.test.ts
git commit -m "feat: extract regex rejection gates; fix false-reject on negated 'initiated' phrasing"
```

---

### Task 7: `logRejection()` — fire-and-forget rejection logger

**Files:**
- Modify: `src/services/emailScanGates.ts` (add the function)
- Test: `src/services/emailScanGates.test.ts` (append tests)

- [ ] **Step 1: Add the failing test**

Append to `src/services/emailScanGates.test.ts`:

```typescript
describe('logRejection', () => {
  it('inserts a rejection row with the given fields', async () => {
    const insertedRows: any[] = []
    const mockDb: any = {
      from: (table: string) => ({
        insert: (row: any) => {
          insertedRows.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }),
    }

    await logRejection(mockDb, 'user-1', 'scan-log-1', 'otp_or_security_code', 'axis.bank.in', 'Some subject', 'matched text')

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].table).toBe('email_scan_rejections')
    expect(insertedRows[0].row).toEqual({
      user_id: 'user-1',
      scan_log_id: 'scan-log-1',
      sender_domain: 'axis.bank.in',
      subject: 'Some subject',
      gate: 'otp_or_security_code',
      matched_snippet: 'matched text',
    })
  })

  it('never throws when the insert fails', async () => {
    const mockDb: any = {
      from: () => ({
        insert: () => Promise.resolve({ error: new Error('db down') }),
      }),
    }
    await expect(
      logRejection(mockDb, 'user-1', 'scan-log-1', 'otp_or_security_code', 'axis.bank.in', 'subj', 'snippet')
    ).resolves.toBeUndefined()
  })
})
```

Add the import at the top of the test file:

```typescript
import { isGenuinePendingInitiation, evaluateRegexGates, logRejection } from './emailScanGates'
```

(Replace the existing `import { isGenuinePendingInitiation, evaluateRegexGates } from './emailScanGates'` line with the one above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: FAIL — `logRejection is not exported`

- [ ] **Step 3: Add the implementation**

Append to `src/services/emailScanGates.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fire-and-forget: records why an email was rejected so a future recall
 * gap is diagnosable without a manual code trace. Must never throw or
 * slow down the scan it's called from — failures are logged to console
 * only.
 */
export async function logRejection(
  db: SupabaseClient,
  userId: string,
  scanLogId: string,
  gate: string,
  senderDomain: string,
  subject: string,
  matchedSnippet: string
): Promise<void> {
  try {
    const { error } = await db.from('email_scan_rejections').insert({
      user_id: userId,
      scan_log_id: scanLogId,
      sender_domain: senderDomain || null,
      subject: subject ? subject.substring(0, 500) : null,
      gate,
      matched_snippet: matchedSnippet ? matchedSnippet.substring(0, 200) : null,
    })
    if (error) console.warn(`[emailScanner] Failed to log rejection (gate=${gate}):`, error.message)
  } catch (e) {
    console.warn(`[emailScanner] Failed to log rejection (gate=${gate}):`, e)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/emailScanGates.test.ts`
Expected: PASS (12 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/services/emailScanGates.ts src/services/emailScanGates.test.ts
git commit -m "feat: add logRejection for diagnosable scan rejections"
```

---

### Task 8: Wire boilerplate stripping + scanLogId generation into `scanRealGmailInbox`

**Files:**
- Modify: `src/services/emailScanner.ts:1-13` (imports)
- Modify: `src/services/emailScanner.ts:718-719` (function start)
- Modify: `src/services/emailScanner.ts:1002-1009` (per-email text construction)

- [ ] **Step 1: Add imports**

Find:

```typescript
import { supabase as defaultSupabase } from './supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { extractBankName } from '../utils/index.js'
import { applyMerchantRulesFromDB } from './learningEngine.js'
import { getGoogleToken, clearGoogleToken, tryRefreshGoogleToken } from './googleAuth.js'
import { analyzeTransactionEmailWithAI } from './aiService.js'
```

Replace with:

```typescript
import { supabase as defaultSupabase } from './supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { extractBankName } from '../utils/index.js'
import { applyMerchantRulesFromDB } from './learningEngine.js'
import { getGoogleToken, clearGoogleToken, tryRefreshGoogleToken } from './googleAuth.js'
import { analyzeTransactionEmailWithAI } from './aiService.js'
import { stripBoilerplate } from './emailBoilerplate.js'
import { evaluateRegexGates, logRejection } from './emailScanGates.js'
```

- [ ] **Step 2: Generate `scanLogId` at the top of the function**

Find:

```typescript
export async function scanRealGmailInbox(opts?: ScanGmailOptions) {
  const supabase = opts?.db || defaultSupabase
```

Replace with:

```typescript
export async function scanRealGmailInbox(opts?: ScanGmailOptions) {
  const supabase = opts?.db || defaultSupabase
  // Generated up front so every per-email rejection logged during this scan
  // can reference the scan_log row before that row itself is inserted
  // (which only happens after the whole scan completes, below).
  const scanLogId: string = crypto.randomUUID
    ? crypto.randomUUID()
    : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`
```

- [ ] **Step 3: Hoist sender-domain computation and apply boilerplate stripping per email**

Find:

```typescript
      const bodyText = extractEmailBody(mail)
      const headers = mail.payload?.headers || []
      const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')
      const subject = subjectHeader?.value || ''
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')
      const fromValue: string = fromHeader?.value || ''
      const fullText = `${subject} ${bodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)
```

Replace with:

```typescript
      const bodyText = extractEmailBody(mail)
      const headers = mail.payload?.headers || []
      const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')
      const subject = subjectHeader?.value || ''
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')
      const fromValue: string = fromHeader?.value || ''
      const senderDomainMatch = fromValue.match(/@([\w.-]+)>?/i)
      const senderDomain = senderDomainMatch ? senderDomainMatch[1].toLowerCase() : ''
      const isTrustedSender = TRUSTED_SENDER_DOMAINS.has(senderDomain) ||
        [...TRUSTED_SENDER_DOMAINS].some(d => senderDomain.endsWith('.' + d))
      // Strip security/legal footer boilerplate before ANY gate or the AI
      // prompt sees this text — footers were colliding with rejection
      // keywords (e.g. "has not been initiated by you") and silently
      // dropping genuine transaction emails.
      const strippedBodyText = stripBoilerplate(bodyText)
      const fullText = `${subject} ${strippedBodyText} ${mail.snippet || ''}`
      const emailContentForParsing = fullText.substring(0, 2000)
```

- [ ] **Step 4: Pass stripped text to the AI path too**

Find:

```typescript
          const aiResult = await askAI(subject, bodyText, mailDate, categoryNames)
```

Replace with:

```typescript
          const aiResult = await askAI(subject, strippedBodyText, mailDate, categoryNames)
```

- [ ] **Step 5: Verify the file still typechecks**

Run: `npm run build`
Expected: no new TypeScript errors. (There will still be an unused-variable situation for the old inline `senderDomain`/`isTrustedSender` declaration further down in the regex-fallback block — that's resolved in Task 9.)

- [ ] **Step 6: Commit**

```bash
git add src/services/emailScanner.ts
git commit -m "feat: wire stripBoilerplate into scanner; hoist sender-domain detection"
```

---

### Task 9: Wire extracted gates + rejection logging into the regex fallback path

**Files:**
- Modify: `src/services/emailScanner.ts:1074-1101` (inline gate block)
- Modify: `src/services/emailScanner.ts:1244-1285` (skipped-confidence logging)

- [ ] **Step 1: Replace the inline gate block with the extracted, tested version**

Find this exact block:

```typescript
      if (!parsedTxn) {
        const senderDomainMatch = fromValue.match(/@([\w.-]+)>?/i)
        const senderDomain = senderDomainMatch ? senderDomainMatch[1].toLowerCase() : ''
        const isTrustedSender = TRUSTED_SENDER_DOMAINS.has(senderDomain) ||
          [...TRUSTED_SENDER_DOMAINS].some(d => senderDomain.endsWith('.' + d))

        const isHardRejected = HARD_REJECT_SUBJECT_PATTERNS.some(p => p.test(subject))
        if (isHardRejected) continue

        const isHardAccepted = HARD_ACCEPT_SUBJECT_PATTERNS.some(p => p.test(subject))

        const isPromotionalSpam = /\b(?:promo(?:tion)?|coupon|unsubscribe|shop\s+now|buy\s+now|special\s+offer|limited\s+period|earn\s+cashback|get\s+cashback|cashback\s+on\s+your\s+next|exclusive\s+deal)\b/i.test(emailContentForParsing)
        if (isPromotionalSpam) continue

        // Always reject these — hard-accept subject does NOT override
        if (/\b(?:declined|failed|unsuccessful|initiated|requested|rejected|cancelled|void|voided)\b/i.test(emailContentForParsing)) continue
        if (/\b(?:otp|one\s*time\s*pass(?:word|code)|verification\s*code|verification\s*pin|passcode|security\s*pin|security\s*code|m-?pin|t-?pin|2fa|two\s*factor|auth\s*code|do\s*not\s*share)\b/i.test(emailContentForParsing)) continue
        // Reject order-placed emails that lack an actual debit confirmation
        if (
          /\b(?:order\s*(?:placed|confirmed|received|acknowledged)|booking\s*(?:confirmed|received)|your\s*order\s*(?:is|has been))\b/i.test(emailContentForParsing) &&
          !/\b(?:debited|charged|deducted|payment\s*(?:successful|done|completed|received)|amount\s*debited)\b/i.test(emailContentForParsing)
        ) continue
        if (!isHardAccepted) {
          if (/\b(?:due|reminder|remind|upcoming|due\s+date|minimum\s+due|statement\s+for|payment\s+due|overdue|payable|bill\s+generated|statement\s+of|monthly\s+statement|e-?statement|estatement)\b/i.test(emailContentForParsing)) continue
          if (/(?:will\s+be\s+debited|scheduled\s+for|pay\s+before|auto-?debit\s+has\s+been\s+scheduled|is\s+scheduled\s+for)/i.test(emailContentForParsing)) continue
          if (/\b(?:policy\s+update|security\s+policy|terms\s+of\s+service|agreement\s+update|privacy\s+update|will\s+not\s+be\s+charged|no\s+charges\s+apply)\b/i.test(emailContentForParsing)) continue
        }
```

Replace with:

```typescript
      if (!parsedTxn) {
        const isHardRejected = HARD_REJECT_SUBJECT_PATTERNS.some(p => p.test(subject))
        if (isHardRejected) {
          logRejection(supabase, user.id, scanLogId, 'hard_reject_subject', senderDomain, subject, subject)
          continue
        }

        const isHardAccepted = HARD_ACCEPT_SUBJECT_PATTERNS.some(p => p.test(subject))

        const gateResult = evaluateRegexGates(subject, emailContentForParsing, isHardAccepted)
        if (gateResult.rejected) {
          logRejection(supabase, user.id, scanLogId, gateResult.gate!, senderDomain, subject, gateResult.snippet || '')
          continue
        }
```

Note: `senderDomain` and `isTrustedSender` are no longer declared here — they now come from the hoisted declarations added in Task 8, and are still used further down in this same function (in the confidence-scoring block).

- [ ] **Step 2: Add rejection logging to the confidence<65 drop**

Find:

```typescript
        if (confidence < 65) {
          skippedConfidence++
          if (skippedEmailsDetails.length < 5) {
            const domain = fromValue.match(/@([\w.-]+)/)?.[1] || 'unknown'
            skippedEmailsDetails.push(`${domain}|"${subject.substring(0, 30)}"|Conf:${confidence}`)
          }
          continue
        }
```

Replace with:

```typescript
        if (confidence < 65) {
          skippedConfidence++
          if (skippedEmailsDetails.length < 5) {
            skippedEmailsDetails.push(`${senderDomain || 'unknown'}|"${subject.substring(0, 30)}"|Conf:${confidence}`)
          }
          logRejection(supabase, user.id, scanLogId, 'confidence_below_65', senderDomain, subject, `confidence=${confidence}`)
          continue
        }
```

- [ ] **Step 3: Add rejection logging to the AI-path confident-reject branch**

Find:

```typescript
      if (aiConfidentReject && !parsedTxn) continue
```

Replace with:

```typescript
      if (aiConfidentReject && !parsedTxn) {
        logRejection(supabase, user.id, scanLogId, 'ai_confident_reject', senderDomain, subject, '')
        continue
      }
```

- [ ] **Step 4: Verify the project typechecks and existing tests still pass**

Run: `npm run build && npm run test`
Expected: build succeeds; all existing test suites still pass (this task only touches `emailScanner.ts`, which had no prior tests, so no existing test should be affected).

- [ ] **Step 5: Commit**

```bash
git add src/services/emailScanner.ts
git commit -m "feat: wire extracted gates and rejection logging into regex fallback path"
```

---

### Task 10: Stamp the `id` on every `email_scan_logs` insert with `scanLogId`

**Files:**
- Modify: `src/services/emailScanner.ts:924-930` (zero-messages branch)
- Modify: `src/services/emailScanner.ts:1312-1324` (zero-transactions branch)
- Modify: `src/services/emailScanner.ts:1339-1348` (success branch)
- Modify: `src/services/emailScanner.ts:1375-1383` (failure branch)

This makes the scan log's own `id` match the `scanLogId` already referenced by every `logRejection()` call during this scan, so a rejection row's `scan_log_id` foreign key actually correlates with the finished scan.

- [ ] **Step 1: Zero-messages branch**

Find:

```typescript
    if (uniqueMessages.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({ user_id: user.id, emails_processed: 0, transactions_found: 0, status: 'success' })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }
```

Replace with:

```typescript
    if (uniqueMessages.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({ id: scanLogId, user_id: user.id, emails_processed: 0, transactions_found: 0, status: 'success' })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }
```

- [ ] **Step 2: Zero-transactions-found branch**

Find:

```typescript
    if (transactionsToInsert.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
          error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (low confidence). Samples: ${skippedEmailsDetails.join('; ')}` : null,
        })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }
```

Replace with:

```typescript
    if (transactionsToInsert.length === 0) {
      const { data: log } = await supabase
        .from('email_scan_logs')
        .insert({
          id: scanLogId,
          user_id: user.id,
          emails_processed: validDetails.length,
          transactions_found: 0,
          status: 'success',
          error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (low confidence). Samples: ${skippedEmailsDetails.join('; ')}` : null,
        })
        .select().single()
      return { data: { transactions: [], log: log as EmailScanLog, autoApprovedCount: 0 }, error: null }
    }
```

- [ ] **Step 3: Success branch**

Find:

```typescript
    const { data: scanLog, error: logError } = await supabase
      .from('email_scan_logs')
      .insert({
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: transactionsToInsert.length,
        status: 'success',
        error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (confidence < 65). Samples: ${skippedEmailsDetails.join('; ')}` : null,
      })
      .select().single()
```

Replace with:

```typescript
    const { data: scanLog, error: logError } = await supabase
      .from('email_scan_logs')
      .insert({
        id: scanLogId,
        user_id: user.id,
        emails_processed: validDetails.length,
        transactions_found: transactionsToInsert.length,
        status: 'success',
        error_message: skippedConfidence > 0 ? `${skippedConfidence} email(s) skipped (confidence < 65). Samples: ${skippedEmailsDetails.join('; ')}` : null,
      })
      .select().single()
```

- [ ] **Step 4: Failure branch**

Find:

```typescript
    if (!opts?.userId) {
      await supabase.from('email_scan_logs').insert({
        user_id: user.id,
        emails_processed: 0,
        transactions_found: 0,
        status: 'failed',
        error_message: errorMessage,
      })
    }
```

Replace with:

```typescript
    if (!opts?.userId) {
      await supabase.from('email_scan_logs').insert({
        id: scanLogId,
        user_id: user.id,
        emails_processed: 0,
        transactions_found: 0,
        status: 'failed',
        error_message: errorMessage,
      })
    }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/emailScanner.ts
git commit -m "feat: correlate email_scan_logs rows with their scan's rejection log entries"
```

---

### Task 11: Remove the message-count cap — window defines the scan, never a count

**Files:**
- Modify: `src/services/emailScanner.ts:896-915` (pagination loop)

The scan contract is: the time window defines what gets scanned, never a message count. `messages.slice(0, messageLimit)` currently discards anything past 100 (200 for the owner) within a window — most likely exactly when a window has the most mail (a first 7-day scan, or a scan after a gap). This removes that cap for the normal scan; `maxResults` remains as a per-page size only.

- [ ] **Step 1: Find the current pagination loop**

```typescript
    let messages: { id: string; threadId: string }[] = []
    let nextPageToken = ''

    do {
      const maxResults = isOwner ? 200 : 100
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })

      if (listRes.status === 401 || listRes.status === 403) {
        clearGoogleToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)

      const listData = await listRes.json() as any
      if (listData.messages) messages = messages.concat(listData.messages)
      const messageLimit = isOwner ? 200 : 100
      if (messages.length >= messageLimit) { messages = messages.slice(0, messageLimit); break }
      nextPageToken = listData.nextPageToken || ''
    } while (nextPageToken)
```

- [ ] **Step 2: Replace with full pagination — no count cap**

```typescript
    let messages: { id: string; threadId: string }[] = []
    let nextPageToken = ''

    // Page size only — NOT a cap on total messages processed. The scan
    // window (isFirstScan / since-last-successful-scan, computed above)
    // defines completeness; a message-count cap here would silently
    // truncate the oldest matches whenever a window has more mail than
    // the cap, which is exactly when completeness matters most (a first
    // 7-day scan, or a scan after a gap).
    do {
      const pageSize = isOwner ? 200 : 100
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${pageSize}&q=${encodeURIComponent(q)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${providerToken}` } })

      if (listRes.status === 401 || listRes.status === 403) {
        clearGoogleToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!listRes.ok) throw new Error(`Gmail API List failed: ${listRes.statusText}`)

      const listData = await listRes.json() as any
      if (listData.messages) messages = messages.concat(listData.messages)
      nextPageToken = listData.nextPageToken || ''
    } while (nextPageToken)
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/emailScanner.ts
git commit -m "fix: remove message-count cap — scan window alone defines completeness"
```

---

### Task 12: `deepRescanGmailInbox()` — recover pre-fix history

**Files:**
- Modify: `src/services/emailScanner.ts` (window calculation block, ~830-894; cooldown block, ~799-819; function signature and options)

Adds a `mode: 'normal' | 'deep'` parameter to the scan window logic, so `deepRescanGmailInbox()` shares the exact same parsing/gating code as the normal scan and differs only in which window it computes.

- [ ] **Step 1: Extend `ScanGmailOptions`**

Find:

```typescript
export interface ScanGmailOptions {
  /** Supabase client to use for all DB reads/writes during this scan. Defaults to the browser singleton. */
  db?: SupabaseClient
  /** User id/email to scan for. When provided (with accessToken), the browser session lookup is skipped entirely — this is the server-side/cron path. */
  userId?: string
  userEmail?: string
  /** Google API access token to use directly, bypassing localStorage/session lookup. */
  accessToken?: string
  /** Active financial year to scope the scan to. Defaults to the browser's localStorage value (or 2026). */
  activeYear?: number
  /** AI email analyzer to use. Defaults to the proxy-based `analyzeTransactionEmailWithAI`. */
  askAI?: (subject: string, body: string, emailDate: string, categoryNames?: string[]) => ReturnType<typeof analyzeTransactionEmailWithAI>
}
```

Replace with:

```typescript
export interface ScanGmailOptions {
  /** Supabase client to use for all DB reads/writes during this scan. Defaults to the browser singleton. */
  db?: SupabaseClient
  /** User id/email to scan for. When provided (with accessToken), the browser session lookup is skipped entirely — this is the server-side/cron path. */
  userId?: string
  userEmail?: string
  /** Google API access token to use directly, bypassing localStorage/session lookup. */
  accessToken?: string
  /** Active financial year to scope the scan to. Defaults to the browser's localStorage value (or 2026). */
  activeYear?: number
  /** AI email analyzer to use. Defaults to the proxy-based `analyzeTransactionEmailWithAI`. */
  askAI?: (subject: string, body: string, emailDate: string, categoryNames?: string[]) => ReturnType<typeof analyzeTransactionEmailWithAI>
  /**
   * Internal: 'normal' (default) uses the standard first-scan-7-days /
   * since-last-successful-scan window. 'deep' ignores that window entirely
   * and scans back `lookbackDays` from now instead — used by
   * deepRescanGmailInbox() to recover transactions from before a scanner
   * fix shipped, since the normal rolling window will never look at them
   * again.
   */
  mode?: 'normal' | 'deep'
  /** Only used when mode === 'deep'. Clamped to [1, 30]. */
  lookbackDays?: number
}
```

- [ ] **Step 2: Bypass the 24h cooldown for deep-rescan mode**

Find:

```typescript
    if (!isOwner && !isPremium) {
      const { data: recentScanLogs } = await supabase
        .from('email_scan_logs')
        .select('scanned_at')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)

      if (recentScanLogs && recentScanLogs.length > 0) {
        const lastScanTime = new Date(recentScanLogs[0].scanned_at).getTime()
        const hoursSinceLastScan = (Date.now() - lastScanTime) / (60 * 60 * 1000)
        if (hoursSinceLastScan < 24) {
          const hoursLeft = Math.ceil(24 - hoursSinceLastScan)
          return {
            data: null,
            error: new Error(`Scan limit reached. Next scan available in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. All transactions from your last scan are already captured.`),
          }
        }
      }
    }
```

Replace with:

```typescript
    const mode = opts?.mode ?? 'normal'

    // Deep rescan is an explicit, manual, user-triggered recovery action —
    // same bypass precedent as the owner/premium eligibility check above —
    // so it isn't subject to the automatic-scan cooldown. The UI applies
    // its own client-side rate limit (Task 16) to prevent accidental
    // repeated runs.
    if (!isOwner && !isPremium && mode !== 'deep') {
      const { data: recentScanLogs } = await supabase
        .from('email_scan_logs')
        .select('scanned_at')
        .eq('user_id', user.id)
        .eq('status', 'success')
        .order('scanned_at', { ascending: false })
        .limit(1)

      if (recentScanLogs && recentScanLogs.length > 0) {
        const lastScanTime = new Date(recentScanLogs[0].scanned_at).getTime()
        const hoursSinceLastScan = (Date.now() - lastScanTime) / (60 * 60 * 1000)
        if (hoursSinceLastScan < 24) {
          const hoursLeft = Math.ceil(24 - hoursSinceLastScan)
          return {
            data: null,
            error: new Error(`Scan limit reached. Next scan available in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. All transactions from your last scan are already captured.`),
          }
        }
      }
    }
```

- [ ] **Step 3: Branch the window calculation on `mode`**

Find:

```typescript
    const EMAIL_KEYWORDS = '(debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)'

    const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 // never scan back further than 30 days
    let startLimitTime = 0
    let q = ''
    if (isFirstScan) {
      // First scan: look back 7 days
      startLimitTime = Date.now() - 7 * 24 * 60 * 60 * 1000
    } else {
      // Subsequent scans: cover everything since the last *successful* scan (with a
      // small overlap buffer, since Gmail's date-only granularity and delayed bank
      // emails can otherwise leave same-day messages just outside the window), but
      // never less than a 26-hour window. Anchoring to "now - 26h" alone (instead of
      // the last successful scan) silently drops days of transactions whenever the
      // app isn't opened for more than 26 hours — or whenever the automatic daily
      // cron is delayed/fails for more than 26 hours — since the Gmail query itself
      // excludes anything before that cutoff; dedup can't recover emails that were
      // never fetched.
      const sinceLastScan = lastScanTime - 2 * 60 * 60 * 1000
      const rolling26h = Date.now() - 26 * 60 * 60 * 1000
      startLimitTime = Math.min(sinceLastScan, rolling26h)
      startLimitTime = Math.max(startLimitTime, Date.now() - MAX_LOOKBACK_MS)
    }
    // Use Unix epoch (seconds) for precise filtering — Gmail supports this format
    const sinceSeconds = Math.floor(startLimitTime / 1000)
    q = `after:${sinceSeconds} ${EMAIL_KEYWORDS}`
```

Replace with:

```typescript
    const EMAIL_KEYWORDS = '(debited OR credited OR spent OR paid OR payment OR txn OR transaction OR transfer OR received OR withdrawn OR charged OR neft OR imps OR rtgs OR netbanking OR upi OR emi OR sip OR salary)'

    const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 // never scan back further than 30 days
    let startLimitTime = 0
    let q = ''
    if (mode === 'deep') {
      // Recovery path: ignore the rolling since-last-scan window entirely
      // and scan back a user-chosen number of days, so transactions missed
      // before a scanner fix shipped (which the normal window will never
      // reach again) can be recovered on demand.
      const days = Math.min(Math.max(opts?.lookbackDays ?? 7, 1), 30)
      startLimitTime = Date.now() - days * 24 * 60 * 60 * 1000
    } else if (isFirstScan) {
      // First scan: look back 7 days
      startLimitTime = Date.now() - 7 * 24 * 60 * 60 * 1000
    } else {
      // Subsequent scans: cover everything since the last *successful* scan (with a
      // small overlap buffer, since Gmail's date-only granularity and delayed bank
      // emails can otherwise leave same-day messages just outside the window), but
      // never less than a 26-hour window. Anchoring to "now - 26h" alone (instead of
      // the last successful scan) silently drops days of transactions whenever the
      // app isn't opened for more than 26 hours — or whenever the automatic daily
      // cron is delayed/fails for more than 26 hours — since the Gmail query itself
      // excludes anything before that cutoff; dedup can't recover emails that were
      // never fetched.
      const sinceLastScan = lastScanTime - 2 * 60 * 60 * 1000
      const rolling26h = Date.now() - 26 * 60 * 60 * 1000
      startLimitTime = Math.min(sinceLastScan, rolling26h)
      startLimitTime = Math.max(startLimitTime, Date.now() - MAX_LOOKBACK_MS)
    }
    // Use Unix epoch (seconds) for precise filtering — Gmail supports this format
    const sinceSeconds = Math.floor(startLimitTime / 1000)
    q = `after:${sinceSeconds} ${EMAIL_KEYWORDS}`
```

- [ ] **Step 4: Add the `deepRescanGmailInbox` export at the end of the file**

Find the end of the file:

```typescript
/**
 * Calculate the last scheduled refresh time (always target scan time today or yesterday)
 */
export function getLastScheduledRefreshTime(dailyScanTime = '06:00'): Date {
  const [hour, minute] = dailyScanTime.split(':').map(Number)
  const now = new Date()
  const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour || 6, minute || 0, 0, 0)
  if (now.getTime() >= todayTarget.getTime()) return todayTarget
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour || 6, minute || 0, 0, 0)
}
```

Append after it:

```typescript

/**
 * Recovers transactions from a wider historical window than the normal
 * rolling scan ever revisits — e.g. transactions missed before a scanner
 * bug fix shipped. Shares the exact same parsing/gating/dedup logic as
 * scanRealGmailInbox(); the only difference is the time window (see the
 * mode === 'deep' branch above). Not subject to the 24h scan cooldown —
 * this is an explicit, manual, user-triggered recovery action.
 */
export async function deepRescanGmailInbox(opts: ScanGmailOptions & { lookbackDays: number }) {
  return scanRealGmailInbox({ ...opts, mode: 'deep' })
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/emailScanner.ts
git commit -m "feat: add deepRescanGmailInbox for recovering pre-fix missed transactions"
```

---

### Task 13: Barrel exports

**Files:**
- Modify: `src/services/index.ts:23-35`

- [ ] **Step 1: Export the new function**

Find:

```typescript
export {
  getScanLogs,
  scanRealGmailInbox,
  getMerchantRules,
  saveMerchantRule,
  deleteMerchantRule,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  cleanMerchantName,
  getMerchantSettings,
  saveMerchantSetting,
  applyMerchantRules,
} from './emailScanner'
```

Replace with:

```typescript
export {
  getScanLogs,
  scanRealGmailInbox,
  deepRescanGmailInbox,
  getMerchantRules,
  saveMerchantRule,
  deleteMerchantRule,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  cleanMerchantName,
  getMerchantSettings,
  saveMerchantSetting,
  applyMerchantRules,
} from './emailScanner'
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/index.ts
git commit -m "feat: export deepRescanGmailInbox from services barrel"
```

---

### Task 14: Integration test — the Axis email produces a transaction end-to-end

**Files:**
- Create: `src/services/emailScanner.test.ts`

This is the regression test that pins the reported bug shut: it mocks Gmail and Supabase, forces the AI path to fail (so the fix in the regex fallback path is what's actually being exercised), and asserts `scanRealGmailInbox()` produces exactly one transaction row with the correct amount, direction, and event type.

- [ ] **Step 1: Write the test**

```typescript
// src/services/emailScanner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAxisEmiGmailMessage } from './__fixtures__/axisEmiDebit'

vi.mock('./googleAuth', () => ({
  getGoogleToken: () => 'fake-access-token',
  clearGoogleToken: () => {},
  tryRefreshGoogleToken: async () => null,
}))

vi.mock('./learningEngine', () => ({
  applyMerchantRulesFromDB: async () => {
    throw new Error('no DB rule — force fallback to local applyMerchantRules')
  },
}))

function makeTableMock(response: any, opts: { insertCapture?: any[] } = {}) {
  const handler: any = {
    select: () => handler,
    eq: () => handler,
    order: () => handler,
    limit: () => handler,
    single: () => Promise.resolve(response),
    insert: (row: any) => {
      opts.insertCapture?.push(row)
      return {
        select: () => ({ single: () => Promise.resolve(response) }),
        then: (resolve: any) => resolve(response),
      }
    },
    then: (resolve: any) => resolve(response),
  }
  return handler
}

describe('scanRealGmailInbox — Axis EMI debit regression', () => {
  const insertedTransactions: any[] = []
  const insertedRejections: any[] = []

  let mockDb: any

  beforeEach(() => {
    insertedTransactions.length = 0
    insertedRejections.length = 0

    mockDb = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-1', email: 'test@example.com' }, access_token: 'tok' } },
        }),
      },
      from: (table: string) => {
        if (table === 'profiles') return makeTableMock({ data: null, error: null })
        if (table === 'email_scan_logs') return makeTableMock({ data: [], error: null })
        if (table === 'cards') return makeTableMock({ data: [], error: null })
        if (table === 'transactions') {
          return makeTableMock({ data: [], error: null }, { insertCapture: insertedTransactions })
        }
        if (table === 'categories') {
          return makeTableMock({
            data: [
              { name: 'Food & Dining', is_permanent: false },
              { name: 'Groceries', is_permanent: false },
              { name: 'Other', is_permanent: true },
            ],
            error: null,
          })
        }
        if (table === 'email_scan_rejections') {
          return makeTableMock({ error: null }, { insertCapture: insertedRejections })
        }
        return makeTableMock({ data: [], error: null })
      },
    }

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'msg-axis-emi-1', threadId: 'thread-axis-emi-1' }] }),
        } as any
      }
      if (url.includes('/messages/msg-axis-emi-1')) {
        return { ok: true, status: 200, json: async () => makeAxisEmiGmailMessage() } as any
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    }) as any
  })

  it('captures the Axis EMI debit email as a transaction (amount, direction, event type)', async () => {
    const { scanRealGmailInbox } = await import('./emailScanner')

    const result = await scanRealGmailInbox({
      db: mockDb,
      activeYear: 2026,
      // Force the AI path to fail so this test exercises the regex
      // fallback path — the one that was silently dropping this email.
      askAI: async () => null,
    })

    expect(result.error).toBeNull()
    expect(insertedTransactions).toHaveLength(1)
    const txn = insertedTransactions[0][0]
    expect(txn.amount).toBe(42293)
    expect(txn.type).toBe('debit')
    expect(txn.event_type).toBe('emi')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/services/emailScanner.test.ts`
Expected: PASS (1 test)

If it fails, the most likely causes and where to look:
- `insertedTransactions[0][0]` shape mismatch — Supabase's real `.insert(rows)` call passes an array; adjust the assertion to match what `mockDb.from('transactions').insert(...)` actually receives (log it with `console.log(JSON.stringify(insertedTransactions))` to check).
- If `amount`/`type` come back `undefined`, the email never reached the transaction-building code — add a temporary `console.log` right after `evaluateRegexGates` in `emailScanner.ts` to see which gate (if any) is still rejecting it, then compare against the `emailScanGates.test.ts` regression test from Task 6 (which asserts the same fixture is not rejected by the gates in isolation).

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `npm run test`
Expected: all suites pass, including the pre-existing `transactions.test.ts`, `categories.test.ts`, `learningEngine.test.ts`, `aiService.test.ts`, `googleAuth.test.ts`, `insurance.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/emailScanner.test.ts
git commit -m "test: add end-to-end regression test for the Axis EMI debit recall bug"
```

---

### Task 15: Retention cron for `email_scan_rejections`

**Files:**
- Create: `api/cleanup-scan-rejections.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cleanup endpoint**

```typescript
// api/cleanup-scan-rejections.ts
//
// Daily cron: deletes email_scan_rejections rows older than 30 days. This
// is diagnostic data (why a scan rejected an email), not a permanent
// record, so it doesn't need to accumulate indefinitely.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await supabaseAdmin
    .from('email_scan_rejections')
    .delete({ count: 'exact' })
    .lt('rejected_at', cutoff)

  if (error) {
    console.error('cleanup-scan-rejections: delete failed', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ deleted: count ?? 0 })
}
```

- [ ] **Step 2: Add the cron entry**

In `vercel.json`, find:

```json
  "crons": [
    {
      "path": "/api/weekly-digest",
      "schedule": "0 6 * * 1"
    },
    {
      "path": "/api/auto-sync-gmail",
      "schedule": "30 21 * * *"
    }
  ],
```

Replace with:

```json
  "crons": [
    {
      "path": "/api/weekly-digest",
      "schedule": "0 6 * * 1"
    },
    {
      "path": "/api/auto-sync-gmail",
      "schedule": "30 21 * * *"
    },
    {
      "path": "/api/cleanup-scan-rejections",
      "schedule": "0 3 * * *"
    }
  ],
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add api/cleanup-scan-rejections.ts vercel.json
git commit -m "feat: add daily cleanup cron for email_scan_rejections (30-day retention)"
```

---

### Task 16: UI — "Deep Rescan" button on Pending Alerts

**Files:**
- Modify: `src/pages/PendingPage.tsx`

- [ ] **Step 1: Add state and the deep-rescan handler**

Find:

```typescript
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  scanRealGmailInbox,
  saveMerchantRule,
  supabase,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  applyMerchantRules,
} from '@/services'
```

Replace with:

```typescript
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  scanRealGmailInbox,
  deepRescanGmailInbox,
  saveMerchantRule,
  supabase,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  applyMerchantRules,
} from '@/services'
```

Find the `scanCooldownMessage` state declaration:

```typescript
  const [scanCooldownMessage, setScanCooldownMessage] = useState<string | null>(null)
```

Add after it:

```typescript
  const [scanCooldownMessage, setScanCooldownMessage] = useState<string | null>(null)
  const [showDeepRescanModal, setShowDeepRescanModal] = useState(false)
  const [deepRescanning, setDeepRescanning] = useState(false)
  const [deepRescanLookbackDays, setDeepRescanLookbackDays] = useState(7)
  const [lastDeepRescanAt, setLastDeepRescanAt] = useState<number | null>(null)
```

- [ ] **Step 2: Add the handler function**

Find the end of `handleScan`:

```typescript
  const handleScan = async () => {
    // ... existing body ...
    } finally {
      setScanning(false)
    }
  }
```

Add a new function immediately after it:

```typescript
  const DEEP_RESCAN_MIN_INTERVAL_MS = 60 * 60 * 1000 // client-side: once per hour

  const handleDeepRescan = async () => {
    if (lastDeepRescanAt && Date.now() - lastDeepRescanAt < DEEP_RESCAN_MIN_INTERVAL_MS) {
      setError('Deep Rescan can only be run once per hour. Please wait before trying again.')
      return
    }

    setDeepRescanning(true)
    setError(null)
    setShowDeepRescanModal(false)

    try {
      const res = await deepRescanGmailInbox({ lookbackDays: deepRescanLookbackDays })

      if (res.error) throw res.error

      const count = res.data?.transactions?.length || 0
      const autoApproved = res.data?.autoApprovedCount || 0
      setScanSuccessMessage({
        total: count,
        autoApproved,
        pendingReview: count - autoApproved,
        skipped: (res.data as any)?.skippedConfidence || 0,
      })
      setLastDeepRescanAt(Date.now())

      await fetchPendingData()
      await fetchLastScanLog()
      await fetchUnconfirmedCategorizations()
    } catch (err: any) {
      console.error('Deep rescan error:', err)
      setError(err.message || 'Deep rescan failed. Please try again.')
    } finally {
      setDeepRescanning(false)
    }
  }
```

- [ ] **Step 3: Add the button next to "Scan Bank Alerts" and the confirmation modal**

Find:

```typescript
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => handleScan()}
                loading={scanning || syncingBackground}
                disabled={scanning || syncingBackground || !!scanCooldownMessage}
                className="shrink-0 gap-1.5 shadow-md justify-center"
                aria-label="Scan Gmail Inbox for new bank alerts"
              >
                <Sparkles className="h-4 w-4 text-brand-300" /> Scan Bank Alerts
              </Button>
            </div>
```

Replace with:

```typescript
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => handleScan()}
                loading={scanning || syncingBackground}
                disabled={scanning || syncingBackground || !!scanCooldownMessage}
                className="shrink-0 gap-1.5 shadow-md justify-center"
                aria-label="Scan Gmail Inbox for new bank alerts"
              >
                <Sparkles className="h-4 w-4 text-brand-300" /> Scan Bank Alerts
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeepRescanModal(true)}
                loading={deepRescanning}
                disabled={scanning || syncingBackground || deepRescanning}
                className="shrink-0 gap-1.5 justify-center"
                aria-label="Deep rescan a wider email history window"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Deep Rescan
              </Button>
            </div>
```

Find the closing of the component's main return, i.e. the last `</AppLayout>` (or the outermost closing tag before the final `)` and `}`), and add the modal as a sibling just before it — for a concrete anchor, find:

```typescript
      </div>
    </AppLayout>
  )
}
```

Replace with:

```typescript
      </div>

      <Modal
        isOpen={showDeepRescanModal}
        onClose={() => setShowDeepRescanModal(false)}
        title="Deep Rescan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeepRescanModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleDeepRescan} loading={deepRescanning}>
              Start Deep Rescan
            </Button>
          </>
        }
      >
        <p className="mb-4">
          Deep Rescan looks back further than the normal scan and processes every
          matching email in that window — useful for recovering transactions that
          were missed before a scanner fix. It may take longer than a normal scan
          and uses more of your daily AI quota.
        </p>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Look back
        </label>
        <Select
          value={String(deepRescanLookbackDays)}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDeepRescanLookbackDays(Number(e.target.value))}
        >
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </Select>
      </Modal>
    </AppLayout>
  )
}
```

`Select` (`src/components/ui/Select.tsx`) extends native `SelectHTMLAttributes<HTMLSelectElement>`, so a standard `onChange={(e: React.ChangeEvent<HTMLSelectElement>) => ...}` is correct as written above — no adjustment needed.

- [ ] **Step 4: Add `Modal` to the imports**

Confirm `Modal` is already imported (it is, per the existing import block: `import { Card, Button, Input, Select, Badge, EmptyState, Modal } from '@/components/ui'`) — no change needed here.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, open Pending Alerts, click "Deep Rescan", confirm the modal opens with the 7/14/30-day picker, and that "Start Deep Rescan" is disabled/loading while a scan is in progress. (Full Gmail-connected verification requires a real connected account — at minimum confirm the modal opens/closes correctly and the button reaches `handleDeepRescan`.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/PendingPage.tsx
git commit -m "feat(ui): add Deep Rescan button and lookback picker to Pending Alerts"
```

---

### Task 17: UI — "Recently skipped emails" panel

**Files:**
- Modify: `src/pages/PendingPage.tsx`

- [ ] **Step 1: Make `fetchLastScanLog` return the fetched log**

`fetchLastScanLog` (defined at `PendingPage.tsx:191`) today only calls `setLastScanLog(...)` and returns nothing. Reading `lastScanLog` state immediately after `await fetchLastScanLog()` in the same function would read a **stale closure value** — React state set via `setLastScanLog` isn't reflected in the `lastScanLog` variable already captured in the enclosing function's closure until the next render. So `fetchLastScanLog` needs to also return the row it fetched, and callers should use that return value directly instead of reading `lastScanLog` state.

Find:

```typescript
  const fetchLastScanLog = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('email_scan_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('scanned_at', { ascending: false })
        .limit(1)
      if (data && data.length > 0) setLastScanLog(data[0])
    } catch {}
  }, [user])
```

Replace with:

```typescript
  const fetchLastScanLog = useCallback(async () => {
    if (!user) return null
    try {
      const { data } = await supabase
        .from('email_scan_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('scanned_at', { ascending: false })
        .limit(1)
      if (data && data.length > 0) {
        setLastScanLog(data[0])
        return data[0]
      }
      return null
    } catch {
      return null
    }
  }, [user])
```

- [ ] **Step 2: Add state and a fetch function for the latest rejections**

Add right after the `fetchLastScanLog` definition:

```typescript
  const [recentRejections, setRecentRejections] = useState<
    { id: string; sender_domain: string | null; subject: string | null; gate: string; rejected_at: string }[]
  >([])
  const [showRejectionsPanel, setShowRejectionsPanel] = useState(false)

  const fetchRecentRejections = useCallback(async (scanLogId: string | null) => {
    if (!scanLogId) {
      setRecentRejections([])
      return
    }
    const { data, error } = await supabase
      .from('email_scan_rejections')
      .select('id, sender_domain, subject, gate, rejected_at')
      .eq('scan_log_id', scanLogId)
      .order('rejected_at', { ascending: false })
      .limit(20)
    if (!error && data) setRecentRejections(data as any)
  }, [])
```

- [ ] **Step 3: Call it after fetching the last scan log, using the returned value**

There are two call sites: inside `handleScan` (`await fetchLastScanLog()` at `PendingPage.tsx:623`) and inside `handleDeepRescan` (added in Task 16). Replace each occurrence of:

```typescript
      await fetchLastScanLog()
```

with:

```typescript
      const freshScanLog = await fetchLastScanLog()
      await fetchRecentRejections(freshScanLog?.id ?? null)
```

There is a third call site inside the initial page-load effect (`PendingPage.tsx:336`, `fetchLastScanLog()` not awaited/used). Leave that one as-is — the rejections panel only needs to refresh right after a scan completes, not on every page load.

- [ ] **Step 4: Render the panel**

Find the "Scan Dashboard" card grid block (search for `Scan Dashboard`):

```typescript
        {/* ── Scan Dashboard ───────────────────────────────── */}
        {lastScanLog && (
          <div className="grid gap-3 sm:grid-cols-3">
```

Add a collapsible panel immediately after that grid's closing `</div>` (the one that closes the 3-column grid, right before the `{/* Error banner */}` comment):

```typescript
        {lastScanLog && recentRejections.length > 0 && (
          <div className="rounded-2xl border border-border-subtle bg-surface-1">
            <button
              type="button"
              onClick={() => setShowRejectionsPanel((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-300"
            >
              <span>Recently skipped emails ({recentRejections.length})</span>
              <span className="text-xs text-zinc-500">{showRejectionsPanel ? 'Hide' : 'Show'}</span>
            </button>
            {showRejectionsPanel && (
              <div className="px-4 pb-4 space-y-2">
                {recentRejections.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs border-t border-border-subtle/50 pt-2"
                  >
                    <span className="text-zinc-400 truncate">
                      {r.sender_domain || 'unknown sender'} — {r.subject || '(no subject)'}
                    </span>
                    <Badge variant="default" className="shrink-0 w-fit">
                      {r.gate}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
```

`Badge` (`src/components/ui/Badge.tsx`) accepts `variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'aurora'` and spreads remaining props (including `className`) onto the underlying `<span>` — `variant="default"` as written above is correct; there is no `'secondary'` variant.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, trigger a scan against a mailbox known to contain at least one rejected email (e.g. a promotional email), confirm the "Recently skipped emails" panel appears after the scan dashboard and expands/collapses correctly, showing sender domain, subject, and gate name.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PendingPage.tsx
git commit -m "feat(ui): add Recently skipped emails panel to Pending Alerts"
```

---

## Post-implementation checklist

- [ ] `npm run build` passes with zero new errors
- [ ] `npm run test` passes (all suites, including the new ones)
- [ ] `npm run lint` passes
- [ ] The migration (`supabase/010_email_scan_rejections.sql`) has been applied to the Supabase project
- [ ] Manually trigger a real scan against a connected Gmail account and confirm the Axis-style email (or an equivalent real bank alert) now appears as a transaction
- [ ] Manually run a Deep Rescan over the last 7 days and review the "Recently skipped emails" panel for anything that looks like a genuine transaction still being dropped — if found, that becomes a new fixture and gate pattern, following the same process used for the Axis sample in this plan
