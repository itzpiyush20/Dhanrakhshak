// ============================================================
// Payment merging — requirement R10
//
// A single payment often generates TWO emails: the bank's debit alert and the
// merchant's own receipt. They carry different Gmail message ids, and the
// receipt usually has no UPI reference, so neither of the scanner's exact-match
// dedup mechanisms (email_message_id, reference_id) can associate them. Left
// alone they become two transactions for one payment.
//
// The asymmetry that drives every decision here: nothing auto-approves, so a
// MISSED merge costs the user one dismiss-tap on a visible duplicate, while a
// WRONG merge silently destroys a real transaction. Two ₹50 coffees on the same
// day are a genuine pair, not a duplicate. So this module is deliberately
// conservative — when the evidence is weak it declines to merge and lets the
// user see both.
// ============================================================

import { normalizeMerchant, getMerchantKey } from './merchantNormalizer.js'
import { DEFAULT_CURRENCY } from './currency.js'

/** Structural subset shared by parsed inserts and stored rows. */
export interface MergeableTransaction {
  amount: number
  /** ISO 4217. Absent means the app's home currency. */
  currency?: string | null
  type: string
  date: string
  merchant?: string | null
  description?: string | null
  reference_id?: string | null
  payment_mode?: string | null
  card_issuer?: string | null
  card_brand?: string | null
  transaction_time?: string | null
  confidence_score?: number | null
  email_message_id?: string | null
}

/**
 * Labels that carry no identifying information. These are what the scanner
 * falls back to when it could not work out a merchant, so two transactions
 * both labelled "HDFC Bank" or "Incoming Credit" tell us nothing whatsoever
 * about whether they are the same payment — merging on them would pair
 * unrelated debits from the same bank on the same day.
 */
const WEAK_MERCHANT_PATTERNS: RegExp[] = [
  /auto\s*detected/i,
  /retail\s*transaction/i,
  /payment\s*transaction/i,
  /bank\s*transaction/i,
  /incoming\s*credit/i,
  /^\s*(merchant|payment|transaction|other|unknown)\s*$/i,
  // A bare bank name is a fallback, not a merchant. Note \bbank\b does not
  // match inside a real brand like "Bankbazaar".
  /\bbank\b/i,
]

export function isWeakMerchantLabel(name: string | null | undefined): boolean {
  if (!name) return true
  const trimmed = name.trim()
  if (trimmed.length < 2) return true
  return WEAK_MERCHANT_PATTERNS.some((p) => p.test(trimmed))
}

/** Canonical comparison key for a merchant name. */
function merchantKeyOf(name: string): string {
  const normalized = normalizeMerchant(name)
  const canonical = normalized.isKnown ? normalized.canonical : name
  return getMerchantKey(canonical) || canonical.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Whether two merchant labels plausibly name the same counterparty. Weak
 * labels never correspond — not even with each other.
 */
export function merchantsCorrespond(a: string | null | undefined, b: string | null | undefined): boolean {
  if (isWeakMerchantLabel(a) || isWeakMerchantLabel(b)) return false

  const ka = merchantKeyOf(a as string)
  const kb = merchantKeyOf(b as string)
  if (!ka || !kb) return false
  if (ka === kb) return true

  // Bank narration mangles names ("SWIGGYBANGALORE" vs "Swiggy"), so allow
  // containment — but only for keys long enough that an accidental overlap is
  // implausible. Three characters would pair "ola" with "sola".
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  return shorter.length >= 4 && longer.includes(shorter)
}

function sameAmount(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

function withinOneDay(a: string, b: string): boolean {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false
  return Math.abs(ta - tb) <= 24 * 60 * 60 * 1000
}

/**
 * Whether two records describe the SAME real-world payment.
 *
 * Requires identical direction and amount, dates within a day (bank and
 * merchant frequently post on different days), and either matching reference
 * ids or corresponding merchants.
 */
export function isSamePayment(a: MergeableTransaction, b: MergeableTransaction): boolean {
  if (a.type !== b.type) return false
  // Currency before amount: $50 and Rs.50 to the same merchant on the same day
  // are two real payments. Comparing the numbers alone would merge them and
  // destroy one.
  if ((a.currency ?? DEFAULT_CURRENCY) !== (b.currency ?? DEFAULT_CURRENCY)) return false
  if (!sameAmount(a.amount, b.amount)) return false
  if (!withinOneDay(a.date, b.date)) return false

  // When both sides carry a reference id it settles the question outright —
  // including in the negative. Two different UPI references are two different
  // payments no matter how alike everything else looks.
  if (a.reference_id && b.reference_id) return a.reference_id === b.reference_id

  return merchantsCorrespond(a.merchant, b.merchant)
}

/**
 * How much identifying detail a record carries. Used to choose which side of a
 * merge to build on; the fields themselves are unioned, so nothing is lost
 * either way.
 */
export function scorePaymentRichness(t: MergeableTransaction): number {
  let score = 0
  if (t.reference_id) score += 4
  if (t.payment_mode && t.payment_mode !== 'unknown') score += 2
  if (t.card_issuer) score += 2
  if (t.card_brand) score += 1
  if (t.transaction_time) score += 1
  if (!isWeakMerchantLabel(t.merchant)) score += 3
  // Tie-break only — never outweighs a concrete field.
  score += (t.confidence_score ?? 0) / 100
  return score
}

/**
 * Combine two records of the same payment into one, taking the union of their
 * detail rather than discarding the poorer side's fields. A bank alert usually
 * supplies the reference id and card details; the merchant receipt usually
 * supplies the real merchant name.
 */
export function mergePayments<T extends MergeableTransaction>(a: T, b: T): T {
  const [winner, loser] = scorePaymentRichness(a) >= scorePaymentRichness(b) ? [a, b] : [b, a]

  const merchant = !isWeakMerchantLabel(winner.merchant)
    ? winner.merchant
    : !isWeakMerchantLabel(loser.merchant)
      ? loser.merchant
      : winner.merchant

  return {
    ...winner,
    merchant,
    // Prefer the winner's description only when it came with a real merchant;
    // otherwise the loser's is likely to be the more meaningful one.
    description: !isWeakMerchantLabel(winner.merchant)
      ? winner.description
      : (loser.description ?? winner.description),
    reference_id: winner.reference_id ?? loser.reference_id ?? null,
    payment_mode:
      winner.payment_mode && winner.payment_mode !== 'unknown'
        ? winner.payment_mode
        : (loser.payment_mode ?? winner.payment_mode ?? null),
    card_issuer: winner.card_issuer ?? loser.card_issuer ?? null,
    card_brand: winner.card_brand ?? loser.card_brand ?? null,
    transaction_time: winner.transaction_time ?? loser.transaction_time ?? null,
    confidence_score: Math.max(winner.confidence_score ?? 0, loser.confidence_score ?? 0),
  }
}
