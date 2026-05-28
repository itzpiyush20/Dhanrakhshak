// ============================================
// SettingsPage — User Settings & Sandbox Purge Zone
// Manage profile, security reset, and database wipeout
// ============================================

import { useState, useEffect } from 'react'
import { AppLayout } from '@/layouts'
import { Card, Button, Input, Badge } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getProfile, updateProfile, resetAccountData } from '@/services/profiles'
import { APP_CONFIG } from '@/constants'

export default function SettingsPage() {
  const { user, resetPassword } = useAuth()
  
  // Profile Form States
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Password reset States
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Reset Account Data States
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load fresh profile details
    getProfile().then(({ data }) => {
      if (data) {
        setFullName(data.full_name || '')
        setAvatarUrl(data.avatar_url || '')
      }
    })
  }, [])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileSuccess(false)
    setError(null)

    try {
      const { error } = await updateProfile({
        fullName,
        avatarUrl,
      })
      if (error) throw error
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error saving profile:', err)
      setError(err.message || 'Failed to update profile settings.')
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email) return

    setPasswordLoading(true)
    setPasswordSuccess(false)
    setError(null)

    try {
      const { error } = await resetPassword(user.email)
      if (error) throw error
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 5000)
    } catch (err: any) {
      console.error('Error resetting password:', err)
      setError(err.message || 'Failed to trigger password reset.')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleWipeData = async () => {
    const doubleConfirm = confirm(
      '⚠️ WARNING: Are you absolutely sure you want to permanently delete all transactions, budgets, and scanning logs?\n\nThis action cannot be undone.'
    )
    if (!doubleConfirm) return

    setResetLoading(true)
    setResetSuccess(false)
    setError(null)

    try {
      const error = await resetAccountData()
      if (error) throw error

      setResetSuccess(true)
      setTimeout(() => setResetSuccess(false), 4000)
    } catch (err: any) {
      console.error('Error wiping sandbox data:', err)
      setError(err.message || 'Failed to clear sandbox account databases.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Configuration Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure your personal finance profile, security reset pipelines, and sandbox logs.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-12">
          {/* Left panel: Profiles & app setup */}
          <div className="md:col-span-7 space-y-6">
            {/* Profile Settings Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-6">Security Profile</h2>
              
              <form onSubmit={handleProfileSave} className="space-y-5">
                <div className="flex items-center gap-4">
                  {/* Mock preview avatar circle */}
                  <div className="h-14 w-14 rounded-full bg-surface-2 ring-2 ring-brand-500/50 flex items-center justify-center text-zinc-300 text-lg font-bold shrink-0 overflow-hidden shadow-md">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      fullName.substring(0, 1).toUpperCase() || 'U'
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Avatar Image</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Previews instantly on URL match</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <Input value={user?.email || ''} disabled />
                  <p className="text-[10px] text-zinc-600 mt-1">Unique login email identifier (disabled)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Full Display Name
                  </label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    disabled={profileLoading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Avatar Image URL
                  </label>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="e.g. https://images.unsplash.com/photo-..."
                    disabled={profileLoading}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  {profileSuccess ? (
                    <Badge variant="success">✔️ Changes updated successfully</Badge>
                  ) : (
                    <div />
                  )}
                  <Button type="submit" loading={profileLoading} disabled={profileLoading}>
                    Save Security Profile
                  </Button>
                </div>
              </form>
            </Card>

            {/* General Preferences Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-6">Localization Preferences</h2>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Local Currency
                    </label>
                    <Input value={APP_CONFIG.CURRENCY} disabled />
                    <p className="text-[10px] text-zinc-600 mt-1">Default local currency setting (disabled)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Language Locale
                    </label>
                    <Input value={APP_CONFIG.LOCALE} disabled />
                    <p className="text-[10px] text-zinc-600 mt-1">Date & numbers representation (disabled)</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right panel: security reset & danger zones */}
          <div className="md:col-span-5 space-y-6">
            {/* Security Reset Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-4">Security Reset</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Trigger a secure password reset link. We will send guidelines directly to <strong className="text-zinc-200">{user?.email}</strong>.
              </p>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                {passwordSuccess && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400 leading-relaxed">
                    📧 Reset link transmitted! Check your inbox (including spam) for verification actions.
                  </div>
                )}
                <Button variant="secondary" type="submit" block loading={passwordLoading} disabled={passwordLoading}>
                  🔑 Reset My Password
                </Button>
              </form>
            </Card>

            {/* Danger sandbox wipe zone */}
            <Card className="border-red-500/30 bg-red-500/[0.02]">
              <h2 className="text-base font-bold text-red-400 mb-2">Danger Sandbox Zone</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Cleanly purge all manual transaction entries, custom budget targets, and email scan records associated with this credentials log. This is an irreversible sandbox action!
              </p>

              <div className="space-y-4">
                {resetSuccess && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400 leading-relaxed">
                    ✨ Wipe complete! All databases flushed successfully. Refreshing dashboard...
                  </div>
                )}
                <Button
                  variant="danger"
                  block
                  onClick={handleWipeData}
                  loading={resetLoading}
                  disabled={resetLoading}
                >
                  ⚠️ Reset Sandbox Data
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
