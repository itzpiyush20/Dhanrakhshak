// src/services/__fixtures__/refundAndPremium.ts
//
// Two classes brought into scope by R2 ("everything financial"), both chosen
// because they are genuine gaps rather than convenient examples: the money has
// already moved, but the email uses NONE of the verbs the original fetch query
// looked for (debited / credited / paid / payment / ...).
//
// Before the FINANCIAL_KEYWORDS group was added these were never fetched at
// all, so no gate, AI verdict or dedup pass could have recovered them.

import { daysAgoMs } from './_fixtureClock'

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

// ── Refund: "processed", never "credited" ────────────────────────────
export const REFUND_SUBJECT = 'Your refund has been processed'
export const REFUND_FROM = 'Amazon.in <auto-confirm@amazon.in>'
export const REFUND_BODY = `Hello,

Your refund of Rs.1,299.00 for order 408-2266713-1234567 has been processed
and will reflect in your account within 3-5 business days.

Item: Wireless Mouse
Refund reference: RFND8891203

Thank you for shopping with us.`

export function makeRefundGmailMessage(id = 'msg-refund-1') {
  return {
    id,
    threadId: 'thread-refund-1',
    snippet: 'Your refund of Rs.1,299.00 has been processed...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: REFUND_SUBJECT },
        { name: 'From', value: REFUND_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(REFUND_BODY) },
    },
  }
}

// ── Insurance premium: "collected", never "debited" ──────────────────
export const PREMIUM_SUBJECT = 'Premium successfully collected for policy 8891203'
export const PREMIUM_FROM = 'HDFC Life <noreply@hdfclife.in>'
export const PREMIUM_BODY = `Dear Policyholder,

We confirm that the premium of Rs.12,500.00 towards your policy number 8891203
has been successfully collected on 10-08-2026 via NACH mandate.

Policy: HDFC Life Click 2 Protect
Premium amount: Rs.12,500.00
Next due: 10-08-2027

This is a system generated confirmation.`

export function makePremiumGmailMessage(id = 'msg-premium-1') {
  return {
    id,
    threadId: 'thread-premium-1',
    snippet: 'Premium of Rs.12,500.00 successfully collected...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: PREMIUM_SUBJECT },
        { name: 'From', value: PREMIUM_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(PREMIUM_BODY) },
    },
  }
}
