import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { setPageMeta } from '@/utils/seo'
import { useAuth } from '@/context/AuthContext'
import { UserMenu, SiteFooter } from '@/components/ui'

interface MarketingLayoutProps {
  children: ReactNode
  title: string
  /**
   * Search-result and link-preview summary for this page. Optional only so the
   * layout keeps working if a future page forgets it — every current caller
   * passes one, because without it the page inherits index.html's generic
   * description and is indistinguishable from every other route.
   */
  description?: string
}

export default function MarketingLayout({ children, title, description }: MarketingLayoutProps) {
  const { user, openAuthModal } = useAuth()

  useEffect(() => {
    const fullTitle = `${title} | Dhanrakshak`
    if (description) setPageMeta({ title: fullTitle, description })
    else document.title = fullTitle
    window.scrollTo(0, 0)
  }, [title, description])

  return (
    <div className="min-h-screen bg-sb-canvas text-sb-ink-secondary flex flex-col">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
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
              onClick={() => openAuthModal(undefined, 'login')}
              className="text-xs font-semibold text-brand-400 hover:text-brand-500 bg-transparent border-0 cursor-pointer transition-colors px-2 py-2 -my-2"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-4xl mx-auto px-6 py-16 flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <SiteFooter className="py-8 px-4" />
    </div>
  )
}
