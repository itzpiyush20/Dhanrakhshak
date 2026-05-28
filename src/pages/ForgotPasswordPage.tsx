// ============================================
// ForgotPasswordPage — Password reset via email
// ============================================

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '@/layouts/AuthLayout'
import { Button, Input } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await resetPassword(email)

    if (error) {
      setError(error)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Reset link sent"
        subtitle="Check your email for the password reset link"
      >
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <span className="text-3xl">🔑</span>
          </div>
          <p className="text-sm text-zinc-400">
            We've sent a reset link to <span className="text-white font-medium">{email}</span>.
            Follow the instructions to set a new password.
          </p>
          <Link
            to="/login"
            className="inline-block text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors"
          >
            Back to login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter your email to receive a reset link"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Button type="submit" block loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Remember your password?{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
