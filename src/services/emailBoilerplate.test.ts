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

  it('does not swallow unrelated legitimate content when "etc." is far away or absent (unbounded-match regression)', () => {
    // Regression guard for the "will never ask you for your personal
    // information ... etc." pattern: it must not run unbounded looking for
    // a distant/absent "etc." and eat a real transaction paragraph along
    // the way. Pad well past the {0,300} cap so the pattern is forced to
    // fail closed rather than reach the legitimate content below.
    const filler = 'Please note this is part of our standard notice text. '.repeat(10)
    const body = `Our employees or representatives will never ask you for your personal information. ${filler}Total paid - ₹500.00 for your recent order. Thank you for shopping with us.`
    const result = stripBoilerplate(body)
    expect(result).toContain('Total paid - ₹500.00')
    expect(result).toContain('Thank you for shopping with us')
  })

  it('returns unstripped text unchanged when it contains no boilerplate', () => {
    const clean = 'Your account was debited with INR 500.00 for Zomato order.'
    expect(stripBoilerplate(clean)).toBe(clean)
  })

  it('handles empty input', () => {
    expect(stripBoilerplate('')).toBe('')
  })
})
