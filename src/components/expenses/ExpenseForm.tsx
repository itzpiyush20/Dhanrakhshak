// ============================================
// ExpenseForm — Add or Edit a transaction
// ============================================

import { useState, type FormEvent } from 'react'
import { Button, Input, Card } from '@/components/ui'
import Select from '@/components/ui/Select'
import { CATEGORIES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { createTransaction, updateTransaction } from '@/services/transactions'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface ExpenseFormProps {
  /** Pass existing transaction to enable edit mode */
  editingTransaction?: TransactionRow | null
  /** Called after successful save */
  onSaved: () => void
  /** Called to cancel editing */
  onCancel?: () => void
}

const categoryOptions = Object.entries(CATEGORIES).map(([value, cat]) => ({
  value,
  label: `${cat.emoji} ${cat.label}`,
}))

const typeOptions = [
  { value: 'debit', label: '💸 Expense (Debit)' },
  { value: 'credit', label: '💰 Income (Credit)' },
]

export default function ExpenseForm({ editingTransaction, onSaved, onCancel }: ExpenseFormProps) {
  const { user } = useAuth()
  const isEditing = !!editingTransaction

  const [type, setType] = useState(editingTransaction?.type || 'debit')
  const [amount, setAmount] = useState(editingTransaction?.amount?.toString() || '')
  const [category, setCategory] = useState(editingTransaction?.category || 'other')
  const [description, setDescription] = useState(editingTransaction?.description || '')
  const [notes, setNotes] = useState(editingTransaction?.notes || '')
  const [date, setDate] = useState(
    editingTransaction?.date || new Date().toISOString().split('T')[0]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError('')

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setLoading(true)

    if (isEditing && editingTransaction) {
      const { error } = await updateTransaction(editingTransaction.id, {
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        notes: notes || null,
        date,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
    } else {
      const { error } = await createTransaction({
        user_id: user.id,
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        notes: notes || null,
        date,
        source: 'manual',
        approval_status: 'approved',
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
    }

    // Reset form
    if (!isEditing) {
      setAmount('')
      setDescription('')
      setNotes('')
      setCategory('other')
      setDate(new Date().toISOString().split('T')[0])
    }

    setLoading(false)
    onSaved()
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white mb-5">
        {isEditing ? '✏️ Edit Transaction' : '➕ Add Transaction'}
      </h2>

      {error && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Type"
            options={typeOptions}
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          />

          <Input
            label="Amount (₹)"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="0.01"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <Input
          label="Description"
          placeholder="What was this for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <Input
          label="Notes (optional)"
          placeholder="Any additional details..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            {isEditing ? 'Update' : 'Add Transaction'}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
