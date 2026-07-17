// ============================================
// CookieConsent — Essential Cookie Consent Banner
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('dhanrakshak_cookie_consent')
    if (!consent) {
      // Delay showing the banner slightly for better UX
      const timer = setTimeout(() => {
        setVisible(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('dhanrakshak_cookie_consent', 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-modal animate-slide-up">
      <div className="bg-surface-1/95 border border-border-subtle/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">🍪</span>
          <div>
            <h4 className="text-xs font-bold text-white leading-tight">Essential Cookies Only</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              We use only essential cookies required for your session login. We never sell your data or use advertising cookies. 
              By continuing, you agree to our{' '}
              <Link to={ROUTES.PRIVACY} className="text-brand-400 underline hover:text-brand-300">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to={ROUTES.TERMS} className="text-brand-400 underline hover:text-brand-300">
                Terms
              </Link>.
            </p>
          </div>
        </div>
        
        <div className="flex justify-end gap-2.5 shrink-0 border-t border-border-subtle/30 pt-3">
          <Link
            to={ROUTES.PRIVACY}
            className="min-h-11 px-3.5 flex items-center justify-center rounded-xl border border-border-subtle text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-500 cursor-pointer transition-all"
          >
            Learn More
          </Link>
          <button
            onClick={handleAccept}
            className="min-h-11 px-4 flex items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] text-xs font-bold text-[var(--btn-primary-fg)] shadow-[var(--shadow-sm)] cursor-pointer transition-colors hover:bg-[var(--btn-primary-bg-hover)] active:bg-[var(--btn-primary-bg-active)]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
