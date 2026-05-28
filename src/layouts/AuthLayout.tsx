// ============================================
// AuthLayout — Centered layout for auth pages
// Clean, minimal, premium feel
// ============================================

import type { ReactNode } from 'react'
import { APP_CONFIG } from '@/constants'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-4">
      {/* Subtle gradient glow behind the card */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-xl shadow-brand-500/20">
            <span className="text-2xl font-bold text-surface-0">₹</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-zinc-400 text-center">{subtitle}</p>
          )}
        </div>

        {/* Auth form card */}
        <div className="rounded-2xl border border-border-subtle bg-surface-1 p-6 sm:p-8 shadow-2xl shadow-black/20">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-600">
          {APP_CONFIG.APP_NAME} · {APP_CONFIG.APP_TAGLINE}
        </p>
      </div>
    </div>
  )
}
