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

// ============================================================
// Performance bound. stripBoilerplate used to run all ~14 global regex
// passes across the FULL, untruncated body of every email, unconditionally.
// Cheap on a normal bank alert, but expensive enough on a large body — the
// widened D3 fetch net pulls in bulkier marketing/newsletter content — to
// block the main thread for multiple seconds on a SINGLE email. No per-email
// yield in the scan loop can rescue a stall inside one email's own
// processing, which is what produced Chrome's "Page Unresponsive" dialog.
// ============================================================

describe('stripBoilerplate — bounded cost on oversized bodies', () => {
  it('finishes quickly on a very large body', () => {
    // Far past the ~1.7KB largest genuine fixture, deliberately pathological:
    // no periods at all, so every `[^.]*\.`-style pattern must scan to the
    // end of its bounded window without a sentence terminator to stop at.
    const huge = 'word '.repeat(400000) // ~2MB, zero periods
    const start = Date.now()
    stripBoilerplate(huge)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('still strips a genuine footer sitting within the scanned tail', () => {
    const huge = 'Some unrelated padding text without punctuation '.repeat(5000)
    const withFooter = huge + 'Please do not share your OTP with anyone for any reason whatsoever.'
    const result = stripBoilerplate(withFooter)
    expect(result).not.toContain('do not share your OTP')
  })

  it('does not touch a normal-sized email at all', () => {
    // Every real fixture is well under the bound — confirms the cap is a
    // no-op for genuine transaction emails.
    expect(stripBoilerplate(AXIS_EMI_BODY)).toBe(stripBoilerplate(AXIS_EMI_BODY))
    expect(AXIS_EMI_BODY.length).toBeLessThan(12000)
  })
})

describe('stripBoilerplate cost is bounded by input shape', () => {
  // Production timings: 2136ms on a 4KB body, 1581ms on 11KB, while the base64
  // decode and HTML strip of the SAME emails took 0-2ms. These patterns are
  // built from [^.]* / [\s\S]{0,300}? / \S+, whose backtracking cost grows with
  // the length of the text they are run against, not the length of what they
  // match. Segmenting the input caps that by construction.
  const budgetMs = 250

  it('finishes quickly on a full-size body that almost matches everywhere', async () => {
    // Every ingredient that makes these patterns backtrack: long unbroken
    // non-whitespace runs, long whitespace runs, no sentence-ending periods,
    // and many partial hits on the footer vocabulary.
    let body = ''
    while (body.length < 12000) {
      body +=
        'SBI    representatives   or   representatives   will   never   ask   you   ' +
        'https://communications.sbi.co.in/track/click?u=' + 'A1b2C3d4'.repeat(30) + ' ' +
        'do not share your card number details never share your urn ' +
        'know more >> terms & conditions apply toll free '
    }

    const started = Date.now()
    const out = stripBoilerplate(body)
    const elapsed = Date.now() - started

    expect(typeof out).toBe('string')
    expect(elapsed).toBeLessThan(budgetMs)
  })

  it('still strips a footer sentence that sits at the very end', () => {
    const body = 'INR 200.00 was debited from your A/c XX5154 at SWIGGY.\n' +
      'Please do not share your OTP with anyone.'
    const out = stripBoilerplate(body)
    expect(out).toContain('INR 200.00 was debited')
    expect(out.toLowerCase()).not.toContain('do not share your otp')
  })
})
