// src/services/emailScanner.eventType.test.ts
import { describe, it, expect } from 'vitest'

// classifyEventType is not exported today — this test exports it via a
// minimal re-export shim so it's directly testable without mocking Gmail.
// (Task 5 also adds `export` to the function in emailScanner.ts.)
import { classifyEventType } from './emailScanner'

describe('classifyEventType — underscore-delimited reference tokens', () => {
  it('detects EMI when the keyword is embedded in an underscore-delimited reference (Axis Bank format)', () => {
    const text = 'debited with INR 42293.00 on 05-08-2026 by PPR030614052540_EMI_05-08-.'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('emi')
  })

  it('still detects EMI with normal word-boundary spacing', () => {
    const text = 'Your EMI payment of INR 5000 has been debited.'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('emi')
  })

  it('detects SIP when embedded in an underscore-delimited reference', () => {
    const text = 'debited for MUTUAL_FUND_SIP_INSTALLMENT_2026'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('sip')
  })

  it('falls back to generic debit when no keyword matches', () => {
    const text = 'debited for Zomato food order'
    expect(classifyEventType(text, 'debit', 'Other')).toBe('debit')
  })
})
