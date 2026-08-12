// src/services/__fixtures__/_fixtureClock.ts
//
// Shared clock helper for Gmail message fixtures.
//
// Fixtures must NEVER hardcode an absolute internalDate. scanRealGmailInbox
// filters every message against a rolling scan window anchored to "now", so an
// absolute date silently drifts outside that window as real time passes and the
// test then fails for a reason that has nothing to do with the code under test.
//
// This is not hypothetical: the Axis EMI and 429-retry regression tests were
// pinned to 2026-08-05 and started failing once that date fell more than seven
// days behind. The failures went unnoticed because a missing .env made the whole
// test file error out at import time, masking them.
//
// Anchor every fixture to this helper instead.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An `internalDate` (epoch milliseconds, as a string — the shape Gmail's API
 * returns) `days` before now. Defaults to 2 days, comfortably inside the
 * scanner's 7-day window with margin at either end of the day.
 */
export function daysAgoMs(days = 2): string {
  return String(Date.now() - days * DAY_MS)
}
