// ============================================
// QuickAddWidget — log a transaction in one row,
// no modal. Lives at the top of the Dashboard.
// ============================================

import { useState, useRef, type FormEvent } from 'react'
import { Button, Card } from '@/components/ui'
import Select from '@/components/ui/Select'
import { CATEGORIES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'
import { createTransaction } from '@/services/transactions'
import { Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'

const FALLBACK_CATEGORIES = ['food', 'transport', 'shopping', 'utilities']

interface QuickAddWidgetProps {
  /** Category codes to show as one-tap chips, most-used first. */
  topCategories: string[]
  /** Called after a transaction is successfully saved. */
  onAdded: () => void
}

export default function QuickAddWidget({ topCategories, onAdded }: QuickAddWidgetProps) {
  const { user, currencySymbol } = useAuth()
  const { showToast } = useToast()
  const amountRef = useRef<HTMLInputElement>(null)

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [type, setType] = useState<'debit' | 'credit'>('debit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const chips = (topCategories.length > 0 ? topCategories : FALLBACK_CATEGORIES).slice(0, 4)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError('')

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!category) {
      setError('Pick a category')
      return
    }

    setSaving(true)
    const { error: createError } = await createTransaction({
      user_id: user.id,
      type,
      amount: parsedAmount,
      category,
      description: description || CATEGORIES[category as keyof typeof CATEGORIES]?.label || 'Transaction',
      date: new Date().toISOString().split('T')[0],
      source: 'manual',
      approval_status: 'approved',
    })
    setSaving(false)

    if (createError) {
      setError(createError.message)
      return
    }

    showToast('Transaction added')
    setAmount('')
    setDescription('')
    setCategory('')
    setShowMore(false)
    amountRef.current?.focus()
    onAdded()
  }

  return (
    <Card className="shadow-md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary">Quick add</h2>
          <div className="flex items-center rounded-lg border border-border-subtle/50 bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setType('debit')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                type === 'debit'
                  ? 'bg-[var(--status-danger-subtle)] text-[var(--status-danger-text)]'
                  : 'text-zinc-500'
              }`}
            >
              <ArrowDownRight className="h-3 w-3" /> Expense
            </button>
            <button
              type="button"
              onClick={() => setType('credit')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                type === 'credit'
                  ? 'bg-[var(--status-positive-subtle)] text-[var(--status-positive-text)]'
                  : 'text-zinc-500'
              }`}
            >
              <ArrowUpRight className="h-3 w-3" /> Income
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-[var(--status-danger-text)]">{error}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder={`Amount (${currencySymbol})`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
            className="w-full sm:w-40 bg-surface-2 border border-border-subtle/50 text-zinc-200 text-sm rounded-xl px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <input
            type="text"
            placeholder="What was this for? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
            className="flex-1 bg-surface-2 border border-border-subtle/50 text-zinc-200 text-sm rounded-xl px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {chips.map((code) => {
            const cat = CATEGORIES[code as keyof typeof CATEGORIES]
            if (!cat) return null
            return (
              <button
                key={code}
                type="button"
                onClick={() => { setCategory(code); setShowMore(false) }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  category === code
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
                    : 'bg-surface-2 border-border-subtle/50 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              showMore || (category && !chips.includes(category))
                ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
                : 'bg-surface-2 border-border-subtle/50 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            More
          </button>
          <Button type="submit" size="sm" loading={saving} className="ml-auto">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {showMore && (
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Choose a category"
            options={Object.entries(CATEGORIES).map(([value, cat]) => ({
              value,
              label: `${cat.emoji} ${cat.label}`,
            }))}
          />
        )}
      </form>
    </Card>
  )
}
