// src/services/__fixtures__/zomatoOrderReceipt.ts
//
// Real (redacted) Zomato order receipt that the scanner silently dropped
// before this fix. Its security footer ("do not share these details")
// wasn't covered by the boilerplate stripper's "do not share your ..."
// pattern, so the survived footer's "OTP" mention tripped the
// otp_or_security_code gate.

import { daysAgoMs } from './_fixtureClock'

export const ZOMATO_ORDER_SUBJECT = 'Your Zomato order from Patiala House'

export const ZOMATO_ORDER_FROM = 'Zomato <noreply@zomato.com>'

export const ZOMATO_ORDER_BODY = `Hi Piyush Khandelwal,
Thank you for ordering from Patiala House

ORDER ID: 8454583228

Delivered

Patiala House
Plot 516/1728/3687, 3rd Floor, Kamal Heights, Ward 3, Patia, Bhubaneshwar

1 X Malai Kofta

Total paid - ₹286.47

Eternal employees or representatives will NEVER ask you for your personal information i.e. your bank account details, password, PIN, CVV, OTP etc. For your own safety, DO NOT share these details with anyone over phone, SMS or email.

©2026 - Zomato, All rights reserved.
Eternal Limited (Formerly known as Zomato Limited) • GF-12A, 94 Meghdoot, Nehru Place, New Delhi-110019`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Zomato order receipt, for integration tests. */
export function makeZomatoOrderGmailMessage(id = 'msg-zomato-order-1') {
  return {
    id,
    threadId: 'thread-zomato-order-1',
    snippet: 'Hi Piyush Khandelwal, Thank you for ordering from Patiala House ORDER ID: 8454583228 Delivered...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: ZOMATO_ORDER_SUBJECT },
        { name: 'From', value: ZOMATO_ORDER_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(ZOMATO_ORDER_BODY) },
    },
  }
}
