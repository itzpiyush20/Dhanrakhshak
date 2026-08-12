// src/services/__fixtures__/bankMarketingFromTrustedSender.ts
//
// A marketing email from a TRUSTED sender domain (a bank already in
// TRUSTED_SENDER_DOMAINS). Proves the bulk-mail gate must not exempt trusted
// senders — banks send cashback/upsell marketing from the same domains as
// their real transaction alerts, and that marketing carries the same
// List-Unsubscribe signal any other bulk mail does.

import { daysAgoMs } from './_fixtureClock'

export const BANK_MARKETING_SUBJECT = 'Get up to Rs.5000 cashback on your new HDFC Credit Card'

export const BANK_MARKETING_FROM = 'HDFC Bank Offers <offers@alerts.hdfcbank.com>'

export const BANK_MARKETING_BODY = `Dear Customer,

Apply for the new HDFC Millennia Credit Card and get up to Rs.5000 cashback on your first purchase. Limited period offer.

Enjoy 5% cashback on Amazon, Flipkart, and Swiggy. No annual fee for the first year.

Apply Now

This is a promotional email. If you no longer wish to receive offers from HDFC Bank, you can opt out of this newsletter at any time.`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the trusted-sender bank marketing email. */
export function makeBankMarketingGmailMessage(id = 'msg-bank-marketing-1') {
  return {
    id,
    threadId: 'thread-bank-marketing-1',
    snippet: 'Apply for the new HDFC Millennia Credit Card and get up to Rs.5000 cashback on your first purchase...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: BANK_MARKETING_SUBJECT },
        { name: 'From', value: BANK_MARKETING_FROM },
        { name: 'List-Unsubscribe', value: '<https://hdfcbank.com/unsubscribe>' },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(BANK_MARKETING_BODY) },
    },
  }
}
