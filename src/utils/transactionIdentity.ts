import { normalizeMerchant } from '@/services/merchantNormalizer'

export interface ResolvedTransactionIdentity {
  /** What to show as the primary/bold label — never raw narration text. */
  title: string
  /** Secondary line — '' when there's nothing worth showing. */
  remark: string
}

const NOISE_PATTERNS = [/auto-parsed/i, /auto detected/i, /bank transaction/i]

/**
 * Resolves what to display for a transaction's identity (title) and its
 * supporting remark (raw narration), so raw bank narration never gets
 * displayed as if it were a merchant name.
 */
export function resolveTransactionIdentity(txn: {
  merchant?: string | null
  description?: string | null
}): ResolvedTransactionIdentity {
  const merchant = (txn.merchant || '').trim()
  const description = (txn.description || '').trim()

  let title = merchant
  if (!title && description) {
    const normalized = normalizeMerchant(description)
    if (normalized.isKnown) {
      title = normalized.canonical
    }
  }
  if (!title) {
    title = 'Unclassified'
  }

  let remark = description
  const lowerRemark = remark.toLowerCase()
  const lowerTitle = title.toLowerCase()
  if (
    !remark ||
    lowerRemark === lowerTitle ||
    lowerRemark === `${lowerTitle} transaction` ||
    NOISE_PATTERNS.some((pattern) => pattern.test(remark))
  ) {
    remark = ''
  }

  return { title, remark }
}
