// ============================================
// ExpenseForm — Add or Edit a transaction
// ============================================

import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'
import Select from '@/components/ui/Select'
import { useCategories } from '@/context/CategoriesContext'
import { useAuth } from '@/context/AuthContext'
import { createTransaction, updateTransaction } from '@/services'
import type { Database } from '@/types/database'
import { KNOWN_MERCHANTS } from '@/services/merchantNormalizer'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

interface ExpenseFormProps {
  /** Pass existing transaction to enable edit mode */
  editingTransaction?: TransactionRow | null
  /** Called after successful save */
  onSaved: () => void
  /** Called to cancel editing */
  onCancel?: () => void
}

const typeOptions = [
  { value: 'debit', label: '🔴 Expense (Debit)' },
  { value: 'credit', label: '🟢 Income (Credit)' },
]

export default function ExpenseForm({ editingTransaction, onSaved, onCancel }: ExpenseFormProps) {
  const { user, currencySymbol } = useAuth()
  const { categories, fallbackCategory } = useCategories()
  const isEditing = !!editingTransaction
  const defaultCategory = fallbackCategory?.name || 'Other'

  const categoryOptions = categories.map((c) => ({
    value: c.name,
    label: `${c.emoji} ${c.name}`,
  }))

  const [type, setType] = useState<string>(editingTransaction?.type || 'debit')
  const [amount, setAmount] = useState(editingTransaction?.amount?.toString() || '')
  const [category, setCategory] = useState(editingTransaction?.category || defaultCategory)
  const [description, setDescription] = useState(editingTransaction?.description || '')
  const [merchant, setMerchant] = useState(editingTransaction?.merchant || '')
  const [tagsInput, setTagsInput] = useState(
    editingTransaction?.tags?.join(', ') || ''
  )
  const [date, setDate] = useState(
    editingTransaction?.date || new Date().toISOString().split('T')[0]
  )
  const [isReturnable, setIsReturnable] = useState(editingTransaction?.is_returnable || false)
  const [counterparty, setCounterparty] = useState(editingTransaction?.counterparty || '')
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    editingTransaction?.expected_return_date ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState(editingTransaction?.notes || '')
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

    if (isReturnable && (!counterparty.trim() || !expectedReturnDate)) {
      setError('Please fill in who owes this and the expected return date')
      return
    }

    setLoading(true)

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (isEditing && editingTransaction) {
      const { error } = await updateTransaction(editingTransaction.id, {
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
        merchant: merchant.trim() || null,
        date,
        tags,
        is_returnable: type === 'debit' && isReturnable,
        counterparty: type === 'debit' && isReturnable ? counterparty : null,
        expected_return_date: type === 'debit' && isReturnable ? expectedReturnDate : null,
        return_status: type === 'debit' && isReturnable ? (editingTransaction.return_status || 'pending') : null,
        notes: notes || null,
        // A manual edit is an explicit human confirmation — mark it so this transaction
        // stops resurfacing in the Auto-Categorization Review modal on Pending.
        category_confirmed_at: new Date().toISOString(),
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
        merchant: merchant.trim() || null,
        date,
        source: 'manual',
        approval_status: 'approved',
        tags,
        is_returnable: type === 'debit' && isReturnable,
        counterparty: type === 'debit' && isReturnable ? counterparty : null,
        expected_return_date: type === 'debit' && isReturnable ? expectedReturnDate : null,
        return_status: type === 'debit' && isReturnable ? 'pending' : null,
        notes: notes || null,
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
      setMerchant('')
      setTagsInput('')
      setCategory(defaultCategory)
      setDate(new Date().toISOString().split('T')[0])
      setIsReturnable(false)
      setCounterparty('')
      setExpectedReturnDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      setNotes('')
    }

    setLoading(false)
    onSaved()
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-3 text-sm text-[var(--status-danger-text)]">
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
            label={`Amount (${currencySymbol})`}
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
          <div className="space-y-1.5">
            <Input
              label="Merchant"
              placeholder="e.g. Swiggy"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              list="merchant-suggestions"
            />
            <datalist id="merchant-suggestions">
              {KNOWN_MERCHANTS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <Select
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Description"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

        <div className="space-y-1.5">
          <Input
            label="Tags (comma-separated)"
            placeholder="e.g. food, vacation, work"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          {tagsInput && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tagsInput
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0)
                .map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-lg bg-brand-500/10 border border-brand-500/25 text-xs font-semibold text-brand-400"
                  >
                    #{t}
                  </span>
                ))}
            </div>
          )}
        </div>

        {type === 'debit' && (
          <div className="space-y-3 rounded-xl border border-border-subtle/50 bg-surface-2/30 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isReturnable}
                onChange={(e) => setIsReturnable(e.target.checked)}
                className="rounded border-zinc-700 bg-surface-2 text-brand-500 focus:ring-brand-500/25 h-4 w-4"
              />
              This is money I'll get back
            </label>

            {isReturnable && (
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <Input
                  label="Who owes this"
                  placeholder="e.g. Rahul"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  required={isReturnable}
                />
                <Input
                  label="Expected return date"
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  min={date}
                  required={isReturnable}
                />
              </div>
            )}
          </div>
        )}

        {(isReturnable || notes) && (
          <Input
            label="Remarks"
            placeholder="Additional details..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full">
          <Button type="submit" loading={loading} className="w-full sm:w-auto justify-center">
            {isEditing ? 'Update' : 'Add Transaction'}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" className="w-full sm:w-auto justify-center" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </>
  )
}
