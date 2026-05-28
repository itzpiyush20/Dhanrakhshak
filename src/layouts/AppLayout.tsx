// ============================================
// AppLayout — Main application shell
// Sidebar navigation + content area
// Will be used to wrap all authenticated pages
// ============================================

import type { ReactNode } from 'react'
import { APP_CONFIG } from '@/constants'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-surface-0 text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/10">
              <span className="text-sm font-bold text-surface-0">₹</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              {APP_CONFIG.APP_NAME}
            </span>
          </div>

          {/* Nav links — placeholder for now */}
          <nav className="hidden items-center gap-1 md:flex">
            {['Dashboard', 'Expenses', 'Analytics', 'Budgets'].map((item) => (
              <button
                key={item}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-surface-2 hover:text-white"
              >
                {item}
              </button>
            ))}
          </nav>

          {/* User avatar placeholder */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-surface-2 ring-2 ring-border-default" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  )
}
