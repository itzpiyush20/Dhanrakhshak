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

  it('removes the "do not share these details" security sentence (Zomato-style phrasing)', () => {
    const body = `Thank you for ordering from Patiala House. Total paid - ₹286.47. Eternal employees or representatives will NEVER ask you for your personal information i.e. your bank account details, password, PIN, CVV, OTP etc. For your own safety, DO NOT share these details with anyone over phone, SMS or email.`
    const result = stripBoilerplate(body)
    expect(result).not.toMatch(/DO NOT share these details/i)
    expect(result).not.toMatch(/CVV, OTP/i)
    expect(result).toContain('Total paid - ₹286.47')
  })

  it('returns unstripped text unchanged when it contains no boilerplate', () => {
    const clean = 'Your account was debited with INR 500.00 for Zomato order.'
    expect(stripBoilerplate(clean)).toBe(clean)
  })

  it('handles empty input', () => {
    expect(stripBoilerplate('')).toBe('')
  })
})
