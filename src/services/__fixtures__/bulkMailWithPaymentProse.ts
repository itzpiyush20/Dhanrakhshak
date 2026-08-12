// src/services/__fixtures__/bulkMailWithPaymentProse.ts
//
// Synthetic newsletter that DOES contain payment vocabulary — but only in
// article prose, far from the ₹ figure. Proves the amount-proximity gate
// catches what the pre-AI gate deliberately lets through, since the pre-AI
// gate scans the whole message and would find "paid" here.

import { daysAgoMs } from './_fixtureClock'

export const BULK_PROSE_SUBJECT = 'Markets Weekly: what moved and why'

export const BULK_PROSE_FROM = 'Markets Weekly <digest@marketsweekly.example>'

export const BULK_PROSE_BODY = `Markets Weekly

In this issue we look at how the country's largest infrastructure firms paid down debt through a difficult quarter, and what that means for the sector.

Analysts remain divided. One house has charged that the recovery is uneven.

${'Filler commentary to separate the payment prose above from the figure below. '.repeat(12)}

Shares of the company closed at ₹ 95.30 on Friday, up marginally on the week.

You are receiving this email because you signed up at marketsweekly.example.
Manage how you receive future issues at marketsweekly.example/prefs.`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the payment-prose newsletter. */
export function makeBulkProseGmailMessage(id = 'msg-bulk-prose-1') {
  return {
    id,
    threadId: 'thread-bulk-prose-1',
    snippet: 'Markets Weekly. In this issue we look at how the largest infrastructure firms paid down debt...',
    internalDate: daysAgoMs(2),
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
