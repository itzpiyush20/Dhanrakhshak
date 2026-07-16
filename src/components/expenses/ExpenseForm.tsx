// ============================================
// ExpenseForm — Add or Edit a transaction
// ============================================

import { useState, type FormEvent } from 'react'
import { Button, Input, Card } from '@/components/ui'
import Select from '@/components/ui/Select'
import { CATEGORIES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { createTransaction, updateTransaction, saveMerchantRule, cleanMerchantName, supabase, saveMerchantRuleToDb } from '@/services'
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
  { value: 'debit', label: '🔴 Expense (Debit)' },
  { value: 'credit', label: '🟢 Income (Credit)' },
]

export default function ExpenseForm({ editingTransaction, onSaved, onCancel }: ExpenseFormProps) {
  const { user, currencySymbol } = useAuth()
  const isEditing = !!editingTransaction

  const [type, setType] = useState<string>(editingTransaction?.type || 'debit')
  const [amount, setAmount] = useState(editingTransaction?.amount?.toString() || '')
  const [category, setCategory] = useState(editingTransaction?.category || 'other')
  const [description, setDescription] = useState(editingTransaction?.description || '')
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
        date,
        tags,
        is_returnable: type === 'debit' && isReturnable,
        counterparty: type === 'debit' && isReturnable ? counterparty : null,
        expected_return_date: type === 'debit' && isReturnable ? expectedReturnDate : null,
        return_status: type === 'debit' && isReturnable ? (editingTransaction.return_status || 'pending') : null,
        notes: notes || null,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // Automatically bulk-categorize every other transaction from the same merchant/vendor
      if (editingTransaction.merchant) {
        const { error: bulkErr } = await supabase
          .from('transactions')
          .update({ category })
          .eq('user_id', user.id)
          .eq('merchant', editingTransaction.merchant)
        
        if (bulkErr) {
          console.error('Failed to bulk-categorize matching transactions:', bulkErr)
        }
      }
    } else {
      const { error } = await createTransaction({
        user_id: user.id,
        type: type as 'debit' | 'credit',
        amount: parsedAmount,
        category,
        description,
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
      setTagsInput('')
      setCategory('other')
      setDate(new Date().toISOString().split('T')[0])
      setIsReturnable(false)
      setCounterparty('')
      setExpectedReturnDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      setNotes('')
    }

    // Learn manual categorization rules based on description / merchant entry
    if (description && category) {
      const cleanDesc = cleanMerchantName(description)
      if (cleanDesc && cleanDesc.length > 2) {
        saveMerchantRule(cleanDesc, category, true)
        saveMerchantRuleToDb(user.id, cleanDesc, category, true).catch(err => {
          console.warn('Failed to sync manual rule to DB:', err)
        })
      }
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
                    className="inline-flex items-center px-2 py-0.5 rounded-lg bg-brand-500/10 border border-brand-500/25 text-[10px] font-semibold text-brand-400"
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
    </Card>
  )
}
