// src/services/__fixtures__/unknownVendorReceipt.ts
//
// Wholly synthetic receipt from a vendor that does not exist anywhere in
// KNOWN_MERCHANTS, TRUSTED_SENDER_DOMAINS, or any other list in this
// codebase. Proves that detection works for a vendor the app has never
// seen before, not just for Uber/Zomato specifically.

import { daysAgoMs } from './_fixtureClock'

export const UNKNOWN_VENDOR_SUBJECT = 'Your order from Ramesh Tiffin Service'

export const UNKNOWN_VENDOR_FROM = 'Ramesh Tiffin Service <orders@rameshtiffins.example>'

export const UNKNOWN_VENDOR_BODY = `Hello,

Your daily tiffin order has been delivered.

Order #4471
1 X Full Thali

Total ₹120.00

Thank you for choosing Ramesh Tiffin Service!`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the unknown-vendor receipt, for integration tests. */
export function makeUnknownVendorGmailMessage(id = 'msg-unknown-vendor-1') {
  return {
    id,
    threadId: 'thread-unknown-vendor-1',
    snippet: 'Hello, Your daily tiffin order has been delivered. Order #4471 1 X Full Thali Total ₹120.00...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: UNKNOWN_VENDOR_SUBJECT },
        { name: 'From', value: UNKNOWN_VENDOR_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(UNKNOWN_VENDOR_BODY) },
    },
  }
}
