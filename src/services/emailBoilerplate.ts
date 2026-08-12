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
  /\bdo\s+not\s+share\s+(?:your|these|this|such)[^.]*?(?:otp|cvv|pin|password|card\s*number|details)[^.]*\./gi,
  /\b\S+\s+(?:employees|representatives)?\s*(?:or\s+representatives)?\s+will\s+never\s+ask\s+you\s+for\s+your\s+personal\s+information\b[\s\S]{0,300}?etc\.?/gi,
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

// Every pattern above targets footer material — security disclaimers, "do not
// share your OTP", legal/confidentiality notices, RBI advisories, "know
// more >>" — which sits at the END of an email, never in the middle. Genuine
// bank/transaction emails are short (every fixture in __fixtures__ is under
// 1700 chars), so this bound never touches real transaction content.
//
// It exists because this function used to run all ~14 global regexes across
// the FULL, untruncated body of every candidate, unconditionally. That was
// cheap for a normal bank alert and expensive enough on a large body —
// hundreds of KB, which large marketing/newsletter HTML converts to after
// text extraction — to block the main thread for multiple seconds on a
// SINGLE email. A periodic yield elsewhere in the scan loop can only rescue
// stalls BETWEEN emails, not a stall inside one, which is exactly what
// produced Chrome's "Page Unresponsive" dialog mid-scan.
const BOILERPLATE_SCAN_TAIL_CHARS = 12000

export function stripBoilerplate(text: string): string {
  if (!text) return text
  const scanned = text.length > BOILERPLATE_SCAN_TAIL_CHARS
    ? text.slice(-BOILERPLATE_SCAN_TAIL_CHARS)
    : text
  const head = text.length > BOILERPLATE_SCAN_TAIL_CHARS
    ? text.slice(0, text.length - BOILERPLATE_SCAN_TAIL_CHARS)
    : ''

  let strippedTail = scanned
  for (const pattern of BOILERPLATE_SENTENCE_PATTERNS) {
    strippedTail = strippedTail.replace(pattern, ' ')
  }
  return head + strippedTail
}
