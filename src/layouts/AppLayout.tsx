// ============================================
// AppLayout — Main application shell
// Sticky nav with working links
// ============================================

import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { APP_CONFIG, ROUTES } from '@/constants'
import { cn } from '@/utils'
import { useState } from 'react'
import { useAuth } from '@/context'

interface AppLayoutProps {
  children: ReactNode
}

const navItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD },
  { label: 'Expenses', path: ROUTES.EXPENSES },
  { label: 'Budgets', path: ROUTES.BUDGETS },
  { label: 'Pending Alerts', path: ROUTES.PENDING },
  { label: 'Analytics', path: ROUTES.ANALYTICS },
]

export default function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface-0 text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/10">
              <span className="text-sm font-bold text-surface-0">₹</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              {APP_CONFIG.APP_NAME}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-surface-2 text-white'
                      : 'text-zinc-400 hover:bg-surface-2 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Mobile menu button */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-surface-2 hover:text-white md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* User avatar / profile button (desktop) */}
          <Link
            to="/settings"
            className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border-subtle hover:bg-surface-2 transition-colors duration-200"
          >
            <div className="h-7 w-7 rounded-full bg-surface-3 ring-1 ring-border-default flex items-center justify-center text-xs font-bold text-zinc-300 overflow-hidden shadow-inner shrink-0">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                user?.user_metadata?.full_name?.substring(0, 1).toUpperCase() || 'U'
              )}
            </div>
            <span className="text-xs font-semibold text-zinc-300 max-w-[100px] truncate">
              {user?.user_metadata?.full_name || 'Account'}
            </span>
          </Link>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <nav className="border-t border-border-subtle px-4 py-3 space-y-1 md:hidden animate-fade-in">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-surface-2 text-white'
                      : 'text-zinc-400 hover:bg-surface-2 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
            <Link
              to="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors border-t border-border-subtle/30 mt-2 pt-3',
                location.pathname === '/settings'
                  ? 'text-white font-bold'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              ⚙️ Settings & Profile
            </Link>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  )
}
