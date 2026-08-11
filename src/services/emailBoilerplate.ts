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
  // "X employees/representatives will NEVER ask you for your personal
  // information i.e. ... etc." (Zomato-style). Unlike every other pattern
  // here, this one can't be scoped with `[^.]*\.` because the fixture's
  // sentence contains an embedded "i.e." abbreviation — a bare `[^.]` class
  // treats that internal period as the sentence end and truncates the
  // match early. `[\s\S]` is used instead to cross that period, but an
  // unbounded `[\s\S]*?` would let the match run across sentence AND
  // paragraph breaks looking for a later "etc.", risking real transaction
  // content being swallowed on emails shaped differently. The `{0,300}`
  // cap keeps it "deliberately conservative" per the header above: enough
  // room for one sentence with an inline abbreviation, not enough to reach
  // into an unrelated paragraph. If "etc." isn't found within that span,
  // the pattern simply doesn't match (fails closed).
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

export function stripBoilerplate(text: string): string {
  if (!text) return text
  let result = text
  for (const pattern of BOILERPLATE_SENTENCE_PATTERNS) {
    result = result.replace(pattern, ' ')
  }
  return result
}
