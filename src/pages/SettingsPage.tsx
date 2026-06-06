// ============================================
// SettingsPage — Application Preferences & Backups
// Manage merchant rules, backups, and localisations
// ============================================

import { useState, useEffect } from 'react'
import { AppLayout } from '@/layouts'
import { Card, Button, Input } from '@/components/ui'
import { 
  getMerchantRules, 
  deleteMerchantRule, 
  saveMerchantRule,
  saveMerchantSetting,
  getTransactions,
  supabase
} from '@/services'
import { encryptText, decryptText } from '@/utils'
import { APP_CONFIG, CATEGORIES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'

export default function SettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Merchant Rules State
  const [merchantRules, setMerchantRules] = useState<Record<string, { category: string; autoApprove: boolean }>>({})
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategory, setNewCategory] = useState('other')
  const [newAutoApprove, setNewAutoApprove] = useState(true)

  // Encryption Backup / Restore States
  const [backupPassword, setBackupPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [backupSuccess, setBackupSuccess] = useState(false)
  const [restoreSuccess, setRestoreSuccess] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  const handlePlainExport = async (format: 'csv' | 'json') => {
    setExportLoading(true)
    try {
      const { data: txns } = await getTransactions()
      if (!txns || txns.length === 0) {
        showToast('No transaction records found to export.', 'warning')
        return
      }

      let content = ''
      let mimeType = ''
      let filename = ''

      if (format === 'csv') {
        const headers = 'ID,Date,Type,Amount,Category,Merchant,Description,Payment Mode,Card Last 4,Issuer,Confidence,Event Type,Source,Status\n'
        const rows = txns.map(t => 
          `"${t.id}","${t.date}","${t.type}",${t.amount},"${t.category}","${(t.merchant || '').replace(/"/g, '""')}","${(t.description || '').replace(/"/g, '""')}","${t.payment_mode || 'unknown'}","${t.card_last4 || ''}","${t.card_issuer || ''}",${t.confidence_score || ''},"${t.event_type || ''}","${t.source}","${t.approval_status}"`
        ).join('\n')
        content = headers + rows
        mimeType = 'text/csv;charset=utf-8;'
        filename = `Dhanrakshak_Transactions_Export_${new Date().toISOString().split('T')[0]}.csv`
      } else {
        content = JSON.stringify(txns, null, 2)
        mimeType = 'application/json;charset=utf-8;'
        filename = `Dhanrakshak_Transactions_Export_${new Date().toISOString().split('T')[0]}.json`
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: any) {
      showToast('Failed to export data: ' + err.message, 'error')
    } finally {
      setExportLoading(false)
    }
  }

  useEffect(() => {
    document.title = 'Settings | Dhanrakshak'
    // Load learned merchant rules
    setMerchantRules(getMerchantRules())
  }, [])

  const handleDeleteRule = (key: string) => {
    deleteMerchantRule(key)
    setMerchantRules(getMerchantRules())
  }

  const handleToggleAutoApprove = (key: string, currentAutoApprove: boolean) => {
    saveMerchantSetting(key, { autoApprove: !currentAutoApprove })
    setMerchantRules(getMerchantRules())
  }

  const handleUpdateRuleCategory = (key: string, category: string) => {
    const currentRule = merchantRules[key]
    const autoApprove = currentRule ? currentRule.autoApprove : true
    saveMerchantRule(key, category, autoApprove)
    setMerchantRules(getMerchantRules())
  }

  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyword.trim()) return
    saveMerchantRule(newKeyword, newCategory, newAutoApprove)
    setNewKeyword('')
    setNewCategory('other')
    setNewAutoApprove(true)
    setMerchantRules(getMerchantRules())
  }

  const handleBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!backupPassword) return
    setBackupLoading(true)
    setBackupSuccess(false)
    try {
      const { data: txns } = await getTransactions()
      if (!txns || txns.length === 0) {
        showToast('No transaction records found to export.', 'warning')
        setBackupLoading(false)
        return
      }

      const jsonStr = JSON.stringify(txns)
      const encrypted = await encryptText(jsonStr, backupPassword)

      const blob = new Blob([encrypted], { type: 'text/plain;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `Dhanrakshak_Encrypted_Backup_${new Date().toISOString().split('T')[0]}.drbak`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      setBackupSuccess(true)
      setBackupPassword('')
    } catch (err: any) {
      showToast('Failed to generate encrypted backup: ' + err.message, 'error')
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault()
    setRestoreError('')
    setRestoreSuccess(false)

    const fileInput = document.getElementById('restore-file-input') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) {
      setRestoreError('Please select a .drbak backup file.')
      return
    }
    if (!restorePassword) {
      setRestoreError('Please enter the decryption password.')
      return
    }

    setRestoreLoading(true)
    try {
      const fileText = await file.text()
      const decrypted = await decryptText(fileText.trim(), restorePassword)
      const parsed = JSON.parse(decrypted)

      if (!Array.isArray(parsed)) {
        throw new Error('Backup format is invalid: expected a list of transactions.')
      }

      const confirmRestore = window.confirm(`Decrypted backup successfully containing ${parsed.length} transactions. Would you like to merge these with your current data? (Only non-duplicate transactions will be added)`)
      if (!confirmRestore) {
        setRestoreLoading(false)
        return
      }

      const { data: currentTxns } = await getTransactions()
      const currentKeys = new Set(currentTxns?.map(t => `${t.date}-${t.amount}-${t.merchant || ''}-${t.description || ''}`))

      const toInsert = parsed.filter((t: any) => {
        const key = `${t.date}-${t.amount}-${t.merchant || ''}-${t.description || ''}`
        return !currentKeys.has(key)
      })

      if (toInsert.length > 0) {
        const cleanTxns = toInsert.map((t: any) => ({
          user_id: user?.id,
          amount: Number(t.amount),
          type: t.type,
          category: t.category,
          description: t.description || '',
          notes: t.notes || null,
          date: t.date,
          source: t.source || 'manual',
          approval_status: t.approval_status || 'approved',
          reference_id: t.reference_id || null,
          merchant: t.merchant || null
        }))

        const { error: insertErr } = await supabase.from('transactions').insert(cleanTxns)
        if (insertErr) throw insertErr
      }

      setRestoreSuccess(true)
      setRestorePassword('')
      if (fileInput) fileInput.value = ''
      showToast(`✅ Merged ${toInsert.length} new transactions from backup!`, 'success')
    } catch (err: any) {
      console.error('Restore error:', err)
      setRestoreError(err.message || 'Decryption failed. Please verify the file and password.')
    } finally {
      setRestoreLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Configuration Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure application rules, dynamic merchant patterns, and encrypted transaction backups.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          {/* Left panel: Smart Merchant Rules */}
          <div className="md:col-span-7 space-y-6">
            {/* Smart Merchant Rules Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">🧠 Smart Merchant Rules</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Rules learned from your manual approvals. Dhanrakshak automatically categorizes subsequent transactions and auto-approves them when confidence is high.
              </p>

              {/* Inline Rule Creator Form */}
              <form onSubmit={handleAddCustomRule} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 p-3 bg-surface-2/40 border border-border-subtle/30 rounded-xl">
                <div>
                  <Input
                    placeholder="Keyword (e.g. Swiggy)"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    className="text-xs py-1.5 h-9"
                    aria-label="Merchant Name Keyword"
                    required
                  />
                </div>
                <div>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    aria-label="Merchant Category"
                    className="w-full bg-surface-2 border border-border-subtle/50 text-xs rounded-xl h-9 px-3 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    {Object.entries(CATEGORIES).map(([key, cat]) => (
                      <option key={key} value={key}>{cat.emoji} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newAutoApprove}
                      onChange={(e) => setNewAutoApprove(e.target.checked)}
                      className="rounded border-zinc-800 bg-surface-2 text-brand-500 focus:ring-brand-500/25 h-3.5 w-3.5"
                    />
                    Auto-Approve
                  </label>
                  <Button size="sm" type="submit" className="py-1 px-3 text-xs h-8">
                    Add Rule
                  </Button>
                </div>
              </form>

              {Object.keys(merchantRules).length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
                  No rules learned yet. Approve pending alerts or add one above!
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {Object.entries(merchantRules).map(([key, rule]) => {
                    return (
                      <div
                        key={key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-border-subtle/30 text-xs transition-colors hover:bg-surface-2 gap-2"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-zinc-200 capitalize truncate max-w-[150px]">{key}</span>
                          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={rule.autoApprove}
                              onChange={() => handleToggleAutoApprove(key, rule.autoApprove)}
                              className="rounded border-zinc-800 bg-surface-2 text-brand-500 focus:ring-brand-500/25 h-3.5 w-3.5"
                            />
                            Auto-Approve Transactions
                          </label>
                        </div>
                        <div className="flex items-center gap-2 justify-between sm:justify-end">
                          <select
                            value={rule.category}
                            onChange={(e) => handleUpdateRuleCategory(key, e.target.value)}
                            className="bg-surface-0 border border-border-subtle/50 text-xs rounded-xl p-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                          >
                            {Object.entries(CATEGORIES).map(([catKey, cat]) => (
                              <option key={catKey} value={catKey}>{cat.emoji} {cat.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleDeleteRule(key)}
                            className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete Rule"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Right panel: backups & localisations */}
          <div className="md:col-span-5 space-y-6">
            {/* Encrypted Backup & Restore Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">🔐 Privacy-First Encrypted Backup</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Securely export or restore your transactions locally. All backups are encrypted client-side using industry-standard **AES-256-GCM** before downloading.
              </p>

              <div className="space-y-6">
                {/* Export Block */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Download Backup</h3>
                  <form onSubmit={handleBackup} className="space-y-3">
                    {backupSuccess && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-400 leading-relaxed animate-fade-in">
                        ✅ Encrypted backup generated and downloaded successfully.
                      </div>
                    )}
                    <Input
                      label="Backup Password"
                      type="password"
                      placeholder="Enter a strong password"
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      required
                    />
                    <Button type="submit" block size="sm" loading={backupLoading} disabled={backupLoading}>
                      📥 Encrypt & Export Backup
                    </Button>
                  </form>
                </div>

                {/* Import Block */}
                <div className="space-y-4 border-t border-border-subtle/30 pt-6">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Restore Backup</h3>
                  <form onSubmit={handleRestore} className="space-y-3">
                    {restoreError && (
                      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-[11px] text-red-400 leading-relaxed">
                        ❌ {restoreError}
                      </div>
                    )}
                    {restoreSuccess && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-400 leading-relaxed animate-fade-in">
                        ✅ Backup successfully decrypted and data merged!
                      </div>
                    )}
                    <div>
                      <label htmlFor="restore-file-input" className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 cursor-pointer">
                        Select Backup File (.drbak)
                      </label>
                      <input
                        id="restore-file-input"
                        type="file"
                        accept=".drbak"
                        className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-surface-2 file:text-zinc-300 hover:file:bg-surface-3 cursor-pointer"
                      />
                    </div>
                    <Input
                      label="Decryption Password"
                      type="password"
                      placeholder="Enter decryption password"
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      required
                    />
                    <Button variant="secondary" type="submit" block loading={restoreLoading} disabled={restoreLoading}>
                      📤 Decrypt & Merge Backup
                    </Button>
                  </form>
                </div>
              </div>
            </Card>

            {/* Plain Export Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">📥 Data Portability (Plain Export)</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Export all your transaction history in standard, human-readable formats for tax filing, spreadsheets, or migrations.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => handlePlainExport('csv')}
                  variant="secondary"
                  className="flex-1 text-xs justify-center gap-1.5 cursor-pointer"
                  disabled={exportLoading}
                >
                  📊 Export CSV
                </Button>
                <Button
                  onClick={() => handlePlainExport('json')}
                  variant="secondary"
                  className="flex-1 text-xs justify-center gap-1.5 cursor-pointer"
                  disabled={exportLoading}
                >
                  ⚙️ Export JSON
                </Button>
              </div>
            </Card>

            {/* General Preferences Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-6">Localization Preferences</h2>
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Local Currency</span>
                  <span className="font-bold text-white">{APP_CONFIG.CURRENCY}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Language Locale</span>
                  <span className="font-bold text-white">{APP_CONFIG.LOCALE}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
