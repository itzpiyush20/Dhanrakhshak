// ============================================
// ProfilePage — Security Profile & Danger Zones
// Manage profile, security reset, and account deletion
// ============================================

import { useState, useEffect } from 'react'
import { AppLayout } from '@/layouts'
import { Card, Button, Input, Badge, ConfirmDialog } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'
import {
  getProfile,
  updateProfile,
  resetAccountData,
  seedSandboxData,
  deleteAccount
} from '@/services'

export default function ProfilePage() {
  const { user, resetPassword, signOut, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const [confirmWipeOpen, setConfirmWipeOpen] = useState(false)

  // Profile Form States
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Password reset States
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Sandbox Seeding States
  const [seedLoading, setSeedLoading] = useState(false)
  const [seedSuccess, setSeedSuccess] = useState(false)

  // Reset Account Data States
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Delete Account States
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    document.title = 'Security Profile | Dhanrakshak'
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
      await refreshProfile()
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

  const handleSeedData = async () => {
    setSeedLoading(true)
    setSeedSuccess(false)
    setError(null)
    try {
      const { error } = await seedSandboxData()
      if (error) throw error
      setSeedSuccess(true)
      setTimeout(() => setSeedSuccess(false), 4000)
    } catch (err: any) {
      console.error('Error seeding demo data:', err)
      setError(err.message || 'Failed to populate account with demo data.')
    } finally {
      setSeedLoading(false)
    }
  }

  const handleWipeData = async () => {
    setResetLoading(true)
    setResetSuccess(false)
    setError(null)

    try {
      const error = await resetAccountData()
      if (error) throw error

      setResetSuccess(true)
      setTimeout(() => setResetSuccess(false), 4000)
    } catch (err: any) {
      console.error('Error wiping user data:', err)
      setError(err.message || 'Failed to clear account databases.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deleteConfirmEmail !== user?.email) return

    setDeleteLoading(true)
    setError(null)

    try {
      const { success, error: deleteErr, method } = await deleteAccount()
      if (!success) {
        throw deleteErr || new Error('An error occurred during account deletion.')
      }

      showToast(
        deleteErr
          ? 'Account data wiped. You are being signed out.'
          : method === 'rpc'
            ? 'Your account and all data have been deleted. Thank you for using Dhanrakshak.'
            : 'Account data deleted. You have been signed out.',
        'success'
      )

      // Give the toast a moment to be seen before signOut redirects away.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await signOut()
    } catch (err: any) {
      console.error('Error deleting account:', err)
      setError(err.message || 'Failed to execute account deletion.')
      setDeleteLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Security Profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure your personal finance identity, account credentials, and platform security.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 text-sm text-[var(--status-danger-text)]">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-12">
          {/* Left panel: Profile details */}
          <div className="md:col-span-7 space-y-6">
            {/* Profile Settings Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-6">Profile Settings</h2>
              
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
                  <p className="text-xs text-zinc-400 mt-1">Unique login email identifier (disabled)</p>
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
                    Save Profile Changes
                  </Button>
                </div>
              </form>
            </Card>

            {/* Security Reset Card */}
            <Card>
              <h2 className="text-base font-bold text-white mb-4">Credential Safety</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Trigger a secure password reset link. We will send guidelines directly to <strong className="text-zinc-200">{user?.email}</strong>.
              </p>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                {passwordSuccess && (
                  <div className="rounded-xl bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] p-3 text-xs text-[var(--status-positive-text)] leading-relaxed">
                    📧 Reset link transmitted! Check your inbox (including spam) for verification actions.
                  </div>
                )}
                <Button variant="secondary" type="submit" block loading={passwordLoading} disabled={passwordLoading}>
                  🔑 Reset My Password
                </Button>
              </form>
            </Card>
          </div>

          {/* Right panel: Demo & Data Reset zones */}
          <div className="md:col-span-5 space-y-6">
            {/* Demo Playground Seed Card */}
            <Card className="border-brand-500/20 bg-brand-500/[0.01]">
              <h2 className="text-base font-bold text-zinc-200 mb-2">Interactive Demo Mode</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Instantly fill your account with sample transactions, MoM charts, category budgets, and pending alerts. Perfect for exploring Dhanrakshak before linking your email.
              </p>

              <div className="space-y-4">
                {seedSuccess && (
                  <div className="rounded-xl bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] p-3 text-xs text-[var(--status-positive-text)] leading-relaxed animate-fade-in">
                    🌱 Success! Sample transactions, category budgets, and tracking logs successfully activated.
                  </div>
                )}
                <Button
                  variant="primary"
                  block
                  onClick={handleSeedData}
                  loading={seedLoading}
                  disabled={seedLoading}
                >
                  🌱 Populate Demo Data
                </Button>
              </div>
            </Card>

            {/* Account Data Reset zone */}
            <Card className="border-[var(--status-danger-border)]/50 bg-[var(--status-danger-subtle)]/10">
              <h2 className="text-base font-bold text-[var(--status-danger-text)] mb-2">Danger Zone: Data Reset</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Permanently delete all your transaction entries, custom budgets, and inbox scan logs from our database. This returns your account to a clean starting state and is irreversible!
              </p>

              <div className="space-y-4">
                {resetSuccess && (
                  <div className="rounded-xl bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] p-3 text-xs text-[var(--status-positive-text)] leading-relaxed">
                    ✨ Wipe complete! All databases flushed successfully. Refreshing dashboard...
                  </div>
                )}
                <Button
                  variant="danger"
                  block
                  onClick={() => setConfirmWipeOpen(true)}
                  loading={resetLoading}
                  disabled={resetLoading}
                >
                  Reset Account Data
                </Button>
              </div>
            </Card>

            {/* Danger Zone: Permanent Deletion */}
            <Card className="border-[var(--status-danger-border)] bg-[var(--status-danger-subtle)]/20 shadow-lg">
              <h2 className="text-base font-bold text-[var(--status-danger-text)] flex items-center gap-1.5 mb-2">
                <span>⚠️</span> Danger Zone: Delete Account
              </h2>
              <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                Permanently deletes your secure auth login credentials, account logs, learned rules, and database allocations. <strong>This action is absolute and irreversible.</strong>
              </p>

              <form onSubmit={handleDeleteAccount} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                    Confirm Deletion by Typing: <span className="text-zinc-300 font-mono lowercase select-all">{user?.email}</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="Type your email to confirm"
                    value={deleteConfirmEmail}
                    onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                    disabled={deleteLoading}
                    required
                    className="border-red-950/60 focus:border-red-500 focus:ring-red-500/20"
                  />
                </div>
                <Button
                  variant="danger"
                  type="submit"
                  block
                  disabled={deleteConfirmEmail !== user?.email || deleteLoading}
                  loading={deleteLoading}
                  className="bg-[var(--status-danger-text)] hover:opacity-90 active:opacity-80 disabled:opacity-40 transition-all duration-200"
                >
                  Permanently Delete My Account
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmWipeOpen}
        onClose={() => setConfirmWipeOpen(false)}
        onConfirm={async () => {
          await handleWipeData()
          setConfirmWipeOpen(false)
        }}
        title="Reset account data"
        message="All transactions, budgets, and scan logs will be permanently deleted. This can't be undone."
        confirmLabel="Reset data"
      />
    </AppLayout>
  )
}
