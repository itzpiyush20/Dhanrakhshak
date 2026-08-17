// ============================================
// ActiveSubscriptionsWidget — recurring payments
// detected from history, shown on the Dashboard
// ============================================

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useCategories } from '@/context/CategoriesContext'
import { formatCurrency } from '@/utils'
import { toISODateLocal } from '@/utils/dateFilter'
import { fetchAllTransactions } from '@/services/transactions'
import {
  detectSubscriptions,
  loadIgnoredSubscriptionKeys,
  SUBSCRIPTION_LOOKBACK_MONTHS,
  type DetectedSubscription,
} from '@/services/subscriptionDetection'
import { RefreshCw } from 'lucide-react'

interface ActiveSubscriptionsWidgetProps {
  isVisible: boolean
}

export default function ActiveSubscriptionsWidget({ isVisible }: ActiveSubscriptionsWidgetProps) {
  const { user } = useAuth()
  const { getStyle } = useCategories()
  const [subs, setSubs] = useState<DetectedSubscription[] | null>(null)

  // This widget used to run detection over the Dashboard's five most recent
  // transactions, which is not enough data for the algorithm to work: two
  // charges from one merchant a month apart never appear in five rows, so
  // every merchant fell through to the category heuristic and a single
  // "Utilities & Bills" charge was rendered as an active subscription with an
  // invented 30-day renewal — and counted in "monthly burn". It now fetches
  // the same window the Subscriptions page uses, through the same detector.
  useEffect(() => {
    if (!user || !isVisible) return
    let cancelled = false

    const since = new Date()
    since.setMonth(since.getMonth() - SUBSCRIPTION_LOOKBACK_MONTHS)

    // Debits only — detection ignores credits anyway, and halving the row count
    // matters on a fetch that now runs on every Dashboard visit.
    fetchAllTransactions({ dateFrom: toISODateLocal(since), type: 'debit' })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setSubs([])
          return
        }
        setSubs(
          detectSubscriptions(data, { ignoredKeys: loadIgnoredSubscriptionKeys(user.id) })
        )
      })
      .catch((e) => {
        if (cancelled) return
        console.error('Failed to detect subscriptions:', e)
        setSubs([])
      })

    return () => {
      cancelled = true
    }
  }, [user, isVisible])

  if (!isVisible || subs === null || subs.length === 0) return null

  const monthlyBurn = subs.reduce((s, sub) => s + sub.amount, 0)

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
          className="shrink-0 -m-2 p-2 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          Manage →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {subs.slice(0, 6).map((sub) => {
          const renewsColor =
            sub.daysToRenewal <= 3
              ? 'text-[var(--status-danger-text)] bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]'
              : sub.daysToRenewal <= 7
              ? 'text-[var(--status-warning-text)] bg-[var(--status-warning-subtle)] border-[var(--status-warning-border)]'
              : 'text-[var(--status-positive-text)] bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
          const cat = getStyle(sub.category)
          return (
            <div
              key={sub.merchant}
              className="flex items-center gap-3 rounded-xl bg-surface-2/50 border border-border-subtle/60 px-3 py-2.5 hover:bg-surface-2 transition-colors"
            >
              <span className="text-xl shrink-0">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate" title={sub.merchant}>{sub.merchant}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{formatCurrency(sub.amount)}/mo</p>
              </div>
              <div className={`text-xs font-bold rounded-lg px-2 py-1 border shrink-0 ${renewsColor}`}>
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
