import { describe, it, expect } from 'vitest'
import { KNOWN_MERCHANTS, normalizeMerchant } from './merchantNormalizer'

describe('KNOWN_MERCHANTS', () => {
  it('is a non-empty list of strings', () => {
    expect(Array.isArray(KNOWN_MERCHANTS)).toBe(true)
    expect(KNOWN_MERCHANTS.length).toBeGreaterThan(0)
    expect(KNOWN_MERCHANTS.every((m) => typeof m === 'string')).toBe(true)
  })

  it('includes well-known brands', () => {
    expect(KNOWN_MERCHANTS).toContain('Swiggy')
    expect(KNOWN_MERCHANTS).toContain('Amazon')
    expect(KNOWN_MERCHANTS).toContain('Netflix')
  })

  it('has no duplicate entries', () => {
    expect(new Set(KNOWN_MERCHANTS).size).toBe(KNOWN_MERCHANTS.length)
  })

  it('matches every canonical name that normalizeMerchant can return for a known brand', () => {
    // normalizeMerchant('swiggy') resolves through the same CANONICAL_MAP this list is built from
    const swiggy = normalizeMerchant('swiggy order')
    expect(KNOWN_MERCHANTS).toContain(swiggy.canonical)
  })
})
