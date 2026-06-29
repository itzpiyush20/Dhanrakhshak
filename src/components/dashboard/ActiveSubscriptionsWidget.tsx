import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import { CATEGORIES } from '@/constants'
import { formatCurrency } from '@/utils'
import { RefreshCw } from 'lucide-react'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface ActiveSubscriptionsWidgetProps {
  recentTransactions: TransactionRow[]
  loading: boolean
  isVisible: boolean
}

export default function ActiveSubscriptionsWidget({
  recentTransactions,
  loading,
  isVisible,
}: ActiveSubscriptionsWidgetProps) {
  if (!isVisible || loading || recentTransactions.length === 0) return null

  const now = new Date()
  const subs: Array<{ merchant: string; amount: number; daysToRenewal: number; category: string }> = []
  const seen = new Set<string>()
  const debits = recentTransactions.filter(t => t.type === 'debit')

  // Group by merchant
  const grouped: Record<string, typeof debits> = {}
  debits.forEach(t => {
    if (!t.merchant) return
    const key = t.merchant.trim().toLowerCase()
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  })

  // Detect recurring patterns (monthly ±10d, or subscription category)
  for (const [key, txns] of Object.entries(grouped)) {
    if (seen.has(key)) continue
    txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const latest = txns[0]
    const isSubCat = ['subscriptions', 'utilities'].includes(latest.category)
    let isRecurring = isSubCat

    if (!isRecurring && txns.length >= 2) {
      const d1 = new Date(txns[0].date), d2 = new Date(txns[1].date)
      const diffDays = Math.round(Math.abs(d1.getTime() - d2.getTime()) / 86400000)
      const amtVar = Math.abs(Number(txns[0].amount) - Number(txns[1].amount)) / (Number(txns[0].amount) || 1)
      if (diffDays >= 22 && diffDays <= 40 && amtVar < 0.15) isRecurring = true
    }

    if (isRecurring) {
      const lastBilled = new Date(latest.date)
      const daysSince = Math.round((now.getTime() - lastBilled.getTime()) / 86400000)
      if (daysSince < 60) {
        const nextRenewal = new Date(lastBilled.getTime() + 30 * 86400000)
        const daysToRenewal = Math.ceil((nextRenewal.getTime() - now.getTime()) / 86400000)
        const avgAmt = txns.reduce((s, t) => s + Number(t.amount), 0) / txns.length
        seen.add(key)
        subs.push({
          merchant: latest.merchant || 'Recurring',
          amount: Math.round(avgAmt),
          daysToRenewal,
          category: latest.category,
        })
      }
    }
  }

  subs.sort((a, b) => a.daysToRenewal - b.daysToRenewal)
  const monthlyBurn = subs.reduce((s, sub) => s + sub.amount, 0)

  if (subs.length === 0) return null

  return (
    <Card className="mt-2" id="subscription-widget">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-brand-400 animate-spin-slow" />
            <span>Active Subscriptions</span>
            <span className="text-xs font-normal text-zinc-500 ml-1">auto-detected</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Monthly subscription burn:{' '}
            <span className="text-text-primary font-semibold">{formatCurrency(monthlyBurn)}</span>
          </p>
        </div>
        <Link
          to="/subscriptions"
          className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          Manage →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {subs.slice(0, 6).map((sub, idx) => {
          const renewsColor =
            sub.daysToRenewal <= 3
              ? 'text-[var(--status-danger-text)] bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]'
              : sub.daysToRenewal <= 7
              ? 'text-[var(--status-warning-text)] bg-[var(--status-warning-subtle)] border-[var(--status-warning-border)]'
              : 'text-[var(--status-positive-text)] bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
          const cat = CATEGORIES[sub.category as keyof typeof CATEGORIES] || CATEGORIES.subscriptions
          return (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-xl bg-surface-2/50 border border-border-subtle/60 px-3 py-2.5 hover:bg-surface-2 transition-colors"
            >
              <span className="text-xl shrink-0">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">{sub.merchant}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{formatCurrency(sub.amount)}/mo</p>
              </div>
              <div className={`text-[10px] font-bold rounded-lg px-2 py-1 border shrink-0 ${renewsColor}`}>
                {sub.daysToRenewal <= 0 ? 'Due!' : sub.daysToRenewal === 1 ? '1 day' : `${sub.daysToRenewal}d`}
              </div>
            </div>
          )
        })}
      </div>
      {subs.length > 6 && (
        <p className="text-xs text-zinc-500 mt-3 text-center">
          +{subs.length - 6} more ·{' '}
          <Link to="/subscriptions" className="text-brand-400 hover:underline">
            View all
          </Link>
        </p>
      )}
    </Card>
  )
}
