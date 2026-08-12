// src/services/__fixtures__/uberTripReceipt.ts
//
// Real (redacted) Uber trip receipt that the scanner silently dropped
// before this fix. Contains no bank-style debit keyword ("paid",
// "debited", "charged") anywhere in the body — it's receipt-shaped, not
// alert-shaped — which is exactly the class of email the fetch query,
// debit/credit classifier, and confidence scoring all previously assumed
// would never happen.

import { daysAgoMs } from './_fixtureClock'

export const UBER_TRIP_SUBJECT = '[Personal] Your Monday evening trip with Uber'

export const UBER_TRIP_FROM = 'Uber Receipts <noreply@uber.com>'

export const UBER_TRIP_BODY = `Thanks for riding, Piyush
We hope you enjoyed your ride this evening.

Total ₹224.76

Booking fee ₹10.00
Suggested fare ₹214.76

Payments
Visa ••••2000 (Piyush Amazon ICICI) ₹224.76
8/10/26 10:25 pm

This receipt reflects the suggested fare (excluding GST) and is not a tax invoice but it can be used for official reimbursement purposes. No GST is being recovered by Uber from the riders on this trip.

Trip details
Uber Go
11.52 kilometres, 26 minutes

Need help?
Our support team is happy to help with any concern you might have.`

/** Base64url-encode text the way Gmail's API does for message body parts. */
function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Uber trip receipt, for integration tests. */
export function makeUberTripGmailMessage(id = 'msg-uber-trip-1') {
  return {
    id,
    threadId: 'thread-uber-trip-1',
    snippet: 'Thanks for riding, Piyush. We hope you enjoyed your ride this evening. Total ₹224.76...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: UBER_TRIP_SUBJECT },
        { name: 'From', value: UBER_TRIP_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(UBER_TRIP_BODY) },
    },
  }
}
