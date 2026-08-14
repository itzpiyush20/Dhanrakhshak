// ============================================
// Credit-card-bill identity — ONE definition.
//
// Credit card bill payments are excluded from expense totals because the
// purchases they cover were already counted when they happened; counting the
// bill too double-books that spend.
//
// "Is this a credit card bill?" used to be asked two incompatible ways: some
// call sites compared the category name against the literal
// 'Credit Card Bill Payment', while Insights checked the `credit_card_bill`
// analytics tag. Both agree only on a default, never-renamed setup. Rename the
// seeded category (Settings allows it) and the literal checks silently stop
// matching, so Dashboard and Insights start reporting different totals for the
// same month with no error. Tag a second category and they diverge the other
// way. The tag is the real identity — it survives renames — so everything now
// routes through here.
// ============================================

/**
 * Structural shape rather than an import of `Category`. This module is reachable
 * from `src/utils/index.ts`, which the serverless `tsconfig.api.json` build
 * compiles under an explicit file list that does not include `src/types/index.ts`
 * — importing the named type there breaks `npm run build`.
 */
interface CategoryLike {
  name: string
  analytics_tags?: string[] | null
}

/**
 * The seeded category name. Used ONLY as a fallback when the caller could not
 * supply the tagged list (see `makeIsCreditCardBill`) — never as the primary
 * test.
 */
export const CREDIT_CARD_BILL_LEGACY_NAME = 'Credit Card Bill Payment'

/** Names of the categories the user has tagged as credit-card bills. */
export function creditCardBillCategoryNames(categories: CategoryLike[]): string[] {
  return categories
    .filter((c) => c.analytics_tags?.includes('credit_card_bill'))
    .map((c) => c.name)
}

/**
 * Builds the "is this a credit card bill?" predicate.
 *
 * Pass the tagged names to use them. Pass `undefined`/`null` when the category
 * list genuinely wasn't available (a service called without it, or a failed
 * load) and it falls back to the legacy name — deliberately conservative, since
 * the failure mode of *not* excluding a bill is a silently inflated expense
 * total. An empty array is NOT a failure: it means the user has tagged nothing,
 * and that choice is respected.
 */
export function makeIsCreditCardBill(
  taggedNames?: string[] | null
): (category: string | null | undefined) => boolean {
  const names = new Set(taggedNames ?? [CREDIT_CARD_BILL_LEGACY_NAME])
  return (category) => (category == null ? false : names.has(category))
}
