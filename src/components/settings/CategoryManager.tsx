// ============================================
// CategoryManager — Settings section for managing user-defined categories
// ============================================

import { useState } from 'react'
import { Card, Button, Badge, ConfirmDialog } from '@/components/ui'
import { useCategories } from '@/context'
import { useToast } from '@/context'
import { getCategoryUsage, deleteCategory } from '@/services/categories'
import { Layers, Plus, Pencil, Trash2 } from 'lucide-react'
import CategoryFormModal from './CategoryFormModal'
import type { Category } from '@/types'

export default function CategoryManager() {
  const { categories, refresh } = useCategories()
  const { showToast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteChecking, setDeleteChecking] = useState(false)

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const handleSaved = () => {
    closeForm()
    refresh()
  }

  const requestDelete = async (category: Category) => {
    setDeleteChecking(true)
    const { data, error } = await getCategoryUsage(category.name)
    setDeleteChecking(false)

    if (error) {
      showToast(error.message || 'Failed to check category usage.', 'error')
      return
    }

    const transactions = data?.transactions ?? 0
    const budgets = data?.budgets ?? 0
    const message =
      transactions + budgets > 0
        ? `${transactions} transaction(s) will be moved to the fallback category` +
          (budgets > 0 ? ` and ${budgets} budget(s) will be removed.` : '.')
        : 'This category is not used by any transactions or budgets.'

    setDeleteMessage(message)
    setDeleteTarget(category) // only NOW does the dialog open, with accurate data already in hand
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const { data, error } = await deleteCategory(deleteTarget.name)
    if (error) {
      showToast(error.message, 'error')
    } else {
      const moved = data?.moved_transactions ?? 0
      const fallbackName = data?.fallback_name ?? 'Other'
      showToast(
        moved > 0
          ? `Deleted. ${moved} transaction(s) moved to ${fallbackName}.`
          : 'Category deleted.',
        'success'
      )
      refresh()
    }
    setDeleteTarget(null)
    setDeleteMessage('')
  }

  const renderCategoryRow = (category: Category) => (
    <div
      key={category.id}
      className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface-2/60 border border-border-subtle/30 text-xs"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
        <span className="text-base shrink-0">{category.emoji}</span>
        <span className="font-semibold text-zinc-200 truncate">{category.name}</span>
        {category.budget_eligible && <Badge variant="info">Budget</Badge>}
        {category.is_default && <Badge variant="default">Default</Badge>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => openEdit(category)}
          className="h-10 w-10 rounded text-zinc-500 hover:text-zinc-200 hover:bg-surface-3 transition-colors flex items-center justify-center"
          title="Edit category"
          aria-label={`Edit ${category.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        {!category.is_permanent && (
          <button
            onClick={() => requestDelete(category)}
            disabled={deleteChecking}
            className="h-10 w-10 rounded text-zinc-500 hover:text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)] transition-colors flex items-center justify-center"
            title="Delete category"
            aria-label={`Delete ${category.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Card className="border-border-subtle bg-surface-1 shadow-md">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h2 className="text-base font-bold text-zinc-200 flex items-center gap-2">
          <Layers className="h-5 w-5 text-brand-400 shrink-0" />
          <span>Manage Categories</span>
        </h2>
        <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> New Category
        </Button>
      </div>
      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        Create, rename, restyle, or remove your own categories. Renaming updates every existing
        transaction, budget, and merchant rule automatically.
      </p>

      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
            Expense Categories
          </h3>
          <div className="space-y-2">
            {expenseCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
                No expense categories yet.
              </div>
            ) : (
              expenseCategories.map(renderCategoryRow)
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
            Income Categories
          </h3>
          <div className="space-y-2">
            {incomeCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
                No income categories yet.
              </div>
            ) : (
              incomeCategories.map(renderCategoryRow)
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <CategoryFormModal editing={editing} onClose={closeForm} onSaved={handleSaved} />
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteMessage('')
        }}
        onConfirm={handleConfirmDelete}
        title={`Delete "${deleteTarget?.name ?? ''}"`}
        message={deleteMessage}
        confirmLabel="Delete"
      />
    </Card>
  )
}
