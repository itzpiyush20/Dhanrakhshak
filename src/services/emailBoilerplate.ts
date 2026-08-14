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
  // "Never share your OTP, URN, CVV or passwords with anyone ..." — ICICI Bank
  // closes EVERY credit-card transaction alert with this sentence. The two
  // patterns above only cover the "do not share" phrasing, so the word "OTP"
  // survived into the gated text and `otp_or_security_code` rejected the whole
  // class: every ICICI card transaction the user makes. `urn` is listed
  // alongside the usual secrets because ICICI names it in the same sentence.
  /\b(?:never|do\s+not|don'?t)\s+share\s+(?:your|these|this|such)?[^.]*?(?:otp|cvv|urn|pin|password|card\s*number|details)[^.]*\./gi,
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
  // "(Toll Free)" / "Toll-free, across India" next to a helpline number.
  // Not a rejection problem but a categorisation one: the word "toll" is a
  // Transport keyword, so this footer filed every Axis and HDFC alert — a UPI
  // transfer to a person, a Claude subscription charge — under Transport.
  // Only the exact "toll free" phrasing is removed; a genuine FASTag toll
  // debit never says it.
  /\btoll[-\s]?free\b/gi,
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

/**
 * Longest string any single pattern above is ever run against.
 *
 * These patterns are built from `[^.]*`, `[\s\S]{0,300}?` and `\S+` — shapes
 * whose backtracking cost grows with the length of the input, not with the
 * length of the thing they match. Run against a whole 12,000-char body, a
 * newsletter that ALMOST matches in many places made this the single most
 * expensive operation in the scan: measured in production at 2136ms for a 4KB
 * body, 1581ms for 11KB, while the base64 decode and HTML strip in the same
 * emails took 0-2ms. That is what froze the tab, not the parsing everyone
 * (including several rounds of my own benchmarking) suspected.
 *
 * Every pattern here targets a single footer SENTENCE — the file comment above
 * says so explicitly. None of them ever needed the whole document. Bounding the
 * input each regex sees caps the worst case by construction, so a future
 * pathological body cannot reintroduce this, whatever shape it takes.
 *
 * 600 is comfortably longer than any boilerplate sentence in the fixtures while
 * being short enough that even quadratic backtracking is trivial.
 */
const MAX_PATTERN_INPUT_CHARS = 600

/**
 * Split into segments no longer than `MAX_PATTERN_INPUT_CHARS`, preferring line
 * boundaries. Concatenating the result reproduces the input exactly, so a
 * segment that matches nothing passes through untouched.
 */
function segmentForMatching(text: string): string[] {
  const segments: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + MAX_PATTERN_INPUT_CHARS, text.length)
    if (hardEnd === text.length) {
      segments.push(text.slice(cursor))
      break
    }
    // Prefer to break just after a newline so a footer sentence stays whole.
    const lastBreak = text.lastIndexOf('\n', hardEnd)
    const end = lastBreak > cursor ? lastBreak + 1 : hardEnd
    segments.push(text.slice(cursor, end))
    cursor = end
  }

  return segments
}

export function stripBoilerplate(text: string): string {
  if (!text) return text
  const scanned = text.length > BOILERPLATE_SCAN_TAIL_CHARS
    ? text.slice(-BOILERPLATE_SCAN_TAIL_CHARS)
    : text
  const head = text.length > BOILERPLATE_SCAN_TAIL_CHARS
    ? text.slice(0, text.length - BOILERPLATE_SCAN_TAIL_CHARS)
    : ''

  let strippedTail = ''
  for (const segment of segmentForMatching(scanned)) {
    let stripped = segment
    for (const pattern of BOILERPLATE_SENTENCE_PATTERNS) {
      stripped = stripped.replace(pattern, ' ')
    }
    strippedTail += stripped
  }
  return head + strippedTail
}
