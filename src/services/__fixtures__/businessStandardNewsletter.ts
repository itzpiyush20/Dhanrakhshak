// src/services/__fixtures__/businessStandardNewsletter.ts
//
// Sanitized body of a REAL email that was wrongly turned into a ₹6,000
// transaction (Gmail thread 19feaf8841f4a9ee, 2026-08-10). It is a magazine
// subscription advertisement: the ₹6,000 is a struck-through list price in a
// pricing table, not a payment. Retains the pricing table and the newsletter
// footer that make it identifiable as bulk marketing.

export const BS_NEWSLETTER_SUBJECT = 'Blueprint Magazine- August issue is Live'

export const BS_NEWSLETTER_FROM = 'Business Standard <bsemailservices@business-standard.net.in>'

export const BS_NEWSLETTER_BODY = `The headlines report what happened. Blueprint explains why - the calculations, the alliances, the long game behind the day's news.

save 41%
₹ 6,000
Blueprint Digital ₹ 3,500
annual (digital only) ₹ 291/Month

save 62%
₹ 12,000
Blueprint Complete ₹ 4,500
annual (digital & print) ₹ 375/Month

Subscribe Now

Blueprint Magazine August issue

An unfinished mission
India's aeroengine ambitions are at an inflexion point

The long overhaul
Integrated battle groups will change the army's land warfare tactics, experts say

What is the point of Brics?
While India jostles China for influence, some see the bloc as relevant in the Trump era

For more insights, get the BS app now!

For subscription assistance email at assist@bsmail.in

If this is in your Spam/ Junk/ Promotions folder, move it to your Inbox to avoid missing it.

Opt out of this newsletter`

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Business Standard newsletter. */
export function makeBusinessStandardGmailMessage(id = 'msg-bs-newsletter-1') {
  return {
    id,
    threadId: 'thread-bs-newsletter-1',
    snippet: "The headlines report what happened. Blueprint explains why - the calculations, the alliances, the long game behind the day's news. save 41% ₹ 6000 Blueprint Digital ₹ 3500 annual (digital only) ₹",
    internalDate: String(Date.UTC(2026, 7, 10, 9, 11, 32)),
    payload: {
      headers: [
        { name: 'Subject', value: BS_NEWSLETTER_SUBJECT },
        { name: 'From', value: BS_NEWSLETTER_FROM },
        { name: 'List-Unsubscribe', value: '<https://business-standard.net.in/unsubscribe>' },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(BS_NEWSLETTER_BODY) },
    },
  }
}
