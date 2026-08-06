import { describe, it, expect } from 'vitest'
import { isGenuinePendingInitiation, evaluateRegexGates } from './emailScanGates'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'
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
