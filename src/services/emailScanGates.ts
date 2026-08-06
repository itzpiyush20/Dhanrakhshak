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
