import { describe, it, expect } from 'vitest'
import { isGenuinePendingInitiation, evaluateRegexGates, logRejection, isBulkMarketingEmail, hasPaymentAssertion } from './emailScanGates'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'
import { UBER_TRIP_BODY } from './__fixtures__/uberTripReceipt'
import { ZOMATO_ORDER_BODY } from './__fixtures__/zomatoOrderReceipt'
import { UNKNOWN_VENDOR_BODY } from './__fixtures__/unknownVendorReceipt'
import { BANK_MARKETING_BODY } from './__fixtures__/bankMarketingFromTrustedSender'
import {
  COUPON_IMAGE_BODY,
  COUPON_IMAGE_BODY_NO_BULK_MARKERS,
  COUPON_IMAGE_HEADERS,
} from './__fixtures__/couponCodeImagePromo'
import {
  LOAN_OFFER_BODY,
  LOAN_OFFER_HEADERS,
  LOAN_OFFER_SUBJECT,
  CREDIT_LIMIT_OFFER_BODY,
  CREDIT_LIMIT_OFFER_SUBJECT,
} from './__fixtures__/preApprovedLoanOffer'
import { stripBoilerplate } from './emailBoilerplate'

describe('isGenuinePendingInitiation', () => {
  it('does NOT flag "has not been initiated by you" as a pending signal', () => {
    const text = 'if the transaction has not been initiated by you, call us.'
    expect(isGenuinePendingInitiation(text).matched).toBe(false)
  })

  it('DOES flag "your request has been initiated" as a pending signal', () => {
    const text = 'Your fund transfer request has been initiated and will be processed shortly.'
    expect(isGenuinePendingInitiation(text).matched).toBe(true)
  })

  it('DOES flag "requested" without a negation nearby', () => {
    const text = 'Your auto-debit mandate has been requested and is pending confirmation.'
    expect(isGenuinePendingInitiation(text).matched).toBe(true)
  })
})

describe('evaluateRegexGates', () => {
  it('does not reject the Axis EMI email after boilerplate stripping (regression for the reported miss)', () => {
    const stripped = stripBoilerplate(AXIS_EMI_BODY)
    const content = `Debit transaction alert for Axis Bank A/c ${stripped}`.substring(0, 2000)
    const result = evaluateRegexGates('Debit transaction alert for Axis Bank A/c', content, true)
    expect(result.rejected).toBe(false)
  })

  it('still rejects a genuine OTP email', () => {
    const content = 'Your OTP for login is 482913. Do not share this OTP with anyone.'
    const result = evaluateRegexGates('OTP for your login', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('otp_or_security_code')
  })

  it('still rejects a promotional cashback offer', () => {
    const content = 'Get cashback on your next purchase! Limited period offer, shop now.'
    const result = evaluateRegexGates('Exclusive cashback offer', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('promotional_spam')
  })

  it('still rejects a declined payment', () => {
    const content = 'Your payment of INR 500 was declined due to insufficient balance.'
    const result = evaluateRegexGates('Payment declined', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('declined_or_void')
  })

  it('still rejects a payment-due reminder when the subject is not hard-accepted', () => {
    const content = 'Your credit card payment of INR 5000 is due on 15th August. Minimum due: INR 500.'
    const result = evaluateRegexGates('Payment reminder', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('due_or_statement_reminder')
  })

  it('still rejects an order-placed email with no debit confirmation', () => {
    const content = 'Your order has been placed successfully. It will ship in 2 days.'
    const result = evaluateRegexGates('Order Confirmation', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('order_placed_no_debit')
  })

  it('does not reject an order-placed email that also confirms a debit', () => {
    const content = 'Your order has been placed successfully. INR 1200 has been debited from your account.'
    const result = evaluateRegexGates('Order Confirmation', content, false)
    expect(result.rejected).toBe(false)
  })

  it('does not reject credit card bill payment confirmation with "was successful"', () => {
    const content = 'Piyush, here is your payment confirmation. Your credit card payment of Rs 15,000 was successful. Do not share your OTP with anyone.'
    const result = evaluateRegexGates('your credit card bill payment was successful', content, true)
    expect(result.rejected).toBe(false)
  })

  it('hasPaymentAssertion returns true for "payment was successful" and "credit card bill payment"', () => {
    expect(hasPaymentAssertion('your credit card bill payment was successful')).toBe(true)
    expect(hasPaymentAssertion('Payment of Rs 15000 was successful towards your SBI Card')).toBe(true)
  })
})

describe('logRejection', () => {
  it('inserts a rejection row with the given fields', async () => {
    const insertedRows: any[] = []
    const mockDb: any = {
      from: (table: string) => ({
        insert: (row: any) => {
          insertedRows.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }),
    }

    await logRejection(mockDb, 'user-1', 'scan-log-1', 'otp_or_security_code', 'axis.bank.in', 'Some subject', 'matched text')

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].table).toBe('email_scan_rejections')
    expect(insertedRows[0].row).toEqual({
      user_id: 'user-1',
      scan_log_id: 'scan-log-1',
      sender_domain: 'axis.bank.in',
      subject: 'Some subject',
      gate: 'otp_or_security_code',
      matched_snippet: 'matched text',
    })
  })

  it('never throws when the insert fails', async () => {
    const mockDb: any = {
      from: () => ({
        insert: () => Promise.resolve({ error: new Error('db down') }),
      }),
    }
    await expect(
      logRejection(mockDb, 'user-1', 'scan-log-1', 'otp_or_security_code', 'axis.bank.in', 'subj', 'snippet')
    ).resolves.toBeUndefined()
  })
})

describe('isBulkMarketingEmail', () => {
  it('detects a List-Unsubscribe header', () => {
    const headers = [
      { name: 'Subject', value: 'Anything' },
      { name: 'List-Unsubscribe', value: '<https://example.com/u>' },
    ]
    expect(isBulkMarketingEmail(headers, 'plain body')).toBe(true)
  })

  it('detects a List-Unsubscribe-Post header regardless of casing', () => {
    const headers = [{ name: 'list-unsubscribe-post', value: 'List-Unsubscribe=One-Click' }]
    expect(isBulkMarketingEmail(headers, 'plain body')).toBe(true)
  })

  it('detects opt-out phrasing in the body when no header is present', () => {
    expect(isBulkMarketingEmail([], 'Some content. Opt out of this newsletter.')).toBe(true)
    expect(isBulkMarketingEmail([], 'You are receiving this email because you signed up.')).toBe(true)
    expect(isBulkMarketingEmail([], 'Click here to unsubscribe')).toBe(true)
  })

  it('returns false for an ordinary transactional body with no headers', () => {
    expect(isBulkMarketingEmail([], 'Rs.250 debited from your account.')).toBe(false)
  })

  it('treats missing headers and empty body as not bulk (fail open)', () => {
    expect(isBulkMarketingEmail([], '')).toBe(false)
  })

  it('does not flag any of the genuine receipt fixtures', () => {
    expect(isBulkMarketingEmail([], UBER_TRIP_BODY)).toBe(false)
    expect(isBulkMarketingEmail([], ZOMATO_ORDER_BODY)).toBe(false)
    expect(isBulkMarketingEmail([], UNKNOWN_VENDOR_BODY)).toBe(false)
  })
})

describe('hasPaymentAssertion', () => {
  it('matches explicit money-movement verbs', () => {
    expect(hasPaymentAssertion('Rs.250 debited from your account')).toBe(true)
    expect(hasPaymentAssertion('Amount credited to your wallet')).toBe(true)
    expect(hasPaymentAssertion('You paid Rs.100')).toBe(true)
    expect(hasPaymentAssertion('Your card was charged')).toBe(true)
  })

  it('matches receipt vocabulary', () => {
    expect(hasPaymentAssertion('Total ₹120.00')).toBe(true)
    expect(hasPaymentAssertion('Trip fare ₹224.76')).toBe(true)
  })

  it('accepts every genuine receipt fixture', () => {
    expect(hasPaymentAssertion(UBER_TRIP_BODY)).toBe(true)
    expect(hasPaymentAssertion(ZOMATO_ORDER_BODY)).toBe(true)
    // Load-bearing: this fixture contains 'Total' and none of the other
    // vocabulary. A stricter list would silently break unknown-vendor detection.
    expect(hasPaymentAssertion(UNKNOWN_VENDOR_BODY)).toBe(true)
  })

  it('rejects subscription-advertisement pricing copy', () => {
    const promo = 'save 41% ₹ 6,000 Blueprint Digital ₹ 3,500 annual (digital only) ₹ 291/Month Subscribe Now'
    expect(hasPaymentAssertion(promo)).toBe(false)
  })

  it('returns false for empty text', () => {
    expect(hasPaymentAssertion('')).toBe(false)
  })
})

describe('bulk-mail gate — trusted-sender marketing', () => {
  it('flags trusted-sender marketing as bulk (List-Unsubscribe present)', () => {
    const headers = [{ name: 'List-Unsubscribe', value: '<https://hdfcbank.com/unsubscribe>' }]
    expect(isBulkMarketingEmail(headers, BANK_MARKETING_BODY)).toBe(true)
  })

  it('has no payment assertion in bank marketing copy', () => {
    expect(hasPaymentAssertion(BANK_MARKETING_BODY)).toBe(false)
  })
})

// ============================================================
// Owner-specified false-positive classes (requirements R1/R13,
// plans/email-scanner-requirements.md). These must stay rejected as the
// scanner's scope widens to "everything financial" — widening the Gmail
// fetch query pulls in far more of exactly this kind of mail.
// ============================================================

describe('false positives — coupon-code and image-only promotions', () => {
  it('rejects an image-only coupon promo via the bulk-mail gate', () => {
    // Almost all content is inside <img> tags, so the surviving text is thin.
    // The structural List-Unsubscribe signal is what carries this rejection.
    expect(isBulkMarketingEmail(COUPON_IMAGE_HEADERS, COUPON_IMAGE_BODY)).toBe(true)
    expect(hasPaymentAssertion(COUPON_IMAGE_BODY)).toBe(false)
  })

  it('rejects the same promo on text alone when the bulk headers are absent', () => {
    // Not every promo sender sets List-Unsubscribe — the text gates must
    // stand on their own.
    expect(isBulkMarketingEmail([], COUPON_IMAGE_BODY_NO_BULK_MARKERS)).toBe(false)
    const result = evaluateRegexGates('', COUPON_IMAGE_BODY_NO_BULK_MARKERS, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('promotional_spam')
  })

  it('does not treat a discount amount as a payment assertion', () => {
    // "Flat ₹500 off on orders above ₹2,000" must never read as money moved —
    // this is the bait that turns a coupon into a phantom ₹500 transaction.
    expect(hasPaymentAssertion('Flat ₹500 off on orders above ₹2,000. Use code SAVE500')).toBe(false)
  })
})

describe('false positives — OTPs and security codes', () => {
  const otpVariants = [
    'Your OTP for login is 482913. Do not share this OTP with anyone.',
    'Use verification code 738201 to complete your registration.',
    '918273 is your one time password. Valid for 10 minutes.',
    'Your security PIN for the transaction is 4471.',
    'Enter auth code 220913 to authorise this request.',
  ]

  it.each(otpVariants)('rejects: %s', (content) => {
    const result = evaluateRegexGates('Verification', content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('otp_or_security_code')
  })

  it('rejects an OTP even when the subject would otherwise be hard-accepted', () => {
    // isHardAccepted bypasses the reminder/statement gates but must NOT
    // bypass the OTP gate — an OTP is never a transaction.
    const content = 'Your OTP for the debit of Rs.5000 is 482913. Do not share this OTP.'
    const result = evaluateRegexGates('Debit transaction alert', content, true)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('otp_or_security_code')
  })
})

describe('false positives — pre-approved loan and credit-limit offers', () => {
  it('rejects a pre-approved loan offer', () => {
    // Dangerous shape: trusted sender, a large rupee amount, and the word
    // "credited" in the FUTURE tense ("will be credited"). Without a gate
    // for offer language this becomes a phantom Rs.5,00,000 credit whenever
    // the AI is unavailable and the regex ladder runs.
    const content = LOAN_OFFER_BODY.substring(0, 2000)
    const result = evaluateRegexGates(LOAN_OFFER_SUBJECT, content, false)
    expect(result.rejected).toBe(true)
    expect(result.gate).toBe('offer_or_pre_approval')
  })

  it('rejects a pre-approved loan offer even from a hard-accepted subject', () => {
    const content = LOAN_OFFER_BODY.substring(0, 2000)
    const result = evaluateRegexGates(LOAN_OFFER_SUBJECT, content, true)
    expect(result.rejected).toBe(true)
  })

  it('rejects a credit-limit increase offer', () => {
    const content = CREDIT_LIMIT_OFFER_BODY.substring(0, 2000)
    const result = evaluateRegexGates(CREDIT_LIMIT_OFFER_SUBJECT, content, false)
    expect(result.rejected).toBe(true)
  })

  it('bulk-mail gate also catches the credit-limit offer', () => {
    // Belt and braces: the opt-out footer marks it bulk, and no payment
    // assertion appears anywhere in the copy.
    expect(isBulkMarketingEmail([], CREDIT_LIMIT_OFFER_BODY)).toBe(true)
    expect(hasPaymentAssertion(CREDIT_LIMIT_OFFER_BODY)).toBe(false)
  })

  it('loan-offer copy is bulk-flagged but DOES carry a payment assertion', () => {
    // Documents precisely why the dedicated offer gate is needed: "will be
    // credited" trips hasPaymentAssertion, so the bulk-mail gate alone lets
    // this through.
    expect(isBulkMarketingEmail(LOAN_OFFER_HEADERS, LOAN_OFFER_BODY)).toBe(true)
    expect(hasPaymentAssertion(LOAN_OFFER_BODY)).toBe(true)
  })
})

describe('false positives — cashback offers vs genuine cashback credits', () => {
  it('rejects a cashback OFFER', () => {
    const content = 'Earn cashback of up to Rs.500 on your next UPI payment. Offer valid till 31 Aug.'
    const result = evaluateRegexGates('Cashback offer', content, false)
    expect(result.rejected).toBe(true)
  })

  it('does NOT reject a genuine cashback CREDIT', () => {
    // The distinction the owner cares about: real money arriving must survive.
    const content = 'Rs.50 cashback has been credited to your Paytm wallet for transaction ID 8891203.'
    const result = evaluateRegexGates('Cashback credited', content, false)
    expect(result.rejected).toBe(false)
  })
})

describe('genuine transactions still survive every gate (over-blocking guard)', () => {
  it('accepts the real receipt fixtures', () => {
    for (const body of [UBER_TRIP_BODY, ZOMATO_ORDER_BODY, UNKNOWN_VENDOR_BODY]) {
      const content = stripBoilerplate(body).substring(0, 2000)
      expect(evaluateRegexGates('', content, true).rejected).toBe(false)
    }
  })

  it('accepts a plain bank debit alert', () => {
    const content = 'Rs.1,250.00 has been debited from your HDFC Bank A/c XX4471 on 10-08-26 at SWIGGY. UPI Ref 445566778899.'
    expect(evaluateRegexGates('Debit alert', content, true).rejected).toBe(false)
  })

  it('accepts a salary credit', () => {
    const content = 'Rs.85,000.00 credited to your account XX4471 towards SALARY for AUG 2026. Ref NEFT8891203.'
    expect(evaluateRegexGates('Salary credit', content, true).rejected).toBe(false)
  })

  it('accepts an insurance premium debit', () => {
    // In scope under R2 ("everything financial") — must not be caught by the
    // new offer gate, which keys on pre-approval language, not on the word
    // "premium".
    const content = 'Your premium of Rs.12,500 towards policy 8891203 has been successfully debited via NACH mandate.'
    expect(evaluateRegexGates('Premium paid', content, true).rejected).toBe(false)
  })

  it('accepts a SIP / mutual fund debit', () => {
    const content = 'Rs.5,000 has been debited towards your SIP in Axis Bluechip Fund. Folio 8891203.'
    expect(evaluateRegexGates('SIP debit', content, true).rejected).toBe(false)
  })
})

describe('credit card bill payment & spend alert gates', () => {
  it('does not reject a credit card bill payment receipt when body contains statement/due words', () => {
    const content = 'Payment of Rs 15,000 received towards SBI Credit Card ending 1234 on 12-08-2026. Total Amount Due: Rs 0.00. Statement date: 15th.'
    const result = evaluateRegexGates('Payment Received for SBI Credit Card', content, false)
    expect(result.rejected).toBe(false)
  })

  it('does not reject a credit card spend alert when body contains available limit and statement info', () => {
    const content = 'Rs. 2,450.00 spent on your HDFC Bank Credit Card ending 5678 at Zomato. Available credit limit: Rs 1,45,000. View e-statement online.'
    const result = evaluateRegexGates('Transaction alert for HDFC Credit Card', content, false)
    expect(result.rejected).toBe(false)
  })

  it('does not reject exact subject YOUR CREDIT CARD BILL PAYMENT IS SUCCESSFUL', () => {
    const content = 'YOUR CREDIT CARD BILL PAYMENT IS SUCCESSFUL. Payment of Rs 15,000 towards SBI Card was received on 12 Aug 2026. UTR: 421098765432.'
    const result = evaluateRegexGates('YOUR CREDIT CARD BILL PAYMENT IS SUCCESSFUL', content, true)
    expect(result.rejected).toBe(false)
  })
})
