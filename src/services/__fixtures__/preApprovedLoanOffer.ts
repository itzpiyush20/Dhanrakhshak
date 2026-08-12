// src/services/__fixtures__/preApprovedLoanOffer.ts
//
// A pre-approved loan / credit-limit-increase offer from a trusted bank
// domain. Dangerous because it reads almost exactly like a real credit alert:
// trusted sender, large rupee amount, and the word "credited" appears in the
// forward-looking sense ("will be credited to your account"). Nothing here has
// actually moved money.
//
// The future-tense phrasing is the load-bearing detail — a gate that only
// looks for money-movement vocabulary without checking tense will accept this
// as a ₹5,00,000 credit.

export const LOAN_OFFER_SUBJECT = 'Congratulations! You are pre-approved for a Rs.5,00,000 personal loan'

export const LOAN_OFFER_FROM = 'ICICI Bank <loans@icicibank.com>'

export const LOAN_OFFER_BODY = `Dear Customer,

Congratulations! Based on your excellent repayment history, you are pre-approved
for a Personal Loan of Rs.5,00,000 at an interest rate starting from 10.5% p.a.

The amount will be credited to your account within 24 hours of acceptance.

- Loan amount: Rs.5,00,000
- Tenure: up to 60 months
- EMI starting at Rs.10,747 per month
- Zero processing fee for a limited period

Click here to accept this offer.

This is a promotional communication. To stop receiving offers,
manage your email preferences.`

export const LOAN_OFFER_HEADERS = [
  { name: 'Subject', value: LOAN_OFFER_SUBJECT },
  { name: 'From', value: LOAN_OFFER_FROM },
  { name: 'List-Unsubscribe', value: '<https://icicibank.com/unsubscribe>' },
]

/** A credit-limit increase offer — same class, different wording. */
export const CREDIT_LIMIT_OFFER_SUBJECT = 'Your credit limit has been increased to Rs.3,00,000'

export const CREDIT_LIMIT_OFFER_BODY = `Good news!

Your HDFC Bank Credit Card limit has been increased from Rs.1,50,000 to Rs.3,00,000
with effect from today.

Enjoy higher spending power and more rewards. No action is required from your side.

To opt out of promotional emails, manage your preferences.`
