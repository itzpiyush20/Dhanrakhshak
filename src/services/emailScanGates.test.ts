import { describe, it, expect } from 'vitest'
import { isGenuinePendingInitiation, evaluateRegexGates, logRejection, isBulkMarketingEmail, hasPaymentAssertion } from './emailScanGates'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'
import { UBER_TRIP_BODY } from './__fixtures__/uberTripReceipt'
import { ZOMATO_ORDER_BODY } from './__fixtures__/zomatoOrderReceipt'
import { UNKNOWN_VENDOR_BODY } from './__fixtures__/unknownVendorReceipt'
import { BANK_MARKETING_BODY } from './__fixtures__/bankMarketingFromTrustedSender'
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
