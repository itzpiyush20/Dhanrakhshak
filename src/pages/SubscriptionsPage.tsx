// ============================================
// SubscriptionsPage — Smart Subscriptions Tracker
// Detects, aggregates, and manages recurring payments
// ============================================

import { useState, useEffect } from 'react'
import AppLayout from '@/layouts/AppLayout'
import { Card, Button, Badge, Input } from '@/components/ui'
import Select from '@/components/ui/Select'
import { getTransactions, createTransaction } from '@/services'
import { formatCurrency, formatDate } from '@/utils'
import { CATEGORIES } from '@/constants'
import type { Database } from '@/types/database'
import { useAuth } from '@/context/AuthContext'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface Subscription {
  merchant: string
  category: string
  amount: number
  lastBilled: string
  nextRenewal: string
  daysToRenewal: number
  isAutoDetected: boolean
  frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown'
  priceChange: number | null  // positive = increase, negative = decrease
  timesCharged: number
}

export default function SubscriptionsPage() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)

  // Manual Subscription Form States
  const [subName, setSubName] = useState('')
  const [subAmount, setSubAmount] = useState('')
  const [subCategory, setSubCategory] = useState('subscriptions')
  const [subRenewalDay, setSubRenewalDay] = useState(1)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data } = await getTransactions()
      if (data) {
        setTransactions(data)
      }
    } catch (e) {
      console.error('Failed to fetch transactions for subscriptions:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    document.title = 'Subscriptions | Dhanrakshak'
    fetchData()
  }, [])

  // Auto-detect subscriptions from history — supports monthly, quarterly, annual
  const detectSubscriptions = (): Subscription[] => {
    const list: Subscription[] = []
    const now = new Date()

    const debits = transactions.filter((t) => t.type === 'debit')

    // Group by cleaned merchant
    const grouped: Record<string, TransactionRow[]> = {}
    debits.forEach((t) => {
      if (!t.merchant) return
      const cleanKey = t.merchant.trim().toLowerCase()
      if (!grouped[cleanKey]) grouped[cleanKey] = []
      grouped[cleanKey].push(t)
    })

    for (const [_, txns] of Object.entries(grouped)) {
      txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const latest = txns[0]
      const isSubCategory = latest.category === 'subscriptions' || latest.category === 'utilities'

      let isRecurring = false
      let frequency: Subscription['frequency'] = 'unknown'
      let renewalDays = 30
      let maxStaleDays = 65  // how old last charge can be and still be "active"

      if (isSubCategory && txns.length === 1) {
        // Single entry but subscription category — treat as monthly
        isRecurring = true
        frequency = 'monthly'
        renewalDays = 30
      } else if (txns.length >= 2) {
        const d1 = new Date(txns[0].date)
        const d2 = new Date(txns[1].date)
        const diffDays = Math.round(Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
        const amountVar = Math.abs(Number(txns[0].amount) - Number(txns[1].amount)) / Math.max(1, Number(txns[0].amount))

        if (diffDays >= 25 && diffDays <= 40 && amountVar < 0.15) {
          isRecurring = true; frequency = 'monthly'; renewalDays = 30; maxStaleDays = 65
        } else if (diffDays >= 80 && diffDays <= 100 && amountVar < 0.15) {
          isRecurring = true; frequency = 'quarterly'; renewalDays = 91; maxStaleDays = 105
        } else if (diffDays >= 350 && diffDays <= 380 && amountVar < 0.15) {
          isRecurring = true; frequency = 'annual'; renewalDays = 365; maxStaleDays = 395
        } else if (isSubCategory) {
          // Category hints it's recurring even if we can't determine frequency
          isRecurring = true; frequency = 'monthly'; renewalDays = 30; maxStaleDays = 65
        }
      }

      if (isRecurring) {
        const lastBilledDate = new Date(latest.date)
        const daysSinceLastBilled = Math.round((now.getTime() - lastBilledDate.getTime()) / (1000 * 60 * 60 * 24))

        if (daysSinceLastBilled > maxStaleDays) continue  // Expired or cancelled

        const nextRenewalDate = new Date(lastBilledDate.getTime())
        nextRenewalDate.setDate(nextRenewalDate.getDate() + renewalDays)
        const daysToRenewal = Math.ceil((nextRenewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        const avgAmount = txns.reduce((sum, t) => sum + Number(t.amount), 0) / txns.length

        // Detect price change: compare latest vs previous charge
        let priceChange: number | null = null
        if (txns.length >= 2) {
          const delta = Number(txns[0].amount) - Number(txns[1].amount)
          if (Math.abs(delta) > 5) priceChange = delta  // ₹5 threshold to ignore rounding
        }

        list.push({
          merchant: latest.merchant || 'Recurring Payment',
          category: latest.category,
          amount: Math.round(avgAmount),
          lastBilled: latest.date,
          nextRenewal: nextRenewalDate.toISOString().split('T')[0],
          daysToRenewal,
          isAutoDetected: true,
          frequency,
          priceChange,
          timesCharged: txns.length,
        })
      }
    }

    return list.sort((a, b) => a.daysToRenewal - b.daysToRenewal)
  }

  const detectedSubs = detectSubscriptions()
  const totalMonthlyOutflow = detectedSubs.reduce((sum, s) => sum + s.amount, 0)

  // Verify duplicates (e.g. streaming duplicate warnings)
  const musicKeywords = ['spotify', 'apple music', 'yt music', 'youtube music', 'wynk', 'jiosaavn']
  const videoKeywords = ['netflix', 'prime', 'hotstar', 'disney', 'jio cinema', 'jiocinema', 'youtube premium']

  const activeMusic = detectedSubs.filter(s => musicKeywords.some(kw => s.merchant.toLowerCase().includes(kw)))
  const activeVideo = detectedSubs.filter(s => videoKeywords.some(kw => s.merchant.toLowerCase().includes(kw)))

  const handleAddManualSub = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess(false)

    const amountNum = Number(subAmount)
    if (!subName.trim()) {
      setFormError('Please enter a subscription name.')
      return
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid monthly price.')
      return
    }

    try {
      const now = new Date()
      // Create a date in this month with the selected renewal day
      const targetDate = new Date(now.getFullYear(), now.getMonth(), subRenewalDay)
      // If target date is in the past, default to last month or this month transaction
      const dateStr = targetDate.toISOString().split('T')[0]

      if (!user) throw new Error('User not logged in')

      const { error } = await createTransaction({
        user_id: user.id,
        amount: amountNum,
        type: 'debit',
        category: subCategory,
        merchant: subName.trim(),
        description: `${subName.trim()} Subscription`,
        date: dateStr,
        source: 'manual',
        approval_status: 'approved',
      })

      if (error) throw error

      setFormSuccess(true)
      setSubName('')
      setSubAmount('')
      setSubCategory('subscriptions')
      setSubRenewalDay(1)
      
      // Reload list
      fetchData()
    } catch (err: any) {
      setFormError(err.message || 'Failed to add manual subscription record.')
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Smart Subscriptions</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Auto-detect active streaming, broadband, and billing cycles, and track upcoming renewals.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="h-40 skeleton"><div /></Card>
            <Card className="h-60 skeleton md:col-span-2"><div /></Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Left Column: Summary Card and Manual Creator */}
            <div className="md:col-span-1 space-y-6">
              {/* Summary */}
              <Card className="border-border-subtle bg-surface-1 shadow-md p-6">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Total Subscriptions</h2>
                <div className="flex flex-col gap-1">
                  <span className="text-3xl font-extrabold tracking-tight text-white">
                    {formatCurrency(totalMonthlyOutflow)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    accumulated monthly across {detectedSubs.length} active plans.
                  </span>
                </div>
              </Card>

              {/* Duplicate Alerts */}
              {(activeMusic.length > 1 || activeVideo.length > 2) && (
                <Card className="border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    ⚠️ Optimization Suggestions
                  </h3>
                  <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                    {activeMusic.length > 1 && (
                      <p>
                        You hold multiple active music subscriptions: <strong>{activeMusic.map(m => m.merchant).join(', ')}</strong>. You could save up to {formatCurrency(activeMusic.reduce((sum, s) => sum + s.amount, 0) - activeMusic[0].amount)}/mo by consolidating into one provider.
                      </p>
                    )}
                    {activeVideo.length > 2 && (
                      <p>
                        You have {activeVideo.length} streaming video services active. Consider cycling subscriptions (subscribing only when watching specific releases) to reduce passive cash drainage.
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* Creator Form */}
              <Card className="border border-border-subtle bg-surface-1 shadow-md">
                <h2 className="text-sm font-bold text-zinc-200 mb-4">📝 Add Manual Subscription</h2>
                
                <form onSubmit={handleAddManualSub} className="space-y-4">
                  {formError && (
                    <div className="text-xs p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
                      {formError}
                    </div>
                  )}
                  {formSuccess && (
                    <div className="text-xs p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                      Subscription registered successfully!
                    </div>
                  )}

                  <Input
                    label="Subscription / Service"
                    placeholder="e.g. Netflix Premium"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    required
                  />

                  <Input
                    label="Monthly Price (₹)"
                    type="number"
                    placeholder="649"
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                        Category
                      </label>
                      <Select
                        value={subCategory}
                        onChange={(e) => setSubCategory(e.target.value)}
                      >
                        <option value="subscriptions">🔄 Subscriptions</option>
                        <option value="utilities">💡 Utilities</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                        Renewal Day (of month)
                      </label>
                      <select
                        value={subRenewalDay}
                        onChange={(e) => setSubRenewalDay(Number(e.target.value))}
                        className="w-full bg-surface-2 border border-border-subtle/50 text-xs rounded-xl h-11 px-3 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>Day {d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button type="submit" block size="sm">
                    Register Subscription
                  </Button>
                </form>
              </Card>
            </div>

            {/* Right Column: Active Subscriptions List */}
            <div className="md:col-span-2">
              <Card className="border-border-subtle bg-surface-1 shadow-md">
                <h2 className="text-base font-bold text-zinc-200 mb-4">📅 Subscription Renewal Calendar</h2>

                {detectedSubs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
                    No active recurring payments detected in this period. Add subscriptions manually or scan transaction alerts.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detectedSubs.map((sub, idx) => {
                      const categoryMeta = CATEGORIES[sub.category as keyof typeof CATEGORIES]
                      
                      let badgeVariant: 'success' | 'warning' | 'danger' = 'success'
                      if (sub.daysToRenewal <= 2) badgeVariant = 'danger'
                      else if (sub.daysToRenewal <= 7) badgeVariant = 'warning'

                      const freqLabel = sub.frequency === 'monthly' ? 'Monthly'
                        : sub.frequency === 'quarterly' ? 'Quarterly'
                        : sub.frequency === 'annual' ? 'Annual'
                        : 'Recurring'

                      return (
                        <div
                          key={`${sub.merchant}-${idx}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-2/40 border border-border-subtle/30 text-xs hover:bg-surface-2 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-surface-1 flex items-center justify-center text-lg border border-border-subtle/60 shrink-0">
                              {categoryMeta?.emoji || '🔄'}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-200 truncate capitalize">{sub.merchant}</span>
                                {sub.priceChange !== null && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    sub.priceChange > 0
                                      ? 'bg-red-500/15 text-red-400'
                                      : 'bg-emerald-500/15 text-emerald-400'
                                  }`}>
                                    {sub.priceChange > 0 ? '↑' : '↓'} Price {sub.priceChange > 0 ? 'Increased' : 'Decreased'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-zinc-500">
                                  Last billed: {formatDate(sub.lastBilled)}
                                </span>
                                <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">
                                  {freqLabel} · {sub.timesCharged}× charged
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 justify-between sm:justify-end">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-zinc-100">{formatCurrency(sub.amount)}</span>
                              <span className="text-[9px] text-zinc-500">{freqLabel.toLowerCase()}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant={badgeVariant}>
                                {sub.daysToRenewal <= 0 ? 'Renews today' : sub.daysToRenewal === 1 ? 'Renews tomorrow' : `Renews in ${sub.daysToRenewal}d`}
                              </Badge>
                              <span className="text-[9px] text-zinc-500">
                                Date: {formatDate(sub.nextRenewal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
