// ============================================
// Learning Engine V2 — Supabase-Synced
// Merchant rules stored in DB, not just localStorage
// Enables cross-device learning persistence
// ============================================

import { supabase } from './supabase'
import { cleanMerchantName, getMerchantWeights, getMerchantSettings, applyMerchantRules } from './emailScanner'
import type { RuleMatchResult } from './emailScanner'

type MerchantRuleRow = {
  id: string
  user_id: string
  merchant_key: string
  preferred_category: string
  auto_approve: boolean
  confidence: number
  times_confirmed: number
  last_updated: string
  created_at: string
}

/** Fetch all merchant rules for user from Supabase */
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
  return data || []
}

/**
 * Upsert a merchant rule in Supabase.
 * On conflict (same user_id + merchant_key), increments times_confirmed
 * and updates the preferred_category if the new category is provided.
 */
export async function saveMerchantRuleToDb(
  userId: string,
  merchant: string,
  category: string,
  autoApprove = true
): Promise<void> {
  const merchantKey = cleanMerchantName(merchant).toLowerCase().trim()
  if (!merchantKey || merchantKey.length <= 2) return

  // Check if rule already exists
  const { data: existing } = await supabase
    .from('merchant_rules')
    .select('id, times_confirmed, confidence')
    .eq('user_id', userId)
    .eq('merchant_key', merchantKey)
    .single()

  if (existing) {
    // Increment times_confirmed and boost confidence to 100
    const newTimesConfirmed = existing.times_confirmed + 1
    const newConfidence = 100

    await supabase
      .from('merchant_rules')
      .update({
        preferred_category: category,
        auto_approve: autoApprove,
        times_confirmed: newTimesConfirmed,
        confidence: newConfidence,
        last_updated: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    // Insert new rule with 100% confidence
    await supabase
      .from('merchant_rules')
      .insert({
        user_id: userId,
        merchant_key: merchantKey,
        preferred_category: category,
        auto_approve: autoApprove,
        confidence: 100,
        times_confirmed: 1,
      })
  }
}

/**
 * One-time migration: reads localStorage merchant weights & settings
 * and upserts them into the Supabase merchant_rules table.
 * Safe to call multiple times (idempotent via upsert).
 */
export async function migrateLocalStorageRulesToDB(userId: string): Promise<{ migrated: number }> {
  const weights = getMerchantWeights()
  const settings = getMerchantSettings()

  const entries = Object.entries(weights)
  if (entries.length === 0) return { migrated: 0 }

  let migrated = 0

  for (const [merchantKey, catMap] of entries) {
    // Find best category from weights
    let bestCategory = 'other'
    let maxCount = 0
    let totalCount = 0

    for (const [cat, count] of Object.entries(catMap)) {
      totalCount += count
      if (count > maxCount) { maxCount = count; bestCategory = cat }
    }

    const autoApprove = settings[merchantKey]?.autoApprove !== false
    const confidence = Math.min(100, Math.round((maxCount / Math.max(1, totalCount)) * 100))

    const { error } = await supabase
      .from('merchant_rules')
      .upsert(
        {
          user_id: userId,
          merchant_key: merchantKey,
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

  // Mark migration as done to avoid re-running
  try {
    sessionStorage.setItem('dhanrakshak_ls_migration_done', '1')
  } catch {}

  return { migrated }
}

/**
 * Apply merchant rules from Supabase DB.
 * Falls back to localStorage rules if DB fetch fails.
 */
export async function applyMerchantRulesFromDB(
  userId: string,
  merchant: string,
  snippet: string,
  defaultCategory: string
): Promise<RuleMatchResult> {
  const merchantKey = cleanMerchantName(merchant).toLowerCase().trim()

  try {
    const rules = await getMerchantRulesFromDB(userId)

    // Exact match first
    const exactMatch = rules.find((r) => r.merchant_key === merchantKey)
    if (exactMatch) {
      const isAutoApprove = exactMatch.auto_approve &&
        exactMatch.confidence >= 80 &&
        exactMatch.times_confirmed >= 1

      return {
        category: exactMatch.preferred_category,
        approval_status: isAutoApprove ? 'approved' : 'pending',
        confidence: exactMatch.confidence,
        matchReason: `DB rule: '${exactMatch.merchant_key}' (${exactMatch.confidence}% confidence, ${exactMatch.times_confirmed} confirmations)`,
      }
    }

    // Partial match: check if any rule key appears in the merchant name or snippet
    const lowerSnippet = snippet.toLowerCase()
    for (const rule of rules) {
      if (
        merchantKey.includes(rule.merchant_key) ||
        lowerSnippet.includes(rule.merchant_key)
      ) {
        const isAutoApprove = rule.auto_approve &&
          rule.confidence >= 80 &&
          rule.times_confirmed >= 1

        return {
          category: rule.preferred_category,
          approval_status: isAutoApprove ? 'approved' : 'pending',
          confidence: Math.round(rule.confidence * 0.85), // slight penalty for partial match
          matchReason: `DB partial rule: '${rule.merchant_key}' (partial match)`,
        }
      }
    }
  } catch (err) {
    console.warn('[LearningEngine] DB lookup failed, falling back to localStorage:', err)
  }

  // Fallback: use localStorage-based applyMerchantRules
  return applyMerchantRules(merchant, snippet, defaultCategory)
}
