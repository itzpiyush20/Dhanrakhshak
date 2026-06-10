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
  supabase,
  getMerchantRulesFromDB,
  saveMerchantRuleToDb,
  migrateLocalStorageRulesToDB
} from '@/services'
import { encryptText, decryptText, cn } from '@/utils'
import { CATEGORIES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'

export default function SettingsPage() {
  const { user, currency, setCurrency, activeYear, startNewFinancialYear, dailyScanTime, updateDailyScanTime } = useAuth()
  const { showToast } = useToast()

  const [isLight, setIsLight] = useState(() => {
    try {
      const stored = localStorage.getItem('dhanrakshak_theme')
      return stored !== 'dark'
    } catch (e) {
      return true
    }
  })

  useEffect(() => {
    const handleThemeEvent = () => {
      const stored = localStorage.getItem('dhanrakshak_theme')
      setIsLight(stored !== 'dark')
    }
    window.addEventListener('dhanrakshak_theme_changed', handleThemeEvent)
    return () => {
      window.removeEventListener('dhanrakshak_theme_changed', handleThemeEvent)
    }
  }, [])

  const toggleTheme = () => {
    const newMode = !isLight
    setIsLight(newMode)
    try {
      if (newMode) {
        document.documentElement.classList.add('light')
        localStorage.setItem('dhanrakshak_theme', 'light')
      } else {
        document.documentElement.classList.remove('light')
        localStorage.setItem('dhanrakshak_theme', 'dark')
      }
    } catch (e) {}
    window.dispatchEvent(new Event('dhanrakshak_theme_changed'))
  }

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

  // Change Password States
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')

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

  const loadRules = async () => {
    if (user) {
      try {
        const data = await getMerchantRulesFromDB(user.id)
        if (data && data.length > 0) {
          const dbRules: Record<string, { category: string; autoApprove: boolean }> = {}
          data.forEach(r => {
            dbRules[r.merchant_key] = { category: r.preferred_category, autoApprove: r.auto_approve }
          })
          setMerchantRules(dbRules)
          return
        }
      } catch (err) {
        console.warn('Failed to load rules from DB:', err)
      }
    }
    // Fallback to localStorage
    setMerchantRules(getMerchantRules())
  }

  useEffect(() => {
    document.title = 'Settings | Dhanrakshak'
    if (user) {
      // Migrate and then load
      migrateLocalStorageRulesToDB(user.id).finally(() => {
        loadRules()
      })
    } else {
      loadRules()
    }
  }, [user])

  const handleDeleteRule = async (key: string) => {
    deleteMerchantRule(key)
    if (user) {
      try {
        await supabase.from('merchant_rules').delete().eq('user_id', user.id).eq('merchant_key', key)
      } catch (err) {
        console.error('Failed to delete rule from DB:', err)
      }
    }
    loadRules()
  }

  const handleToggleAutoApprove = async (key: string, currentAutoApprove: boolean) => {
    saveMerchantSetting(key, { autoApprove: !currentAutoApprove })
    if (user) {
      try {
        await supabase.from('merchant_rules').update({
          auto_approve: !currentAutoApprove,
          last_updated: new Date().toISOString()
        }).eq('user_id', user.id).eq('merchant_key', key)
      } catch (err) {
        console.error('Failed to update rule in DB:', err)
      }
    }
    loadRules()
  }

  const handleUpdateRuleCategory = async (key: string, category: string) => {
    const currentRule = merchantRules[key]
    const autoApprove = currentRule ? currentRule.autoApprove : true
    saveMerchantRule(key, category, autoApprove)
    if (user) {
      try {
        await supabase.from('merchant_rules').update({
          preferred_category: category,
          last_updated: new Date().toISOString()
        }).eq('user_id', user.id).eq('merchant_key', key)
      } catch (err) {
        console.error('Failed to update rule category in DB:', err)
      }
    }
    loadRules()
  }

  const handleAddCustomRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyword.trim()) return

    saveMerchantRule(newKeyword, newCategory, newAutoApprove)
    if (user) {
      try {
        await saveMerchantRuleToDb(user.id, newKeyword, newCategory, newAutoApprove)
      } catch (err) {
        console.error('Failed to save rule to DB:', err)
      }
    }

    setNewKeyword('')
    setNewCategory('other')
    setNewAutoApprove(true)
    loadRules()
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangePasswordError('')
    setChangePasswordSuccess(false)

    if (newPassword.length < 6) {
      setChangePasswordError('Password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordError('Passwords do not match.')
      return
    }

    setChangePasswordLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        setChangePasswordError(error.message)
      } else {
        setChangePasswordSuccess(true)
        setNewPassword('')
        setConfirmPassword('')
        showToast('🔑 Password changed successfully!', 'success')
      }
    } catch (err: any) {
      setChangePasswordError(err.message || 'Failed to change password.')
    } finally {
      setChangePasswordLoading(false)
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

            {/* Change Password Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">🔑 Change Account Password</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Update your account password. Passwords must be at least 6 characters.
              </p>
              <form onSubmit={handleChangePassword} className="space-y-3">
                {changePasswordError && (
                  <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-[11px] text-red-400 leading-relaxed">
                    ❌ {changePasswordError}
                  </div>
                )}
                {changePasswordSuccess && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-400 leading-relaxed">
                    ✅ Password updated successfully!
                  </div>
                )}
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={changePasswordLoading}
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={changePasswordLoading}
                />
                <Button type="submit" block loading={changePasswordLoading} disabled={changePasswordLoading}>
                  Update Password
                </Button>
              </form>
            </Card>

            {/* General Preferences Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">🌍 General & Theme Preferences</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Configure your currency formatting, locale structure, and theme color mode.
              </p>
              
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-border-subtle/30 pb-3">
                  <span className="text-zinc-400 font-medium">Local Currency</span>
                  <select
                    value={currency}
                    onChange={(e) => {
                      const val = e.target.value as 'INR' | 'USD'
                      setCurrency(val)
                      showToast(`Currency changed to ${val === 'INR' ? 'Indian Rupee (₹)' : 'US Dollar ($)'}`, 'success')
                    }}
                    aria-label="Localization Currency Preference"
                    className="bg-surface-2 border border-border-subtle/50 text-xs rounded-xl h-9 px-3 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer font-semibold"
                  >
                    <option value="INR">🇮🇳 INR (₹)</option>
                    <option value="USD">🇺🇸 USD ($)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between border-b border-border-subtle/30 pb-3 pt-1">
                  <div className="flex flex-col">
                    <span className="text-zinc-400 font-medium">Night Mode</span>
                    <span className="text-[10px] text-zinc-500">Enable dark theme for low-light environments</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-brand-400",
                      isLight ? "bg-zinc-700" : "bg-brand-500"
                    )}
                    role="switch"
                    aria-checked={!isLight}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        isLight ? "translate-x-0" : "translate-x-5"
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-border-subtle/30 pb-3 pt-1">
                  <div className="flex flex-col">
                    <span className="text-zinc-400 font-medium">Daily Scan Schedule</span>
                    <span className="text-[10px] text-zinc-500">Time to automatically scan for transactions daily</span>
                  </div>
                  <input
                    type="time"
                    value={dailyScanTime}
                    onChange={async (e) => {
                      const success = await updateDailyScanTime(e.target.value)
                      if (success) {
                        showToast(`Daily scan time scheduled for ${e.target.value}`, 'success')
                      } else {
                        showToast('Failed to update daily scan time.', 'error')
                      }
                    }}
                    aria-label="Daily Scan Schedule Time"
                    className="bg-surface-2 border border-border-subtle/50 text-xs rounded-xl h-9 px-3 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer font-semibold font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-zinc-400">Language Locale</span>
                  <span className="font-bold text-zinc-300 font-mono">
                    {currency === 'INR' ? 'en-IN' : 'en-US'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Financial Year Management Card */}
            <Card className="border-border-subtle bg-surface-1 shadow-md">
              <h2 className="text-base font-bold text-zinc-200 mb-2">📅 Financial Year Management</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Transactions are scanned and updated within the active financial year. Scans for this year will not update after December 31.
              </p>
              
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-border-subtle/30 pb-3">
                  <span className="text-zinc-400 font-medium">Active Calendar Year</span>
                  <span className="font-bold text-zinc-200 text-sm font-mono">{activeYear}</span>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-col">
                    <span className="text-zinc-400 font-medium">Start New Financial Year</span>
                    <span className="text-[10px] text-zinc-500">Enable scanning for the next calendar year ({activeYear + 1})</span>
                  </div>
                  <Button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to start the ${activeYear + 1} financial year? Scanning for ${activeYear} transactions will stop, and scans for the new year ${activeYear + 1} will begin.`)) {
                        startNewFinancialYear()
                        showToast(`Started ${activeYear + 1} Financial Year!`, 'success')
                      }
                    }}
                    size="sm"
                    className="py-1.5 px-3.5 text-[11px] font-bold cursor-pointer"
                  >
                    Start {activeYear + 1} 🚀
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
