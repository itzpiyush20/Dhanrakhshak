// ============================================
// AppLayout — Main application shell
// Sidebar navigation + content area
// Will be used to wrap all authenticated pages
// ============================================

import type { ReactNode } from 'react'
import { APP_CONFIG } from '../constants'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/10">
              <span className="text-sm font-bold text-zinc-950">₹</span>
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
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white"
              >
                {item}
              </button>
            ))}
          </nav>

          {/* User avatar placeholder */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-800 ring-2 ring-zinc-700" />
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
