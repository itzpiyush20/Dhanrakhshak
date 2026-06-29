import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { UserMenu } from '@/components/ui'

interface MarketingLayoutProps {
  children: ReactNode
  title: string
}

export default function MarketingLayout({ children, title }: MarketingLayoutProps) {
  const { user, openAuthModal } = useAuth()

  useEffect(() => {
    document.title = `${title} | Dhanrakshak`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div className="min-h-screen bg-sb-canvas text-sb-ink-secondary flex flex-col">
      {/* Header */}
      <header className="border-b border-sb-hairline bg-sb-canvas/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline font-bold text-lg select-none">
            <span className="text-lg font-bold text-brand-400">₹</span>
            <span className="text-sb-ink font-medium">Dhanrakshak</span>
          </Link>
          {user ? (
            <UserMenu />
          ) : (
            <button 
              onClick={() => openAuthModal()} 
              className="text-xs font-semibold text-brand-400 hover:text-brand-500 bg-transparent border-0 cursor-pointer transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-sb-hairline bg-sb-canvas-soft py-8 text-center text-xs text-sb-ink-muted shrink-0">
        <p>© 2026 Dhanrakshak. Your Personal CFO.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline text-sb-ink-muted">Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline text-sb-ink-muted">Terms of Service</Link>
          <Link to={ROUTES.REFUND} className="no-underline hover:underline text-sb-ink-muted">Refund Policy</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline text-sb-ink-muted">About</Link>
          <Link to="/support" className="no-underline hover:underline text-sb-ink-muted">Support</Link>
        </div>
      </footer>
    </div>
  )
}
