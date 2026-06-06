// ============================================
// ExpenseList — Displays transactions with
// edit/delete actions and bulk operations
// ============================================

import { Card, Badge, Button, EmptyState } from '@/components/ui'
import { CATEGORIES } from '@/constants'
import { formatCurrency, formatDate } from '@/utils'
import { deleteTransaction, bulkDeleteTransactions, bulkUpdateTransactionsCategory } from '@/services/transactions'
import type { Database } from '@/types/database'
import { useState, useEffect } from 'react'

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Reset selection when transactions change
  useEffect(() => {
    setSelectedIds([])
  }, [transactions])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    setDeletingId(id)
    await deleteTransaction(id)
    setDeletingId(null)
    onRefresh()
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleToggleAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(transactions.map((t) => t.id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Delete all ${selectedIds.length} selected transactions?`)) return
    setIsBulkDeleting(true)
    try {
      await bulkDeleteTransactions(selectedIds)
      setSelectedIds([])
      onRefresh()
    } catch (err) {
      console.error('Bulk delete failed:', err)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleBulkCategoryUpdate = async (category: string) => {
    if (selectedIds.length === 0 || !category) return
    try {
      await bulkUpdateTransactionsCategory(selectedIds, category)
      setSelectedIds([])
      onRefresh()
    } catch (err) {
      console.error('Bulk category update failed:', err)
    }
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
      {/* Bulk Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface-2 border-b border-border-subtle/50 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
            checked={transactions.length > 0 && selectedIds.length === transactions.length}
            onChange={handleToggleAll}
            aria-label="Select all transactions"
          />
          <span className="text-xs font-semibold text-zinc-400">
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="bg-surface-1 border border-border-subtle/50 text-zinc-300 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
              onChange={(e) => {
                handleBulkCategoryUpdate(e.target.value)
                e.target.value = '' // Reset
              }}
              defaultValue=""
              aria-label="Bulk change category"
            >
              <option value="" disabled hidden>
                📂 Edit Category
              </option>
              {Object.entries(CATEGORIES).map(([value, cat]) => (
                <option key={value} value={value}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="px-3 py-1.5 rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] text-xs text-[var(--status-danger-text)] hover:bg-[var(--status-danger-border)] transition-all font-semibold cursor-pointer disabled:opacity-50"
            >
              {isBulkDeleting ? 'Deleting...' : '🗑️ Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border-subtle">
        {transactions.map((txn) => {
          const cat = CATEGORIES[txn.category as keyof typeof CATEGORIES] || CATEGORIES.other
          const isDebit = txn.type === 'debit'

          return (
            <div
              key={txn.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4 sm:px-5 transition-colors hover:bg-surface-2/50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Row Checkbox */}
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border-zinc-700 bg-surface-1 text-brand-500 focus:ring-brand-400 cursor-pointer"
                  checked={selectedIds.includes(txn.id)}
                  onChange={() => handleToggleSelect(txn.id)}
                  aria-label={`Select transaction ${txn.description || cat.label}`}
                />

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
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-zinc-500">{formatDate(txn.date)}</span>
                    <Badge>{cat.label}</Badge>
                    {txn.tags && txn.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center text-[10px] text-zinc-500 font-semibold hover:text-zinc-300 transition-colors"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Amount & Actions row on mobile, split on desktop */}
              <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-border-subtle/20 pt-2.5 sm:pt-0 sm:border-0 w-full sm:w-auto">
                <div className="text-left sm:text-right shrink-0">
                  <p
                    className={`text-sm font-semibold ${
                      isDebit ? 'text-[var(--status-danger-text)]' : 'text-[var(--status-positive-text)]'
                    }`}
                  >
                    {isDebit ? '-' : '+'}{formatCurrency(Number(txn.amount))}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 flex items-center justify-center cursor-pointer"
                    onClick={() => onEdit(txn)}
                    title="Edit"
                  >
                    ✏️
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 flex items-center justify-center text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)] cursor-pointer"
                    onClick={() => handleDelete(txn.id)}
                    loading={deletingId === txn.id}
                    title="Delete"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
