// ============================================
// AuthModal — In-context Authentication Popup
// Handles both Login and Signup processes without page redirects
// ============================================

import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context'
import { Button, Input } from '@/components/ui'

export default function AuthModal() {
  const {
    authModalOpen,
    authModalRedirect,
    authModalTab,
    closeAuthModal,
    signIn,
    signUp,
    signInWithGoogle,
    currencySymbol,
  } = useAuth()

  const { showToast } = useToast()
  const navigate = useNavigate()

  const [isSignUp, setIsSignUp] = useState(authModalTab === 'signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Keep switcher tab in sync when the modal is opened
  useEffect(() => {
    if (authModalOpen) {
      setIsSignUp(authModalTab === 'signup')
    }
  }, [authModalOpen, authModalTab])

  if (!authModalOpen) return null

  const handleRedirect = () => {
    closeAuthModal()
    if (authModalRedirect) {
      navigate(authModalRedirect)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isSignUp) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        setLoading(false)
        return
      }
      const { error: signUpErr } = await signUp(email, password, fullName)
      if (signUpErr) {
        setError(signUpErr)
        setLoading(false)
      } else {
        showToast('✉️ Verification email sent! Please check your inbox.', 'success')
        closeAuthModal()
        setLoading(false)
      }
    } else {
      const { error: signInErr } = await signIn(email, password)
      if (signInErr) {
        setError(signInErr)
        setLoading(false)
      } else {
        showToast('👋 Welcome back!', 'success')
        handleRedirect()
        setLoading(false)
      }
    }
  }

  const handleGoogleAuth = async () => {
    const destination = authModalRedirect || '/dashboard'
    const { error: oAuthErr } = await signInWithGoogle(destination)
    if (oAuthErr) {
      setError(oAuthErr)
    } else {
      closeAuthModal()
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={closeAuthModal}
    >
      <div 
        className="relative w-full max-w-md bg-surface-1 border border-border-subtle rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up text-zinc-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white p-1.5 rounded-xl hover:bg-surface-2 border-0 bg-transparent transition-colors cursor-pointer text-lg leading-none"
          aria-label="Close authentication modal"
        >
          ✕
        </button>

        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-emerald-600 text-white shadow-[0_3px_12px_-3px_rgba(16,185,129,0.45)] border-0" aria-hidden="true">
            <span className="text-xl font-bold">{currencySymbol || '₹'}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-1 flex items-center justify-center gap-1 select-none">
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Dhan</span>
            <span>rakshak</span>
          </h1>
          <p className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase text-center">
            Automated Spend Tracker
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-surface-2 rounded-xl p-1 mb-5 border border-border-subtle/50">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError('') }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border-0 cursor-pointer transition-all ${
              !isSignUp 
                ? 'bg-surface-1 text-white shadow-md border border-border-subtle/30' 
                : 'bg-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError('') }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border-0 cursor-pointer transition-all ${
              isSignUp 
                ? 'bg-surface-1 text-white shadow-md border border-border-subtle/30' 
                : 'bg-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {isSignUp && (
            <Input
              label="Full Name"
              placeholder="Rahul Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {!isSignUp && (
            <div className="flex justify-end !mt-1">
              <Link
                to="/forgot-password"
                onClick={closeAuthModal}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <Button type="submit" block loading={loading} className="w-full py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white transition-all">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle/50" />
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-border-subtle/50" />
        </div>

        {/* Google OAuth */}
        <Button
          type="button"
          variant="secondary"
          block
          onClick={handleGoogleAuth}
          className="flex items-center justify-center gap-2.5 text-xs font-semibold !h-11 shadow-sm"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        <p className="mt-5 text-center text-[10px] text-zinc-500 font-medium">
          🔒 Secure read-only access · 100% Private local processing
        </p>
      </div>
    </div>
  )
}
