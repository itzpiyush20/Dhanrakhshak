// ============================================
// ExpenseList — Displays transactions with
// edit/delete actions
// ============================================

import { Card, Badge, Button, EmptyState } from '@/components/ui'
import { CATEGORIES } from '@/constants'
import { formatCurrency, formatDate } from '@/utils'
import { deleteTransaction } from '@/services/transactions'
import type { Database } from '@/types/database'
import { useState } from 'react'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface ExpenseListProps {
  transactions: TransactionRow[]
  loading: boolean
  onEdit: (transaction: TransactionRow) => void
  onRefresh: () => void
}

export default function ExpenseList({
  transactions,
  loading,
  onEdit,
  onRefresh,
}: ExpenseListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    setDeletingId(id)
    await deleteTransaction(id)
    setDeletingId(null)
    onRefresh()
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="skeleton h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/3" />
              </div>
              <div className="skeleton h-5 w-20" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="💸"
          title="No transactions yet"
          description="Add your first expense or income to start tracking."
        />
      </Card>
    )
  }

  return (
    <Card noPadding>
      <div className="divide-y divide-border-subtle">
        {transactions.map((txn) => {
          const cat = CATEGORIES[txn.category as keyof typeof CATEGORIES] || CATEGORIES.other
          const isDebit = txn.type === 'debit'

          return (
            <div
              key={txn.id}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
            >
              {/* Category icon */}
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: `${cat.color}15` }}
              >
                {cat.emoji}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {txn.description || cat.label}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500">{formatDate(txn.date)}</span>
                  <Badge>{cat.label}</Badge>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-semibold ${
                    isDebit ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {isDebit ? '-' : '+'}{formatCurrency(Number(txn.amount))}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(txn)}
                  title="Edit"
                >
                  ✏️
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(txn.id)}
                  loading={deletingId === txn.id}
                  title="Delete"
                >
                  🗑️
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
