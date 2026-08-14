import { describe, it, expect } from 'vitest'
import {
  CREDIT_CARD_BILL_LEGACY_NAME,
  creditCardBillCategoryNames,
  makeIsCreditCardBill,
} from './creditCardBill'
import type { Category } from '@/types'

const cat = (name: string, tags: string[] = []): Category =>
  ({ name, analytics_tags: tags } as unknown as Category)

describe('creditCardBillCategoryNames', () => {
  it('picks out every category carrying the credit_card_bill tag', () => {
    const names = creditCardBillCategoryNames([
      cat('Food & Dining', ['wants']),
      cat('Credit Card Bill Payment', ['credit_card_bill']),
      cat('Amex Bill', ['credit_card_bill']),
      cat('Rent', ['needs']),
    ])
    expect(names).toEqual(['Credit Card Bill Payment', 'Amex Bill'])
  })

  it('tolerates categories with no tags at all', () => {
    expect(creditCardBillCategoryNames([cat('Untagged')])).toEqual([])
  })
})

describe('makeIsCreditCardBill', () => {
  it('matches a renamed category via its tag — the case the literal check missed', () => {
    const isCcBill = makeIsCreditCardBill(['Card Bills'])
    expect(isCcBill('Card Bills')).toBe(true)
    // The old hardcoded name must NOT match once the user has renamed away
    // from it, or the rename would exclude a category the user no longer tags.
    expect(isCcBill(CREDIT_CARD_BILL_LEGACY_NAME)).toBe(false)
  })

  it('matches every tagged category, not just the first', () => {
    const isCcBill = makeIsCreditCardBill(['Credit Card Bill Payment', 'Amex Bill'])
    expect(isCcBill('Credit Card Bill Payment')).toBe(true)
    expect(isCcBill('Amex Bill')).toBe(true)
    expect(isCcBill('Groceries')).toBe(false)
  })

  it('falls back to the legacy name when the tagged list is unavailable', () => {
    for (const missing of [undefined, null]) {
      const isCcBill = makeIsCreditCardBill(missing)
      expect(isCcBill(CREDIT_CARD_BILL_LEGACY_NAME)).toBe(true)
      expect(isCcBill('Groceries')).toBe(false)
    }
  })

  it('treats an empty list as "user tagged nothing", not as a failure', () => {
    const isCcBill = makeIsCreditCardBill([])
    expect(isCcBill(CREDIT_CARD_BILL_LEGACY_NAME)).toBe(false)
    expect(isCcBill('Groceries')).toBe(false)
  })

  it('never matches a null or undefined category', () => {
    const isCcBill = makeIsCreditCardBill(['Card Bills'])
    expect(isCcBill(null)).toBe(false)
    expect(isCcBill(undefined)).toBe(false)
  })
})
