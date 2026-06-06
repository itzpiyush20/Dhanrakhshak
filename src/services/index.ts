export { supabase } from './supabase'
export {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary,
  getHistoricalAnalytics,
} from './transactions'
export {
  getBudgets,
  upsertBudget,
  deleteBudget,
} from './budgets'
export {
  getScanLogs,
  scanRealGmailInbox,
  getMerchantRules,
  saveMerchantRule,
  deleteMerchantRule,
  getNextRefreshTime,
  getLastScheduledRefreshTime,
  cleanMerchantName,
  getMerchantSettings,
  saveMerchantSetting,
  applyMerchantRules,
} from './emailScanner'
export {
  getProfile,
  updateProfile,
  resetAccountData,
  deleteAccount,
} from './profiles'
export {
  seedSandboxData,
} from './seeder'
export {
  submitFeedback,
  getTesterFeedbackLogs,
} from './feedback'
export {
  getMerchantRulesFromDB,
  saveMerchantRuleToDb,
  migrateLocalStorageRulesToDB,
  applyMerchantRulesFromDB,
} from './learningEngine'
export {
  initAnalytics,
  identifyUser,
  resetAnalytics,
  track,
  trackPage,
  EVENTS,
} from './analytics'
export {
  generateAIInsights,
  generateRuleBasedInsights,
  detectAnomalies,
  generateForecast,
  analyzeTransactionEmailWithAI,
} from './aiService'
export {
  saveGoogleToken,
  getGoogleToken,
  clearGoogleToken,
  isGoogleConnected,
  validateGoogleToken,
  purgeOldTokenKey,
} from './googleAuth'
export type { FinancialContext } from './aiService'
