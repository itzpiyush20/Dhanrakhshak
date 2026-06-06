// ============================================
// AuthLayout — Centered layout for auth pages
// Clean, minimal, premium feel
// ============================================

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_CONFIG } from '@/constants'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-0 px-4" role="main">
      {/* Subtle gradient glow behind the card */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo & Brand Header */}
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-xl shadow-brand-500/20 transition-transform duration-300 hover:scale-105">
            <span className="text-2xl font-bold text-surface-0" aria-hidden="true">₹</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1 flex items-center justify-center gap-1 select-none">
            <span className="bg-gradient-to-r from-brand-300 to-emerald-400 bg-clip-text text-transparent">Dhan</span>
            <span>rakshak</span>
          </h1>
          <p className="text-xs font-semibold tracking-wider text-brand-400 uppercase mb-4 text-center">
            {APP_CONFIG.APP_TAGLINE}
          </p>

          {/* Premium Benefits Panel */}
          <div className="w-full bg-surface-1/45 border border-border-subtle/60 rounded-2xl p-4 backdrop-blur-md shadow-lg flex flex-col items-center gap-3">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Core Benefits
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-info-subtle)] border border-[var(--status-info-border)] px-3 py-1 text-xs font-bold text-[var(--status-info-text)] shadow-sm transition-all duration-200 hover:opacity-90 hover:scale-102">
                ⚡ Gmail Sync
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-xs font-bold text-brand-400 shadow-sm transition-all duration-200 hover:bg-brand-500/20 hover:scale-102">
                🧠 Auto-Categorize
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] px-3 py-1 text-xs font-bold text-[var(--status-positive-text)] shadow-sm transition-all duration-200 hover:opacity-90 hover:scale-102">
                🛡️ Budget Shield
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 text-center leading-relaxed max-w-[320px]">
              Automatic secure email scanning, AI-powered category mapping, and instant budget alerts.
            </p>
          </div>
        </div>

        {/* Auth form card */}
        <div className="rounded-2xl border border-border-subtle bg-surface-1 p-6 sm:p-8 shadow-2xl shadow-black/20">
          <div className="mb-5 text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
            )}
          </div>
          {children}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-zinc-500 space-y-1.5 font-medium">
          <p>
            {APP_CONFIG.APP_NAME} · {APP_CONFIG.APP_TAGLINE}
          </p>
          <p>
            <Link to="/support" className="text-zinc-400 hover:text-brand-400 underline underline-offset-2 transition-colors">
              Privacy Policy & Support Center
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
