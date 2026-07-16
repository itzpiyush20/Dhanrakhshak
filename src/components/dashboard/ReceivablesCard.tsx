// ============================================
// ReceivablesCard — money owed back to the user,
// due this month or overdue. Renders nothing when
// there's nothing pending.
// ============================================

import { useEffect, useState, useCallback } from 'react'
import { Card, Button } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils'
import { getActiveReceivables, settleReceivable } from '@/services/transactions'
import { HandCoins } from 'lucide-react'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

export default function ReceivablesCard() {
  const [receivables, setReceivables] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settlingId, setSettlingId] = useState<string | null>(null)

  const fetchReceivables = useCallback(async () => {
    const { data } = await getActiveReceivables()
    setReceivables(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReceivables()
  }, [fetchReceivables])

  const handleSettle = async (id: string) => {
    setSettlingId(id)
    await settleReceivable(id)
    await fetchReceivables()
    setSettlingId(null)
  }

  if (loading || receivables.length === 0) return null

  const today = new Date().toISOString().split('T')[0]

  return (
    <Card className="shadow-md">
      <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
        <HandCoins className="h-4 w-4 text-brand-400" />
        To Receive
      </h2>
      <div className="space-y-2">
        {receivables.map((r) => {
          const isOverdue = !!r.expected_return_date && r.expected_return_date < today
          const isDueSoon =
            !!r.expected_return_date &&
            !isOverdue &&
            new Date(r.expected_return_date).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000

          const dateColor = isOverdue
            ? 'text-[var(--status-danger-text)]'
            : isDueSoon
            ? 'text-[var(--status-warning-text)]'
            : 'text-zinc-500'

          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/50 border border-border-subtle/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">
                  {r.counterparty || 'Someone'} owes {formatCurrency(Number(r.amount))}
                </p>
                <p className={`text-[10px] mt-0.5 ${dateColor}`}>
                  {isOverdue ? 'Overdue since ' : 'Due '}
                  {r.expected_return_date ? formatDate(r.expected_return_date) : 'soon'}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={settlingId === r.id}
                onClick={() => handleSettle(r.id)}
                className="shrink-0"
              >
                Mark received
              </Button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
