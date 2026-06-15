// ============================================
// Learning Engine V2 — Supabase-Synced
// Merchant rules stored in DB, not just localStorage.
// Uses canonical merchant names for cross-variant learning.
// ============================================

import { supabase } from './supabase'
import { cleanMerchantName, getMerchantWeights, getMerchantSettings, applyMerchantRules } from './emailScanner'
import { normalizeMerchant, getMerchantKey } from './merchantNormalizer'
import type { RuleMatchResult } from './emailScanner'

type CardBrand = 'Visa' | 'Mastercard' | 'RuPay' | 'American Express' | 'Diners'

type MerchantRuleRow = {
  id: string
  user_id: string
  merchant_key: string
  canonical_name: string
  preferred_category: string
  card_brand: CardBrand | null
  auto_approve: boolean
  confidence: number
  times_confirmed: number
  last_updated: string
  created_at: string
}

export async function getMerchantRulesFromDB(userId: string): Promise<MerchantRuleRow[]> {
  const { data, error } = await supabase
    .from('merchant_rules')
    .select('*')
    .eq('user_id', userId)
    .order('times_confirmed', { ascending: false })

  if (error) {
    console.warn('[LearningEngine] Failed to fetch merchant rules:', error.message)
    return []
  }
  return (data || []) as MerchantRuleRow[]
}

export async function saveMerchantRuleToDb(
  userId: string,
  merchant: string,
  category: string,
  autoApprove = true,
  cardBrand?: CardBrand | null
): Promise<void> {
  const normalized = normalizeMerchant(merchant)
  const canonicalName = normalized.canonical || cleanMerchantName(merchant)
  const merchantKey = getMerchantKey(canonicalName) || cleanMerchantName(merchant).toLowerCase().trim()

  if (!merchantKey || merchantKey.length <= 2) return

  const { data: existing } = await supabase
    .from('merchant_rules')
    .select('id, times_confirmed, card_brand')
    .eq('user_id', userId)
    .eq('merchant_key', merchantKey)
    .single()

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      preferred_category: category,
      auto_approve: autoApprove,
      times_confirmed: existing.times_confirmed + 1,
      confidence: 100,
      canonical_name: canonicalName,
      last_updated: new Date().toISOString(),
    }
    // Only update card_brand if a new value is explicitly provided
    if (cardBrand !== undefined) {
      updatePayload.card_brand = cardBrand
    }

    await supabase.from('merchant_rules').update(updatePayload).eq('id', existing.id)
  } else {
    await supabase.from('merchant_rules').insert({
      user_id: userId,
      merchant_key: merchantKey,
      canonical_name: canonicalName,
      preferred_category: category,
      card_brand: cardBrand ?? null,
      auto_approve: autoApprove,
      confidence: 100,
      times_confirmed: 1,
    })
  }
}

export async function migrateLocalStorageRulesToDB(userId: string): Promise<{ migrated: number }> {
  const migrationDoneKey = 'dhanrakshak_ls_migration_done'
  try {
    if (sessionStorage.getItem(migrationDoneKey)) return { migrated: 0 }
  } catch {
    return { migrated: 0 }
  }

  const weights = getMerchantWeights()
  const settings = getMerchantSettings()
  const entries = Object.entries(weights)
  if (entries.length === 0) return { migrated: 0 }

  let migrated = 0

  for (const [rawKey, catMap] of entries) {
    let bestCategory = 'other'
    let maxCount = 0
    let totalCount = 0

    for (const [cat, count] of Object.entries(catMap)) {
      totalCount += count
      if (count > maxCount) {
        maxCount = count
        bestCategory = cat
      }
    }

    const autoApprove = settings[rawKey]?.autoApprove !== false
    const confidence = Math.min(100, Math.round((maxCount / Math.max(1, totalCount)) * 100))

    // Normalize the key from localStorage to canonical form
    const normalized = normalizeMerchant(rawKey)
    const canonicalName = normalized.isKnown ? normalized.canonical : rawKey
    const merchantKey = getMerchantKey(canonicalName) || rawKey

    const { error } = await supabase.from('merchant_rules').upsert(
      {
        user_id: userId,
        merchant_key: merchantKey,
        canonical_name: canonicalName,
        preferred_category: bestCategory,
        auto_approve: autoApprove,
        confidence,
        times_confirmed: totalCount,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'user_id,merchant_key' }
    )

    if (!error) migrated++
  }

  try {
    sessionStorage.setItem(migrationDoneKey, '1')
  } catch {}

  return { migrated }
}

export async function applyMerchantRulesFromDB(
  userId: string,
  merchant: string,
  snippet: string,
  defaultCategory: string
): Promise<RuleMatchResult> {
  // Normalize the merchant to canonical form for consistent DB lookup
  const normalized = normalizeMerchant(merchant)
  const canonicalName = normalized.isKnown ? normalized.canonical : cleanMerchantName(merchant)
  const merchantKey = getMerchantKey(canonicalName) || cleanMerchantName(merchant).toLowerCase().trim()

  try {
    const rules = await getMerchantRulesFromDB(userId)

    // Exact key match
    const exactMatch = rules.find((r) => r.merchant_key === merchantKey)
    if (exactMatch) {
      const isAutoApprove =
        exactMatch.auto_approve && exactMatch.confidence >= 80 && exactMatch.times_confirmed >= 1

      return {
        category: exactMatch.preferred_category,
        approval_status: isAutoApprove ? 'approved' : 'pending',
        confidence: exactMatch.confidence,
        matchReason: `DB rule: '${exactMatch.merchant_key}' (${exactMatch.confidence}% confidence, ${exactMatch.times_confirmed} confirmations)`,
      }
    }

    // Partial match — only for keys with 5+ chars to prevent "jio", "air", "pay" etc.
    // from false-matching against unrelated emails
    const lowerSnippet = snippet.toLowerCase().substring(0, 300)
    for (const rule of rules) {
      if (rule.merchant_key.length < 5) continue
      if (merchantKey.includes(rule.merchant_key) || lowerSnippet.includes(rule.merchant_key)) {
        const isAutoApprove =
          rule.auto_approve && rule.confidence >= 80 && rule.times_confirmed >= 2

        return {
          category: rule.preferred_category,
          approval_status: isAutoApprove ? 'approved' : 'pending',
          confidence: Math.round(rule.confidence * 0.8),
          matchReason: `DB partial rule: '${rule.merchant_key}' (partial match)`,
        }
      }
    }
  } catch (err) {
    console.warn('[LearningEngine] DB lookup failed, falling back to localStorage:', err)
  }

  // Fallback to localStorage-based rules
  return applyMerchantRules(merchant, snippet, defaultCategory)
}
