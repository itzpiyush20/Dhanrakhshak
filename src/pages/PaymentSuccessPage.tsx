import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { Button } from '@/components/ui'
import { useAuth } from '@/context'

export default function PaymentSuccessPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, refreshProfile } = useAuth()
  const [verifying, setVerifying] = useState(true)
  const [attempts, setAttempts] = useState(0)

  const { planName, expiresAt } = location.state || {
    planName: 'Dhanrakshak Premium',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }

  // Poll profile to check if backend/webhook has updated status to active
  useEffect(() => {
    let interval: any

    const checkStatus = async () => {
      await refreshProfile()
      
      if (profile?.subscription_status === 'active') {
        setVerifying(false)
      } else if (attempts > 5) {
        // Stop polling after 5 attempts (10 seconds), let the user click manual refresh
        setVerifying(false)
      } else {
        setAttempts((prev) => prev + 1)
      }
    }

    if (profile?.subscription_status !== 'active') {
      interval = setInterval(checkStatus, 2000)
    } else {
      setVerifying(false)
    }

    return () => clearInterval(interval)
  }, [profile, attempts])

  const formattedDate = new Date(expiresAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <AppLayout>
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-8 animate-scale-up">
        {/* Animated Checkmark Container */}
        <div className="relative flex items-center justify-center mx-auto h-24 w-24 rounded-full bg-emerald-500/10 border border-emerald-500/25 shadow-2xl shadow-emerald-500/10">
          {/* Confetti Micro-animations */}
          <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/5 duration-1000" />
          <span className="text-5xl" aria-hidden="true">👑</span>
        </div>

        {/* Text Details */}
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Subscription Activated!
          </h1>
          <p className="text-zinc-400 text-sm">
            Thank you for upgrading. Your account is now fully unlocked.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex justify-between items-center text-xs pb-3 border-b border-border-subtle/50">
            <span className="text-zinc-500">Selected Plan</span>
            <span className="font-bold text-white">{planName}</span>
          </div>

          <div className="flex justify-between items-center text-xs pb-3 border-b border-border-subtle/50">
            <span className="text-zinc-500">Subscription Status</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              Active
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Renewal Date</span>
            <span className="font-semibold text-zinc-300">{formattedDate}</span>
          </div>
        </div>

        {/* Verification Status */}
        {verifying ? (
          <div className="flex items-center justify-center gap-2 text-xs text-brand-400 animate-pulse bg-brand-500/5 border border-brand-500/10 py-3 rounded-2xl">
            <svg className="animate-spin h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Verifying subscription status...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={() => navigate('/dashboard')}
              block
              size="lg"
            >
              Go to Dashboard
            </Button>
            
            {profile?.subscription_status !== 'active' && (
              <p className="text-[10px] text-zinc-500 leading-normal">
                Status syncing in background. If your premium access doesn't unlock immediately, click return and refresh the page.
              </p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
