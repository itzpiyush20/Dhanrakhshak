// ============================================
// ExpensesPage — Full expense management
// Add, edit, delete transactions
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/layouts'
import { Button } from '@/components/ui'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ExpenseList from '@/components/expenses/ExpenseList'
import { getTransactions } from '@/services/transactions'
import { formatCurrency, getCurrentMonth } from '@/utils'
import type { Database } from '@/types/database'
import { Card } from '@/components/ui'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

export default function ExpensesPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionRow | null>(null)
  const [currentMonth] = useState(getCurrentMonth())

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    const { data } = await getTransactions({ month: currentMonth })
    setTransactions(data || [])
    setLoading(false)
  }, [currentMonth])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handleEdit = (txn: TransactionRow) => {
    setEditingTransaction(txn)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSaved = () => {
    setShowForm(false)
    setEditingTransaction(null)
    fetchTransactions()
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingTransaction(null)
  }

  // Quick stats
  const totalIncome = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Expenses</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Manage your income and expenses
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              + Add Transaction
            </Button>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Income</p>
            <p className="mt-1 text-xl font-semibold text-emerald-400">{formatCurrency(totalIncome)}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Expenses</p>
            <p className="mt-1 text-xl font-semibold text-red-400">{formatCurrency(totalExpenses)}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Net</p>
            <p className={`mt-1 text-xl font-semibold ${totalIncome - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(totalIncome - totalExpenses)}
            </p>
          </Card>
        </div>

        {/* Form (toggled) */}
        {showForm && (
          <div className="animate-slide-up">
            <ExpenseForm
              editingTransaction={editingTransaction}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </div>
        )}

        {/* Transaction list */}
        <div>
          <h2 className="text-lg font-medium text-white mb-3">
            Transactions
            {!loading && (
              <span className="ml-2 text-sm text-zinc-500">({transactions.length})</span>
            )}
          </h2>
          <ExpenseList
            transactions={transactions}
            loading={loading}
            onEdit={handleEdit}
            onRefresh={fetchTransactions}
          />
        </div>
      </div>
    </AppLayout>
  )
}
