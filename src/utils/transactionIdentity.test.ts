import { describe, it, expect } from 'vitest'
import { resolveTransactionIdentity } from './transactionIdentity'

describe('resolveTransactionIdentity', () => {
  it('uses the merchant as title when present, description as remark', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'UPI/4412/SWIGGY-ORDER-BLR' }))
      .toEqual({ title: 'Swiggy', remark: 'UPI/4412/SWIGGY-ORDER-BLR' })
  })

  it('recovers a known brand from description when merchant is blank', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: 'UPI/4412/SWIGGY-ORDER-BLR' }))
      .toEqual({ title: 'Swiggy', remark: 'UPI/4412/SWIGGY-ORDER-BLR' })
  })

  it('recovers a known brand from description when merchant is empty string', () => {
    expect(resolveTransactionIdentity({ merchant: '', description: 'NEFT/AMAZON PAY INDIA/REF123' }))
      .toEqual({ title: 'Amazon', remark: 'NEFT/AMAZON PAY INDIA/REF123' })
  })

  it('falls back to Unclassified when merchant is blank and description matches no known brand', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: 'IMPS/998877/JOHN DOE/SBI' }))
      .toEqual({ title: 'Unclassified', remark: 'IMPS/998877/JOHN DOE/SBI' })
  })

  it('falls back to Unclassified when both merchant and description are blank', () => {
    expect(resolveTransactionIdentity({ merchant: null, description: null }))
      .toEqual({ title: 'Unclassified', remark: '' })
  })

  it('blanks the remark when it equals the title (case-insensitive)', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'swiggy' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('blanks the remark when it matches the "{title} Transaction" shape', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Swiggy Transaction' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('blanks the remark for known noise patterns', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Auto-Parsed from email' }).remark).toBe('')
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Auto Detected transaction' }).remark).toBe('')
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: 'Bank Transaction' }).remark).toBe('')
  })

  it('leaves the remark blank when description is blank', () => {
    expect(resolveTransactionIdentity({ merchant: 'Swiggy', description: '' }))
      .toEqual({ title: 'Swiggy', remark: '' })
  })

  it('trims whitespace-only merchant and description', () => {
    expect(resolveTransactionIdentity({ merchant: '   ', description: '   ' }))
      .toEqual({ title: 'Unclassified', remark: '' })
  })
})
