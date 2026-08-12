import { describe, it, expect } from 'vitest'
import {
  isSamePayment,
  merchantsCorrespond,
  isWeakMerchantLabel,
  scorePaymentRichness,
  mergePayments,
  type MergeableTransaction,
} from './paymentMerge'

function txn(over: Partial<MergeableTransaction> = {}): MergeableTransaction {
  return {
    amount: 450,
    currency: 'INR',
    type: 'debit',
    date: '2026-08-10',
    merchant: 'Swiggy',
    description: 'Swiggy order',
    reference_id: null,
    payment_mode: 'unknown',
    card_issuer: null,
    card_brand: null,
    transaction_time: null,
    confidence_score: 70,
    email_message_id: 'msg-1',
    ...over,
  }
}

describe('isWeakMerchantLabel', () => {
  it('treats the scanner’s fallback labels as weak', () => {
    for (const name of ['Bank Transaction', 'Incoming Credit', 'HDFC Bank', 'Auto Detected', 'Other', 'merchant']) {
      expect(isWeakMerchantLabel(name)).toBe(true)
    }
  })

  it('treats missing or one-character names as weak', () => {
    expect(isWeakMerchantLabel(null)).toBe(true)
    expect(isWeakMerchantLabel('')).toBe(true)
    expect(isWeakMerchantLabel('X')).toBe(true)
  })

  it('treats real merchants as strong, including brands containing "bank"', () => {
    for (const name of ['Swiggy', 'Amazon', 'Uber', 'Bankbazaar']) {
      expect(isWeakMerchantLabel(name)).toBe(false)
    }
  })
})

describe('merchantsCorrespond', () => {
  it('matches the same merchant across spelling variants', () => {
    expect(merchantsCorrespond('Swiggy', 'SWIGGY')).toBe(true)
    expect(merchantsCorrespond('Swiggy', 'Swiggy Ltd')).toBe(true)
  })

  it('matches a bank-narration variant against the clean name', () => {
    expect(merchantsCorrespond('SWIGGYBANGALORE', 'Swiggy')).toBe(true)
  })

  it('does not match unrelated merchants', () => {
    expect(merchantsCorrespond('Swiggy', 'Zomato')).toBe(false)
    expect(merchantsCorrespond('Amazon', 'Flipkart')).toBe(false)
  })

  it('never matches on a weak label, not even two identical ones', () => {
    // This is the false-merge hazard: two unrelated debits from the same bank
    // on the same day would otherwise pair up.
    expect(merchantsCorrespond('HDFC Bank', 'HDFC Bank')).toBe(false)
    expect(merchantsCorrespond('Bank Transaction', 'Bank Transaction')).toBe(false)
    expect(merchantsCorrespond('Swiggy', 'Bank Transaction')).toBe(false)
  })

  it('requires a substantial overlap for containment matching', () => {
    // Three characters would pair "ola" with unrelated names containing it.
    expect(merchantsCorrespond('Ola', 'Solar Power Ltd')).toBe(false)
  })
})

describe('isSamePayment', () => {
  it('never pairs the same number in different currencies', () => {
    // $50 and Rs.50 to one merchant on one day are two real payments.
    // Comparing the numbers alone would merge them and destroy one.
    expect(isSamePayment(txn({ currency: 'USD' }), txn({ currency: 'INR' }))).toBe(false)
  })

  it('treats an absent currency as the home currency', () => {
    expect(isSamePayment(txn({ currency: undefined }), txn({ currency: 'INR' }))).toBe(true)
  })

  it('pairs a bank alert with the merchant receipt for the same payment', () => {
    const bankAlert = txn({ merchant: 'SWIGGYBANGALORE', reference_id: '445566778899', payment_mode: 'upi' })
    const receipt = txn({ merchant: 'Swiggy', email_message_id: 'msg-2' })
    expect(isSamePayment(bankAlert, receipt)).toBe(true)
  })

  it('pairs across a one-day posting difference', () => {
    expect(isSamePayment(txn({ date: '2026-08-10' }), txn({ date: '2026-08-11' }))).toBe(true)
  })

  it('does not pair across two days', () => {
    expect(isSamePayment(txn({ date: '2026-08-10' }), txn({ date: '2026-08-12' }))).toBe(false)
  })

  it('does not pair different amounts, even by a rupee', () => {
    expect(isSamePayment(txn({ amount: 450 }), txn({ amount: 451 }))).toBe(false)
  })

  it('treats amounts as equal to the paisa', () => {
    expect(isSamePayment(txn({ amount: 450.0 }), txn({ amount: 450.004 }))).toBe(true)
    expect(isSamePayment(txn({ amount: 450.0 }), txn({ amount: 450.01 }))).toBe(false)
  })

  it('does not pair a debit with a credit', () => {
    expect(isSamePayment(txn({ type: 'debit' }), txn({ type: 'credit' }))).toBe(false)
  })

  it('treats differing reference ids as decisive proof of two payments', () => {
    // Same merchant, amount and day — but the bank gave them separate UPI
    // references, so they are two real payments, not a duplicate.
    const a = txn({ reference_id: '111111111111' })
    const b = txn({ reference_id: '222222222222' })
    expect(isSamePayment(a, b)).toBe(false)
  })

  it('pairs on matching reference ids even when merchants look unrelated', () => {
    const a = txn({ merchant: 'Bank Transaction', reference_id: '445566778899' })
    const b = txn({ merchant: 'Swiggy', reference_id: '445566778899' })
    expect(isSamePayment(a, b)).toBe(true)
  })

  it('declines to pair two same-amount payments with weak merchant labels', () => {
    // Two ₹50 coffees on one day. Merging them would silently destroy one.
    const a = txn({ amount: 50, merchant: 'HDFC Bank', email_message_id: 'a' })
    const b = txn({ amount: 50, merchant: 'HDFC Bank', email_message_id: 'b' })
    expect(isSamePayment(a, b)).toBe(false)
  })
})

describe('scorePaymentRichness', () => {
  it('ranks a detailed bank alert above a bare receipt', () => {
    const bankAlert = txn({ reference_id: 'X', payment_mode: 'upi', card_issuer: 'HDFC' })
    const bare = txn({ merchant: 'Bank Transaction', confidence_score: 60 })
    expect(scorePaymentRichness(bankAlert)).toBeGreaterThan(scorePaymentRichness(bare))
  })

  it('lets confidence break ties without outweighing a concrete field', () => {
    const withRef = txn({ reference_id: 'X', confidence_score: 10 })
    const highConfidence = txn({ confidence_score: 100 })
    expect(scorePaymentRichness(withRef)).toBeGreaterThan(scorePaymentRichness(highConfidence))
  })
})

describe('mergePayments', () => {
  it('unions the detail from both sides rather than discarding the poorer one', () => {
    // The classic pair: the bank knows the reference and the card, the
    // merchant knows who they are.
    const bankAlert = txn({
      merchant: 'Bank Transaction',
      description: 'Bank transaction',
      reference_id: '445566778899',
      payment_mode: 'upi',
      card_issuer: 'HDFC',
      card_brand: 'Visa',
      confidence_score: 80,
    })
    const receipt = txn({
      merchant: 'Swiggy',
      description: 'Swiggy food order',
      transaction_time: '20:32',
      confidence_score: 65,
    })

    const merged = mergePayments(bankAlert, receipt)

    expect(merged.reference_id).toBe('445566778899')
    expect(merged.payment_mode).toBe('upi')
    expect(merged.card_issuer).toBe('HDFC')
    expect(merged.card_brand).toBe('Visa')
    expect(merged.transaction_time).toBe('20:32')
    // The real merchant name wins over the placeholder, whichever side is richer.
    expect(merged.merchant).toBe('Swiggy')
    expect(merged.description).toBe('Swiggy food order')
    expect(merged.confidence_score).toBe(80)
  })

  it('produces the same result whichever order the pair is given in', () => {
    const a = txn({ merchant: 'Bank Transaction', reference_id: 'R1', payment_mode: 'upi' })
    const b = txn({ merchant: 'Swiggy', transaction_time: '20:32' })
    const ab = mergePayments(a, b)
    const ba = mergePayments(b, a)
    expect(ab.merchant).toBe(ba.merchant)
    expect(ab.reference_id).toBe(ba.reference_id)
    expect(ab.payment_mode).toBe(ba.payment_mode)
    expect(ab.transaction_time).toBe(ba.transaction_time)
  })

  it('keeps a real payment_mode over "unknown"', () => {
    const a = txn({ payment_mode: 'unknown', reference_id: 'R1', card_issuer: 'HDFC' })
    const b = txn({ payment_mode: 'credit_card' })
    expect(mergePayments(a, b).payment_mode).toBe('credit_card')
  })

  it('keeps the higher confidence score', () => {
    expect(mergePayments(txn({ confidence_score: 55 }), txn({ confidence_score: 90 })).confidence_score).toBe(90)
  })
})
