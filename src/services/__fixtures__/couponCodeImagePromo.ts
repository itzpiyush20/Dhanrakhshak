// src/services/__fixtures__/couponCodeImagePromo.ts
//
// An image-heavy coupon promotion — the hardest marketing class to reject,
// because almost all of its content is inside <img> tags. After
// extractEmailBody() runs DOMParser().textContent over it, only the alt text
// and a thin footer survive, so the text-based gates have very little to work
// with and the structural bulk-mail signal (List-Unsubscribe) is what actually
// carries the rejection.
//
// The amounts here are deliberately realistic bait: a naive amount scan finds
// "₹500" and "₹2,000" and would happily invent a ₹500 transaction from a
// discount that nobody paid.

export const COUPON_IMAGE_SUBJECT = 'FLAT ₹500 OFF — your exclusive code inside'

export const COUPON_IMAGE_FROM = 'Myntra Offers <offers@email.myntra.com>'

/** Raw HTML, as it arrives from Gmail. */
export const COUPON_IMAGE_HTML = `<html><body>
<img src="https://cdn.example.com/hero.png" alt="Mega Fashion Sale" width="600" />
<img src="https://cdn.example.com/code.png" alt="Use code SAVE500" width="600" />
<img src="https://cdn.example.com/cta.png" alt="Shop Now" width="600" />
<p style="font-size:10px;color:#999">
You are receiving this email because you signed up at myntra.com.
<a href="https://email.myntra.com/u/123">Unsubscribe</a>
</p>
</body></html>`

/** What extractEmailBody() yields after DOMParser textContent extraction. */
export const COUPON_IMAGE_BODY = `Mega Fashion Sale
Use code SAVE500
Shop Now

You are receiving this email because you signed up at myntra.com.
Unsubscribe`

/**
 * The same promotion with the bulk markers stripped — some senders omit
 * List-Unsubscribe entirely. Proves the text gates catch it on their own,
 * without relying on the structural signal.
 */
export const COUPON_IMAGE_BODY_NO_BULK_MARKERS = `Mega Fashion Sale
Flat ₹500 off on orders above ₹2,000. Use coupon code SAVE500 at checkout.
Valid till 31 August.`

export const COUPON_IMAGE_HEADERS = [
  { name: 'Subject', value: COUPON_IMAGE_SUBJECT },
  { name: 'From', value: COUPON_IMAGE_FROM },
  { name: 'List-Unsubscribe', value: '<https://email.myntra.com/u/123>' },
  { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
]
