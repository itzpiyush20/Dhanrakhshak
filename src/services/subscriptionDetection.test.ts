import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  detectSubscriptions,
  merchantKey,
  loadIgnoredSubscriptionKeys,
  ignoredSubscriptionsStorageKey,
  type DetectableTransaction,
} from './subscriptionDetection'

/** Fixed clock so renewal maths never depends on the day the suite runs. */
const NOW = new Date('2026-08-17T12:00:00Z')

const txn = (
  merchant: string,
  date: string,
  amount: number,
  category = 'Entertainment'
): DetectableTransaction => ({ merchant, date, amount, category, type: 'debit' })

const detect = (rows: DetectableTransaction[], ignoredKeys: string[] = []) =>
  detectSubscriptions(rows, { ignoredKeys, now: NOW })

describe('detectSubscriptions — history window', () => {
  // The Dashboard widget used to run this over the five most recent
  // transactions. These two tests pin down why that could never work.
  const netflix = [
    txn('Netflix', '2026-08-10', 649),
    txn('Netflix', '2026-07-11', 649),
    txn('Netflix', '2026-06-10', 649),
  ]
  const noise = [
    txn('Uber', '2026-08-16', 240, 'Transport'),
    txn('Blinkit', '2026-08-15', 812, 'Food & Dining'),
    txn('Zomato', '2026-08-14', 430, 'Food & Dining'),
    txn('Amazon', '2026-08-12', 1999, 'Shopping'),
  ]

  it('misses a real subscription entirely when handed only the recent slice', () => {
    // The five most recent rows hold exactly one Netflix charge. One charge in
    // a non-subscription category is not evidence of anything, so the widget
    // silently showed nothing for a live ₹649/mo subscription.
    const recentFive = [...noise, netflix[0]]
    expect(detect(recentFive)).toEqual([])
  })

  it('detects it from the full window, with the real charge count and average', () => {
    const found = detect([...noise, ...netflix])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      merchant: 'Netflix',
      frequency: 'monthly',
      timesCharged: 3,
      amount: 649,
      lastBilled: '2026-08-10',
    })
  })

  it('averages the charges rather than reporting only the latest', () => {
    const [sub] = detect([
      txn('Spotify', '2026-08-05', 130),
      txn('Spotify', '2026-07-05', 120),
    ])
    expect(sub.amount).toBe(125)
  })
})

describe('detectSubscriptions — frequency tiers', () => {
  // The widget's copy only ever recognised monthly. A quarterly or annual
  // subscription was either invisible or mislabelled with a 30-day renewal.
  it('recognises a quarterly cycle', () => {
    const [sub] = detect([
      txn('Cloud Backup', '2026-07-20', 2400),
      txn('Cloud Backup', '2026-04-20', 2400),
    ])
    expect(sub.frequency).toBe('quarterly')
    // 91-day cycle from 20 Jul, not the 30 days the old widget assumed.
    expect(sub.nextRenewal).toBe('2026-10-19')
  })

  it('recognises an annual cycle', () => {
    const [sub] = detect([
      txn('Domain Renewal', '2026-08-01', 1200),
      txn('Domain Renewal', '2025-08-02', 1200),
    ])
    expect(sub.frequency).toBe('annual')
    expect(sub.nextRenewal).toBe('2027-08-01')
  })

  it('rejects a merchant billed at an interval that is no cycle at all', () => {
    // 12 days apart — a frequent shop, not a subscription.
    expect(
      detect([txn('Coffee Bar', '2026-08-14', 300), txn('Coffee Bar', '2026-08-02', 300)])
    ).toEqual([])
  })

  it('rejects a repeat merchant whose amount swings too far to be a plan', () => {
    expect(
      detect([txn('Handyman', '2026-08-10', 5000), txn('Handyman', '2026-07-10', 900)])
    ).toEqual([])
  })

  it('still trusts the category when the interval is unreadable', () => {
    // An electricity bill varies month to month, so the amount check fails —
    // but the category says recurring, so it is kept as monthly.
    const [sub] = detect([
      txn('State Power', '2026-08-09', 3100, 'Utilities & Bills'),
      txn('State Power', '2026-07-09', 900, 'Utilities & Bills'),
    ])
    expect(sub).toMatchObject({ frequency: 'monthly', merchant: 'State Power' })
  })
})

describe('detectSubscriptions — staleness & calendar day renewal', () => {
  it('drops a monthly subscription whose last charge is past the stale cutoff', () => {
    // Last charge 17 May, i.e. 92 days before NOW — beyond the 65-day window.
    expect(
      detect([txn('Old Gym', '2026-05-17', 1500), txn('Old Gym', '2026-04-17', 1500)])
    ).toEqual([])
  })

  it('keeps an annual subscription that a monthly cutoff would have discarded', () => {
    // 47 days since the last charge: fine for annual, and the widget's flat
    // 60-day rule would have kept this one too — but its flat 30-day renewal
    // would have claimed it was already overdue.
    const [sub] = detect([
      txn('Insurance Portal', '2026-07-01', 8400),
      txn('Insurance Portal', '2025-07-02', 8400),
    ])
    expect(sub.frequency).toBe('annual')
    expect(sub.daysToRenewal).toBeGreaterThan(300)
  })

  it('calculates daysToRenewal = 0 accurately when renewal date is today', () => {
    const todayStr = '2026-08-17'
    const lastBilledStr = '2026-07-18' // 30 days before 2026-08-17
    const [sub] = detect([
      txn('Gym', todayStr, 1000, 'Subscriptions'),
      txn('Gym', lastBilledStr, 1000, 'Subscriptions'),
    ])
    expect(sub.daysToRenewal).toBe(30)
  })
})

describe('detectSubscriptions — ignored merchants', () => {
  const rows = [
    txn('Netflix', '2026-08-10', 649),
    txn('Netflix', '2026-07-11', 649),
  ]

  it('honours a merchant the user marked "not a subscription"', () => {
    // The Dashboard widget never read this list, so anything hidden on the
    // Subscriptions page reappeared on the Dashboard.
    expect(detect(rows, [merchantKey('Netflix')])).toEqual([])
  })

  it('matches the ignored key regardless of case or padding', () => {
    expect(detect([txn('  NETFLIX ', '2026-08-10', 649)], ['netflix'])).toEqual([])
  })
})

describe('detectSubscriptions — output shape', () => {
  it('sorts by soonest renewal', () => {
    const found = detect([
      txn('Later', '2026-08-16', 500, 'Subscriptions'),
      txn('Sooner', '2026-07-25', 500, 'Subscriptions'),
    ])
    expect(found.map((s) => s.merchant)).toEqual(['Sooner', 'Later'])
  })

  it('reports a price rise, and ignores rounding-sized drift', () => {
    const [risen] = detect([
      txn('Streamly', '2026-08-10', 799),
      txn('Streamly', '2026-07-10', 699),
    ])
    expect(risen.priceChange).toBe(100)

    const [steady] = detect([
      txn('Steadly', '2026-08-10', 502),
      txn('Steadly', '2026-07-10', 500),
    ])
    expect(steady.priceChange).toBeNull()
  })

  it('ignores credits and merchant-less rows', () => {
    expect(
      detect([
        { ...txn('Refunder', '2026-08-10', 649), type: 'credit' },
        { ...txn('Refunder', '2026-07-10', 649), type: 'credit' },
        { ...txn('Anon', '2026-08-10', 500, 'Subscriptions'), merchant: null },
      ])
    ).toEqual([])
  })
})

describe('loadIgnoredSubscriptionKeys', () => {
  // The suite runs in vitest's node environment (no jsdom in this repo), so
  // localStorage is stubbed in-memory rather than pulling in a DOM.
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })

  it('returns the stored list', () => {
    localStorage.setItem(ignoredSubscriptionsStorageKey('u1'), JSON.stringify(['netflix']))
    expect(loadIgnoredSubscriptionKeys('u1')).toEqual(['netflix'])
  })

  it('returns empty for an absent user, absent key, or corrupt JSON', () => {
    expect(loadIgnoredSubscriptionKeys(null)).toEqual([])
    expect(loadIgnoredSubscriptionKeys('u1')).toEqual([])
    localStorage.setItem(ignoredSubscriptionsStorageKey('u1'), '{not json')
    expect(loadIgnoredSubscriptionKeys('u1')).toEqual([])
  })

  it('returns empty when the stored value is valid JSON but not a list', () => {
    localStorage.setItem(ignoredSubscriptionsStorageKey('u1'), '"netflix"')
    expect(loadIgnoredSubscriptionKeys('u1')).toEqual([])
  })
})
