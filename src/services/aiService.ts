// ============================================
// AI Service — Gemini API Integration
// Generates personalised financial insights
// Falls back to rule-based insights if API key
// is absent or request fails
// ============================================

import { formatCurrency } from '@/utils'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

export interface FinancialContext {
  month: string
  totalIncome: number
  totalExpenses: number
  savings: number
  savingsRate: number
  needsPct: number
  wantsPct: number
  savingsPct: number
  healthScore: number
  topCategory: string
  topCategoryAmount: number
  topCategoryPct: number
  momTrend: { pct: number; increased: boolean; prevLabel: string } | null
  subscriptionBurn: number
  emergencyMonths: number
  categoryBreakdown: Array<{ category: string; amount: number; percentage: number }>
}

/** Generate AI-powered financial insights via Gemini */
export async function generateAIInsights(ctx: FinancialContext): Promise<{
  insights: string[]
  alerts: string[]
  source: 'gemini' | 'rule-based'
}> {
  if (!GEMINI_API_KEY) {
    return { ...generateRuleBasedInsights(ctx), source: 'rule-based' }
  }

  try {
    const prompt = buildPrompt(ctx)

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
          topP: 0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    })

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = parseGeminiResponse(text)
    if (parsed.insights.length > 0) {
      return { ...parsed, source: 'gemini' }
    }

    return { ...generateRuleBasedInsights(ctx), source: 'rule-based' }
  } catch (err) {
    console.warn('[AI] Gemini request failed, using rule-based fallback:', err)
    return { ...generateRuleBasedInsights(ctx), source: 'rule-based' }
  }
}

function buildPrompt(ctx: FinancialContext): string {
  const fmt = (n: number) => formatCurrency(Math.round(n))
  const catList = ctx.categoryBreakdown
    .slice(0, 5)
    .map((c) => `${c.category}: ${fmt(c.amount)} (${c.percentage.toFixed(0)}%)`)
    .join(', ')

  return `You are a senior Chartered Accountant and personal CFO for an Indian professional. Analyse this user's financial data for ${ctx.month} and provide highly personalised, specific, actionable advice.

FINANCIAL DATA:
- Monthly Income: ${fmt(ctx.totalIncome)}
- Total Expenses: ${fmt(ctx.totalExpenses)}
- Net Savings: ${fmt(ctx.savings)} (${ctx.savingsRate.toFixed(0)}% savings rate)
- 50/30/20 Split: Needs ${ctx.needsPct}% | Wants ${ctx.wantsPct}% | Savings ${ctx.savingsPct}%
- Financial Health Score: ${ctx.healthScore}/100
- Top Expense Category: ${ctx.topCategory} — ${fmt(ctx.topCategoryAmount)} (${ctx.topCategoryPct.toFixed(0)}% of expenses)
- Category Breakdown: ${catList}
- Subscription Burn Rate: ${fmt(ctx.subscriptionBurn)}/month
- Emergency Fund Coverage: ${ctx.emergencyMonths} months
${ctx.momTrend ? `- Month-over-Month Expense Change: ${ctx.momTrend.increased ? '+' : '-'}${Math.abs(ctx.momTrend.pct).toFixed(0)}% vs ${ctx.momTrend.prevLabel}` : ''}

INSTRUCTIONS:
1. Generate exactly 3 INSIGHTS (specific, personal, data-driven — not generic advice)
2. Generate ALERTS only for genuine financial risks (0-2 alerts max)
3. Each insight must reference the user's actual numbers
4. Use Indian financial context (SIPs, LIC, FD, GST, ITR, etc.) where relevant
5. Be direct, like a trusted CA speaking to a client — not a chatbot

Respond in this EXACT JSON format (no markdown, pure JSON):
{
  "insights": [
    "First specific insight with actual numbers...",
    "Second insight...",
    "Third insight..."
  ],
  "alerts": [
    "Alert if there is a genuine risk..."
  ]
}`
}

function parseGeminiResponse(text: string): { insights: string[]; alerts: string[] } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights.filter(Boolean) : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.filter(Boolean) : [],
    }
  } catch {
    return { insights: [], alerts: [] }
  }
}

export function generateRuleBasedInsights(ctx: FinancialContext): {
  insights: string[]
  alerts: string[]
} {
  const fmt = (n: number) => formatCurrency(Math.round(n))
  const insights: string[] = []
  const alerts: string[] = []

  if (ctx.savingsRate >= 20) {
    insights.push(
      `Excellent wealth accumulation velocity. Your ${ctx.savingsRate.toFixed(0)}% savings rate (${fmt(ctx.savings)}) this period significantly exceeds the 20% golden benchmark. Redirect this surplus into SIP top-ups or FD laddering to maximise compounding.`
    )
  } else if (ctx.savingsRate >= 10) {
    insights.push(
      `Your savings rate of ${ctx.savingsRate.toFixed(0)}% (${fmt(ctx.savings)}) is on track but has room to grow. Automating a SIP of ${fmt(ctx.totalIncome * 0.05)} more per month would bridge you to the 20% target within 3 months.`
    )
  } else {
    insights.push(
      `Your savings rate of ${Math.max(0, ctx.savingsRate).toFixed(0)}% (${fmt(Math.max(0, ctx.savings))}) is below the recommended 20%. Your discretionary spending is absorbing ${fmt(ctx.totalExpenses - ctx.totalIncome * 0.8)} more than optimal. Immediate budget caps on top categories needed.`
    )
  }

  if (ctx.topCategoryAmount > 0) {
    const potential = fmt(ctx.topCategoryAmount * 0.15)
    insights.push(
      `${ctx.topCategory.charAt(0).toUpperCase() + ctx.topCategory.slice(1)} is your largest expense absorber at ${fmt(ctx.topCategoryAmount)} (${ctx.topCategoryPct.toFixed(0)}% of total spend). A disciplined 15% reduction here would free up ${potential} — enough to fully fund a monthly SIP or build your emergency buffer faster.`
    )
  }

  if (ctx.emergencyMonths < 3) {
    insights.push(
      `Your emergency reserve covers only ${ctx.emergencyMonths} month(s) of expenses — dangerously low. The standard recommendation is 6 months (${fmt(ctx.totalExpenses * 6)}). Prioritise this before increasing discretionary spending.`
    )
  } else if (ctx.subscriptionBurn > ctx.totalIncome * 0.05) {
    insights.push(
      `Your subscription stack is costing ${fmt(ctx.subscriptionBurn)}/month — ${((ctx.subscriptionBurn / ctx.totalIncome) * 100).toFixed(0)}% of your income. Audit each service: cancel those unused for 30+ days and you could reclaim ${fmt(ctx.subscriptionBurn * 0.3)} monthly.`
    )
  } else if (ctx.momTrend) {
    insights.push(
      ctx.momTrend.increased
        ? `Your spending surged ${ctx.momTrend.pct.toFixed(0)}% compared to ${ctx.momTrend.prevLabel}. Identify the spike category and set a hard budget cap immediately to prevent this from becoming a habit.`
        : `Outstanding control — your expenses dropped ${Math.abs(ctx.momTrend.pct).toFixed(0)}% vs ${ctx.momTrend.prevLabel}. This trajectory, sustained for 6 months, would compound your savings by approximately ${fmt(Math.abs((ctx.momTrend.pct / 100) * ctx.totalExpenses) * 6)}.`
    )
  } else {
    insights.push(
      `Your emergency fund of ${ctx.emergencyMonths} month(s) is healthy. Consider channel-shifting the next salary increment directly into a liquid FD to hit 6 months coverage while maintaining daily cash flow.`
    )
  }

  if (ctx.needsPct > 60) {
    alerts.push(
      `Critical: Essential obligations consuming ${ctx.needsPct}% of income (target: <50%). Review fixed costs — negotiate rent, switch utility plans, or restructure EMIs.`
    )
  } else if (ctx.needsPct > 55) {
    alerts.push(
      `Essential expenses at ${ctx.needsPct}% of income — above the 50% safe threshold. This limits your savings headroom significantly.`
    )
  }

  if (ctx.wantsPct > 40) {
    alerts.push(
      `Discretionary spending at ${ctx.wantsPct}% of income (target: ≤30%). Your lifestyle inflation is eroding your compounding potential.`
    )
  }

  if (ctx.savingsPct < 5 && ctx.totalIncome > 0) {
    alerts.push(
      `Savings rate critically low at ${ctx.savingsPct}%. Without intervention, wealth accumulation will stall entirely.`
    )
  }

  return { insights, alerts }
}

export function detectAnomalies(
  transactions: Array<{ amount: number; category: string; date: string; merchant: string; type: string }>
): Array<{ category: string; thisMonth: number; baseline: number; spike: number; merchant?: string }> {
  const anomalies: Array<{
    category: string
    thisMonth: number
    baseline: number
    spike: number
    merchant?: string
  }> = []

  const now = new Date()
  const currentMonth = now.toISOString().substring(0, 7)
  const monthlySpend: Record<string, Record<string, number>> = {}

  transactions
    .filter((t) => t.type === 'debit')
    .forEach((t) => {
      const month = t.date.substring(0, 7)
      if (!monthlySpend[month]) monthlySpend[month] = {}
      monthlySpend[month][t.category] = (monthlySpend[month][t.category] || 0) + Number(t.amount)
    })

  const currentSpend = monthlySpend[currentMonth] || {}
  const prevMonths = Object.keys(monthlySpend)
    .filter((m) => m < currentMonth)
    .sort()
    .slice(-3)

  if (prevMonths.length === 0) return anomalies

  for (const [category, amount] of Object.entries(currentSpend)) {
    const prevAmounts = prevMonths.map((m) => monthlySpend[m]?.[category] || 0)
    const baseline = prevAmounts.reduce((a, b) => a + b, 0) / prevMonths.length
    if (baseline === 0) continue
    const spike = ((amount - baseline) / baseline) * 100
    if (spike > 80 && amount - baseline > 1000) {
      anomalies.push({ category, thisMonth: amount, baseline, spike })
    }
  }

  return anomalies.sort((a, b) => b.spike - a.spike).slice(0, 3)
}

export function generateForecast(
  transactions: Array<{ amount: number; type: string; date: string; category: string }>
): Array<{
  month: string
  label: string
  forecastIncome: number
  forecastExpenses: number
  forecastSavings: number
  confidence: number
}> {
  const now = new Date()
  const monthlyData: Record<string, { income: number; expenses: number }> = {}

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyData[key] = { income: 0, expenses: 0 }
  }

  transactions.forEach((t) => {
    const month = t.date.substring(0, 7)
    if (!monthlyData[month]) return
    if (t.type === 'credit') monthlyData[month].income += Number(t.amount)
    else monthlyData[month].expenses += Number(t.amount)
  })

  const months = Object.entries(monthlyData).filter(([, d]) => d.income > 0 || d.expenses > 0)
  if (months.length < 2) return []

  const weights = [1, 1.5, 2, 2.5, 3, 3.5].slice(-months.length)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const avgIncome = months.reduce((sum, [, d], i) => sum + d.income * weights[i], 0) / totalWeight
  const avgExpenses =
    months.reduce((sum, [, d], i) => sum + d.expenses * weights[i], 0) / totalWeight

  const recentMonths = months.slice(-3)
  const incomeTrend =
    recentMonths.length >= 2
      ? (recentMonths[recentMonths.length - 1][1].income - recentMonths[0][1].income) /
        recentMonths.length
      : 0
  const expenseTrend =
    recentMonths.length >= 2
      ? (recentMonths[recentMonths.length - 1][1].expenses - recentMonths[0][1].expenses) /
        recentMonths.length
      : 0

  const forecast = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    const dampening = 1 - i * 0.1
    const forecastIncome = Math.max(0, avgIncome + incomeTrend * i * dampening)
    const forecastExpenses = Math.max(0, avgExpenses + expenseTrend * i * dampening)
    const confidence = Math.max(40, 85 - i * 15)
    forecast.push({
      month,
      label,
      forecastIncome,
      forecastExpenses,
      forecastSavings: forecastIncome - forecastExpenses,
      confidence,
    })
  }

  return forecast
}

export type CardBrand = 'Visa' | 'Mastercard' | 'RuPay' | 'American Express' | 'Diners'

export interface AITransactionResult {
  is_transaction: boolean
  transaction_type: 'debit' | 'credit' | null
  amount: number | null
  merchant: string | null
  category: string | null
  description: string | null
  payment_mode:
    | 'upi'
    | 'credit_card'
    | 'debit_card'
    | 'net_banking'
    | 'wallet'
    | 'neft'
    | 'imps'
    | 'rtgs'
    | 'atm'
    | 'nach'
    | 'cheque'
    | 'unknown'
    | null
  card_issuer: string | null    // Bank name e.g. "HDFC", "SBI" — internal use only
  card_brand: CardBrand | null  // Card network e.g. "Visa", "Mastercard" — shown to user
  transaction_time: string | null // HH:MM format
  reference_id: string | null
  date: string | null
  confidence_score: number
}

/**
 * Use Gemini AI to verify if an email represents a completed transaction
 * and extract structured metadata.
 */
export async function analyzeTransactionEmailWithAI(
  subject: string,
  body: string,
  emailDate: string
): Promise<AITransactionResult | null> {
  if (!GEMINI_API_KEY) return null

  try {
    const prompt = `
Analyze the following bank/payment email to determine if it describes a COMPLETED financial transaction.

Subject: "${subject}"
Date: "${emailDate}"
Body:
"""
${body.substring(0, 1500)}
"""

STRICT RULES — set is_transaction to FALSE for ALL of:
- OTPs, login alerts, verification codes, security alerts
- Payment reminders, bill generation, due dates, upcoming scheduled debits
- Declined, failed, cancelled, or reversed transactions
- Promotional emails, cashback OFFERS (not credits), discount codes, coupons
- Reward point NOTIFICATIONS (not actual money)
- Festival/sale announcements, limited-period offers
- Credit limit increase offers, pre-approved loan offers
- Balance update alerts, account balance notifications
- Auto-debit SCHEDULED notices (money not yet moved)
- Any email where money movement is in FUTURE tense ("will be debited", "scheduled for")
- Order confirmation / booking confirmation emails where actual charge is not yet confirmed
- Emails saying "We received your payment" sent BY a merchant to a customer (this is a payment receipt from the business — the customer paid, so this would be a debit for the customer)
- Any email about savings, investments, wallet top-up offers, or cashback promotions
- Statements, summaries, or account overviews

ONLY set is_transaction to TRUE when money has ALREADY moved (past tense):
- Debited, credited, paid, transferred, withdrawn, charged, received (when bank is informing customer of credit), deposited, settled

If TRUE, extract:
- transaction_type: 'debit' (money out) or 'credit' (money in)
- amount: exact transaction amount in INR as a number. Do NOT use balance or limit amounts.
- merchant: clean merchant/vendor name (e.g. 'Swiggy', 'Amazon', 'Airtel'). Strip suffixes like 'Ltd', 'Pvt', 'Private Limited'.
- category: one of 'food', 'groceries', 'transport', 'utilities', 'shopping', 'entertainment', 'subscriptions', 'salary', 'travel', 'health', 'investments', 'other'
- description: short clear description (e.g. 'Swiggy food order', 'Airtel bill payment')
- payment_mode: one of 'upi', 'credit_card', 'debit_card', 'net_banking', 'wallet', 'neft', 'imps', 'rtgs', 'atm', 'nach', 'cheque', 'unknown'
- card_issuer: issuing bank name only if clearly stated (e.g. 'HDFC', 'SBI', 'ICICI', 'Axis'). null if not found. Do NOT include account numbers or card numbers.
- card_brand: card network only if explicitly mentioned — one of 'Visa', 'Mastercard', 'RuPay', 'American Express', 'Diners'. null if not found.
- transaction_time: time of transaction in HH:MM (24h) format if mentioned. null if not found.
- reference_id: UPI transaction ID or NEFT UTR number for deduplication. null if not found.
- date: transaction date in YYYY-MM-DD. Use email date "${emailDate}" if not specified.
- confidence_score: 0-100. Use 90+ only for clear bank-sent transaction alerts. Use 60-89 for likely transactions. Use 0-59 for uncertain cases (these will be reviewed or rejected).

Return ONLY JSON, no markdown:
{
  "is_transaction": true,
  "transaction_type": "debit",
  "amount": 450.00,
  "merchant": "Swiggy",
  "category": "food",
  "description": "Swiggy food order",
  "payment_mode": "upi",
  "card_issuer": null,
  "card_brand": null,
  "transaction_time": "20:32",
  "reference_id": "123456789012",
  "date": "YYYY-MM-DD",
  "confidence_score": 95
}
If NOT a completed transaction:
{
  "is_transaction": false,
  "transaction_type": null,
  "amount": null,
  "merchant": null,
  "category": null,
  "description": null,
  "payment_mode": null,
  "card_issuer": null,
  "card_brand": null,
  "transaction_time": null,
  "reference_id": null,
  "date": null,
  "confidence_score": 0
}
`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          topP: 0.9,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const result: AITransactionResult = JSON.parse(jsonMatch[0])

    if (result && typeof result.is_transaction === 'boolean') {
      return result
    }
    return null
  } catch (e) {
    console.warn('[AI] Gemini email parsing failed:', e)
    return null
  }
}
