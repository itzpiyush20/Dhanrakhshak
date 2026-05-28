// ============================================
// PendingPage — UPI Transaction Approval Flow
// Auto-scans bank alerts and reviews pending txns
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/layouts'
import { Card, Button, Input, Select, Badge, EmptyState } from '@/components/ui'
import { getTransactions, updateTransaction, deleteTransaction } from '@/services/transactions'
import { getScanLogs, simulateInboxScan } from '@/services/emailScanner'
import { formatCurrency, formatDate } from '@/utils'
import { CATEGORIES } from '@/constants'
import type { Database } from '@/types/database'

type TransactionRow = Database['public']['Tables']['transactions']['Row']
type EmailScanLog = Database['public']['Tables']['email_scan_logs']['Row']

export default function PendingPage() {
  const [pendingTxns, setPendingTxns] = useState<TransactionRow[]>([])
  const [scanLogs, setScanLogs] = useState<EmailScanLog[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanLogsText, setScanLogsText] = useState<string[]>([])
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Local state for inline edits
  const [editingFields, setEditingFields] = useState<
    Record<string, { category: string; description: string }>
  >({})

  const fetchPendingData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [txnsRes, logsRes] = await Promise.all([
        getTransactions({ status: 'pending' }),
        getScanLogs(),
      ])

      if (txnsRes.error) throw txnsRes.error
      if (logsRes.error) throw logsRes.error

      const txns = txnsRes.data || []
      setPendingTxns(txns)
      setScanLogs(logsRes.data || [])

      // Prepopulate editing form states
      const fieldsMap: Record<string, { category: string; description: string }> = {}
      txns.forEach((t) => {
        fieldsMap[t.id] = {
          category: t.category,
          description: t.description || '',
        }
      })
      setEditingFields(fieldsMap)
    } catch (err: any) {
      console.error('Error loading pending transactions:', err)
      setError(err.message || 'Failed to load reviews.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPendingData()
  }, [fetchPendingData])

  const handleFieldChange = (id: string, key: 'category' | 'description', value: string) => {
    setEditingFields((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }))
  }

  const handleApprove = async (id: string) => {
    const fields = editingFields[id]
    if (!fields) return

    setActionLoadingId(id)
    setError(null)
    try {
      const { error } = await updateTransaction(id, {
        category: fields.category,
        description: fields.description,
        approval_status: 'approved',
      })

      if (error) throw error
      await fetchPendingData()
    } catch (err: any) {
      console.error('Error approving transaction:', err)
      setError(err.message || 'Failed to approve transaction.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!confirm('Reject and delete this transaction alert?')) return

    setActionLoadingId(id)
    setError(null)
    try {
      const { error } = await deleteTransaction(id)
      if (error) throw error
      await fetchPendingData()
    } catch (err: any) {
      console.error('Error rejecting transaction:', err)
      setError(err.message || 'Failed to reject transaction.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanLogsText([])
    setError(null)

    // Visual log parsing simulation
    const logs = [
      '🔍 Authenticating securely with bank alert servers...',
      '📥 Checking for unread transactional SMS and emails...',
      '⚡ Found 14 notification payloads.',
      '⚙️ Running UPI regex parser & Merchant identifier...',
      '✅ Extraction completed successfully!'
    ]

    for (let i = 0; i < logs.length; i++) {
      await new Promise((r) => setTimeout(r, 600))
      setScanLogsText((prev) => [...prev, logs[i]])
    }

    try {
      const { data, error } = await simulateInboxScan()
      if (error) throw error

      await fetchPendingData()
    } catch (err: any) {
      console.error('Error simulating scan:', err)
      setError(err.message || 'Scan simulation failed.')
    } finally {
      setScanning(false)
    }
  }

  const pendingCount = pendingTxns.length
  const totalPendingValue = pendingTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Auto-Detected Alerts</h1>
            <p className="mt-1 text-sm text-zinc-400">
              UPI alerts scanned from email notifications. Review, correct category, and approve them.
            </p>
          </div>

          <Button onClick={handleScan} loading={scanning} className="shrink-0 gap-1.5 shadow-md">
            ⚡ Scan Bank Alerts
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Scan Log simulation block */}
        {scanning && (
          <Card className="border-brand-500/30 bg-surface-1 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-500 to-emerald-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-400 animate-ping" />
              UPI Alert Extraction Parser Active
            </h3>
            <div className="font-mono text-xs bg-surface-0/60 rounded-xl p-4 text-brand-300 border border-border-subtle/40 space-y-1.5 min-h-[140px] leading-relaxed shadow-inner">
              {scanLogsText.map((log, idx) => (
                <div key={idx} className="animate-fade-in">
                  {log}
                </div>
              ))}
              <div className="h-4 w-1 bg-brand-400 animate-pulse inline-block" />
            </div>
          </Card>
        )}

        {/* Quick summary stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Pending Alerts
            </p>
            <p className="mt-1.5 text-2xl font-bold text-white">
              {pendingCount}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Awaiting your approval</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Cumulative Value
            </p>
            <p className="mt-1.5 text-2xl font-bold text-brand-400">
              {formatCurrency(totalPendingValue)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Total pending cashflow impact</p>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Extraction Source
            </p>
            <p className="mt-1.5 text-lg font-bold text-white">
              Gmail UPI Alerts (Simulated)
            </p>
            <p className="text-[10px] text-zinc-500 mt-1.5">No login credentials required</p>
          </Card>
        </div>

        {/* Main layout reviews */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left panel: pending reviews */}
          <div className="lg:col-span-8 space-y-5">
            <h2 className="text-lg font-bold text-white mb-2">Review Required</h2>

            {loading ? (
              // Skeletons
              [1, 2].map((i) => (
                <Card key={i} className="h-60 relative overflow-hidden">
                  <div className="skeleton absolute inset-0 opacity-70" />
                </Card>
              ))
            ) : pendingTxns.length === 0 ? (
              <Card>
                <EmptyState
                  icon="🎉"
                  title="All caught up!"
                  description="No pending transactions require review. Use the scanner above to import new alerts."
                />
              </Card>
            ) : (
              pendingTxns.map((txn, idx) => {
                const localFields = editingFields[txn.id] || {
                  category: txn.category,
                  description: txn.description || '',
                }
                const isDebit = txn.type === 'debit'

                return (
                  <Card
                    key={txn.id}
                    className="border-dashed border-zinc-700/60 bg-surface-1/90 group hover:border-zinc-500/80 transition-all flex flex-col gap-4 animate-slide-up"
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    {/* Header line */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">Detected Alert</Badge>
                        <span className="text-[10px] text-zinc-500">{formatDate(txn.date)}</span>
                      </div>
                      <span
                        className={`text-md font-bold ${
                          isDebit ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {isDebit ? '-' : '+'}{formatCurrency(Number(txn.amount))}
                      </span>
                    </div>

                    {/* Dotted codeblock representing raw bank text */}
                    {txn.notes && (
                      <div className="text-xs bg-surface-0/60 border border-border-subtle/30 rounded-xl p-3 text-zinc-400 font-mono italic leading-relaxed relative flex items-start gap-2 select-all shadow-inner">
                        <span className="text-lg select-none shrink-0 leading-none">✉️</span>
                        <span>"{txn.notes}"</span>
                      </div>
                    )}

                    {/* Form controls */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                          Category Classification
                        </label>
                        <Select
                          value={localFields.category}
                          onChange={(e) => handleFieldChange(txn.id, 'category', e.target.value)}
                          disabled={actionLoadingId === txn.id}
                        >
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {cat.emoji} {cat.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                          Edit Label / Description
                        </label>
                        <Input
                          value={localFields.description}
                          onChange={(e) =>
                            handleFieldChange(txn.id, 'description', e.target.value)
                          }
                          placeholder="e.g. Swiggy Lunch"
                          disabled={actionLoadingId === txn.id}
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-subtle/30">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30"
                        onClick={() => handleReject(txn.id)}
                        disabled={actionLoadingId === txn.id}
                      >
                        🗑️ Reject Alert
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(txn.id)}
                        loading={actionLoadingId === txn.id}
                        disabled={actionLoadingId === txn.id}
                      >
                        ✔️ Review & Approve
                      </Button>
                    </div>
                  </Card>
                )
              })
            )}
          </div>

          {/* Right panel: scanner history */}
          <div className="lg:col-span-4 space-y-5">
            <h2 className="text-lg font-bold text-white mb-2">Scan Logs</h2>
            <Card className="min-h-[300px]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                Scan Activity History
              </h3>

              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-12 w-full" />
                  ))}
                </div>
              ) : scanLogs.length === 0 ? (
                <EmptyState
                  icon="📋"
                  title="No logs found"
                  description="Use the Bank Alerts scanner above to start logs."
                />
              ) : (
                <div className="space-y-4">
                  {scanLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border-b border-border-subtle/40 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400 font-semibold">
                          {formatDate(log.scanned_at)}
                        </span>
                        <Badge variant="success">Success</Badge>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Processed {log.emails_processed} alerts • Imported{' '}
                        <span className="text-brand-400 font-medium">{log.transactions_found} UPI txns</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
