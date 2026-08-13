import { describe, it, expect } from 'vitest'
import {
  extractAmountMatches,
  currencyCodeFor,
  currencySymbol,
  isHomeCurrency,
  DEFAULT_CURRENCY,
} from './currency'

describe('currencyCodeFor', () => {
  it('maps rupee markers to INR', () => {
    for (const t of ['Rs', 'Rs.', 'INR', '₹', 'Rupees', 'rupee']) {
      expect(currencyCodeFor(t)).toBe('INR')
    }
  })

  it('maps common foreign symbols and codes', () => {
    expect(currencyCodeFor('$')).toBe('USD')
    expect(currencyCodeFor('US$')).toBe('USD')
    expect(currencyCodeFor('USD')).toBe('USD')
    expect(currencyCodeFor('€')).toBe('EUR')
    expect(currencyCodeFor('£')).toBe('GBP')
    expect(currencyCodeFor('AED')).toBe('AED')
  })

  it('distinguishes the dollar variants', () => {
    expect(currencyCodeFor('S$')).toBe('SGD')
    expect(currencyCodeFor('A$')).toBe('AUD')
    expect(currencyCodeFor('C$')).toBe('CAD')
  })

  it('falls back to the home currency for anything unrecognised', () => {
    expect(currencyCodeFor(null)).toBe(DEFAULT_CURRENCY)
    expect(currencyCodeFor('')).toBe(DEFAULT_CURRENCY)
    expect(currencyCodeFor('???')).toBe(DEFAULT_CURRENCY)
  })
})

describe('extractAmountMatches', () => {
  it('reads a rupee amount in either position', () => {
    expect(extractAmountMatches('Rs.450.00 debited')[0]).toMatchObject({ value: 450, currency: 'INR' })
    expect(extractAmountMatches('450.00 INR debited')[0]).toMatchObject({ value: 450, currency: 'INR' })
  })

  // "Rs." followed by a SPACE used to match nothing at all, while "Rs.450" and
  // "Rs 450" both worked. HDFC Bank writes every credit-card alert that way, so
  // the whole class was rejected as `no_amount_in_body` — which in the audit
  // trail is indistinguishable from "the amount was only in a PDF", the one
  // skip the product deliberately does not act on. The cause was the trailing
  // `\b` in `\b(?:Rs\.?)\b`: it cannot hold between "." and " ", so the engine
  // backtracked to a bare "Rs" and the following `\s*` was left facing a ".".
  it('reads a rupee amount with a space after the abbreviation dot', () => {
    expect(extractAmountMatches('Rs. 2247.97 has been debited')[0])
      .toMatchObject({ value: 2247.97, currency: 'INR' })
    expect(extractAmountMatches('INR. 53.00 was debited')[0])
      .toMatchObject({ value: 53, currency: 'INR' })
    expect(extractAmountMatches('USD. 49.00 charged')[0])
      .toMatchObject({ value: 49, currency: 'USD' })
  })

  it('resolves a currency token that carries its trailing dot', () => {
    expect(currencyCodeFor('Rs.')).toBe('INR')
    expect(currencyCodeFor('USD.')).toBe('USD')
  })

  it('reads a dollar amount as USD, not as rupees', () => {
    // The bug this whole change exists for: $50 used to be either invisible
    // or stored indistinguishably from ₹50.
    const [m] = extractAmountMatches('Your card was charged $50.00 for Netflix')
    expect(m).toMatchObject({ value: 50, currency: 'USD' })
  })

  it('reads euro, pound and dirham amounts', () => {
    expect(extractAmountMatches('Charged €12.99')[0]).toMatchObject({ value: 12.99, currency: 'EUR' })
    expect(extractAmountMatches('Charged £8.50')[0]).toMatchObject({ value: 8.5, currency: 'GBP' })
    expect(extractAmountMatches('Charged AED 120')[0]).toMatchObject({ value: 120, currency: 'AED' })
  })

  it('prefers the specific dollar variant over a bare dollar sign', () => {
    expect(extractAmountMatches('Charged S$25.00')[0].currency).toBe('SGD')
    expect(extractAmountMatches('Charged US$25.00')[0].currency).toBe('USD')
  })

  it('handles thousands separators and decimals', () => {
    expect(extractAmountMatches('Rs.1,23,456.78 debited')[0].value).toBe(123456.78)
    expect(extractAmountMatches('$1,299.00 charged')[0].value).toBe(1299)
  })

  it('ignores bare numbers with no currency marker', () => {
    // Order numbers and reference ids must never become amounts.
    expect(extractAmountMatches('Order 408226671312345 shipped')).toHaveLength(0)
    expect(extractAmountMatches('Your OTP is 482913')).toHaveLength(0)
  })

  it('records each amount’s own currency in a mixed email', () => {
    const found = extractAmountMatches('Subtotal $50.00, converted to Rs.4,200.00 at checkout')
    expect(found.map((m) => m.currency)).toContain('USD')
    expect(found.map((m) => m.currency)).toContain('INR')
  })

  it('reports offsets so keyword-proximity scoring still works', () => {
    const text = 'Balance Rs.9,999.00. You paid Rs.450.00 to Swiggy.'
    const found = extractAmountMatches(text)
    expect(found).toHaveLength(2)
    for (const m of found) {
      expect(text.slice(m.index, m.index + m.text.length)).toBe(m.text)
    }
  })

  it('rejects zero, negative and absurd amounts', () => {
    expect(extractAmountMatches('Rs.0.00 debited')).toHaveLength(0)
    expect(extractAmountMatches('Rs.999999999 debited')).toHaveLength(0)
  })

  it('returns nothing for empty input', () => {
    expect(extractAmountMatches('')).toHaveLength(0)
  })
})

describe('currencySymbol / isHomeCurrency', () => {
  it('renders known symbols and falls back to the code', () => {
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('AED')).toBe('AED ')
  })

  it('treats only the home currency as summable into headline totals', () => {
    expect(isHomeCurrency('INR')).toBe(true)
    expect(isHomeCurrency(undefined)).toBe(true)
    expect(isHomeCurrency('USD')).toBe(false)
  })
})

// Formatting lives in utils (used by 100+ render sites); these pin the
// currency-aware behaviour and, critically, the backwards compatibility that
// lets every existing single-argument call keep working unchanged.
describe('formatCurrency', () => {
  it('still formats rupees when called with one argument', async () => {
    const { formatCurrency } = await import('../utils/index')
    expect(formatCurrency(1234.5)).toContain('₹')
  })

  it('formats a foreign amount in its own currency', async () => {
    const { formatCurrency } = await import('../utils/index')
    expect(formatCurrency(50, 'USD')).toContain('$')
    expect(formatCurrency(50, 'USD')).not.toContain('₹')
  })

  it('uses Indian digit grouping for rupees only', async () => {
    const { formatCurrency } = await import('../utils/index')
    // 1,23,456 (lakh grouping) vs 123,456 (thousands grouping)
    expect(formatCurrency(123456, 'INR')).toContain('1,23,456')
    expect(formatCurrency(123456, 'USD')).toContain('123,456')
  })

  it('does not throw on an unrecognised currency code', async () => {
    const { formatCurrency } = await import('../utils/index')
    expect(() => formatCurrency(50, 'XYZ')).not.toThrow()
  })

  it('treats an empty currency as the home currency', async () => {
    const { formatCurrency } = await import('../utils/index')
    expect(formatCurrency(50, '')).toContain('₹')
  })
})
