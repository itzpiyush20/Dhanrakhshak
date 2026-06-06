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
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-[9999] animate-slide-up">
      <div className="bg-surface-1/95 border border-border-subtle/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">🍪</span>
          <div>
            <h4 className="text-xs font-bold text-white leading-tight">Essential Cookies Only</h4>
            <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
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
            className="px-3.5 py-1.5 rounded-xl border border-border-subtle text-[10px] font-bold text-zinc-400 hover:text-white hover:border-zinc-500 cursor-pointer transition-all"
          >
            Learn More
          </Link>
          <button
            onClick={handleAccept}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[10px] font-bold text-white shadow-lg border border-brand-400/20 cursor-pointer transition-all hover:scale-105 active:scale-95"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
