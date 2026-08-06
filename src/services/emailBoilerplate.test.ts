// src/services/emailBoilerplate.test.ts
import { describe, it, expect } from 'vitest'
import { stripBoilerplate } from './emailBoilerplate'
import { AXIS_EMI_BODY } from './__fixtures__/axisEmiDebit'

describe('stripBoilerplate', () => {
  it('removes the "not initiated by you" security sentence but keeps the transaction sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/has not been initiated by you/i)
    expect(result).toMatch(/debited with INR 42293\.00/i)
  })

  it('removes the "do not share ... CVV/OTP" security sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/do not share your internet banking details/i)
    expect(result).not.toMatch(/CVV\/OTP/i)
  })

  it('removes RBI advisory, confidentiality, and "know more" boilerplate', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/RBI never deals with individuals/i)
    expect(result).not.toMatch(/This email is confidential/i)
    expect(result).not.toMatch(/Know more/i)
  })

  it('removes the SMS BLOCKALL helpline instruction sentence', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).not.toMatch(/SMS BLOCKALL/i)
  })

  it('keeps the amount and reference token intact', () => {
    const result = stripBoilerplate(AXIS_EMI_BODY)
    expect(result).toContain('INR 42293.00')
    expect(result).toContain('PPR030614052540_EMI_05-08-')
  })

  it('returns unstripped text unchanged when it contains no boilerplate', () => {
    const clean = 'Your account was debited with INR 500.00 for Zomato order.'
    expect(stripBoilerplate(clean)).toBe(clean)
  })

  it('handles empty input', () => {
    expect(stripBoilerplate('')).toBe('')
  })
})
