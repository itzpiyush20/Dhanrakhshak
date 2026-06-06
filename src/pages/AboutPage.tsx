// ============================================
// AboutPage — founder story + Trust building
// ============================================

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'

export default function AboutPage() {
  useEffect(() => {
    document.title = 'About | Dhanrakshak'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-sb-canvas-soft text-sb-ink-secondary" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-sb-hairline bg-sb-canvas sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline font-bold text-lg">
            <span className="text-lg font-bold" style={{ color: 'var(--sb-primary)' }}>₹</span>
            <span style={{ color: 'var(--sb-ink)', fontWeight: 500 }}>Dhanrakshak</span>
          </Link>
          <Link to={ROUTES.DASHBOARD} className="sb-caption font-medium no-underline" style={{ color: 'var(--sb-primary)' }}>
            ← Back to App
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-[12px] bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)] text-4xl mb-6">
            🛡️
          </div>
          <h1 className="sb-display-xl" style={{ color: 'var(--sb-ink)' }}>
            Built for Financial Clarity
          </h1>
          <p className="sb-body-lg mt-4 max-w-2xl mx-auto" style={{ color: 'var(--sb-ink-muted)' }}>
            Dhanrakshak was born from a simple frustration — most personal finance apps either cost too much, share your data, or require manual effort that nobody actually does.
          </p>
        </div>

        {/* Mission */}
        <div className="sb-card-light bg-sb-canvas rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-t-4 border-t border-sb-primary p-8 mb-12">
          <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Our Mission</h2>
          <p className="sb-body-md mt-3 leading-relaxed" style={{ color: 'var(--sb-ink-secondary)' }}>
            To give every Indian professional the financial intelligence of a personal CFO — without the ₹5,000/hour consulting fees.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-8">
            {[
              { icon: '🧠', title: 'Intelligent', body: 'Automatically tracks and categorizes your spending from bank emails with human-like accuracy.' },
              { icon: '🔒', title: 'Private', body: 'Your data never leaves your control. We read bank alerts, not your inbox. No ads. No selling data.' },
              { icon: '📈', title: 'Actionable', body: 'Turns raw transaction data into insights that help you actually improve your financial behavior.' },
            ].map((item) => (
              <div key={item.title} className="rounded-[6px] bg-sb-canvas-soft border border-sb-hairline p-5">
                <div className="text-3xl mb-3">{item.icon}</div>
                <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>{item.title}</p>
                <p className="sb-micro mt-2 leading-relaxed" style={{ color: 'var(--sb-ink-muted)' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The Problem */}
        <section className="mb-12 space-y-6">
          <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Why Dhanrakshak Exists</h2>
          <div className="space-y-4">
            {[
              { q: 'Existing apps require too much manual input', a: 'Most people abandon expense trackers within 2 weeks because manually entering every transaction is tedious. Dhanrakshak automates this via Gmail bank alerts — the most reliable financial data source you already have.' },
              { q: 'Bank apps show data, not insight', a: 'Your HDFC or ICICI app tells you what happened. Dhanrakshak tells you what it means — whether you are on track, overspending, or wasting money on subscriptions you forgot about.' },
              { q: 'Privacy should not be negotiable', a: 'We built Dhanrakshak on a read-only Gmail connection, with Row Level Security on every database table, and zero advertising business model. Your data is yours.' },
            ].map((item) => (
              <div key={item.q} className="sb-card-light bg-sb-canvas rounded-[12px] border border-sb-hairline p-6">
                <p className="sb-caption font-semibold flex items-start gap-2" style={{ color: 'var(--sb-ink)' }}>
                  <span className="text-sb-primary font-bold shrink-0 mt-0.5">✦</span>
                  {item.q}
                </p>
                <p className="sb-caption leading-relaxed pl-5 mt-2" style={{ color: 'var(--sb-ink-muted)' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Technology */}
        <section className="mb-12 space-y-6">
          <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Technology & Architecture</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: 'Email Intelligence Engine', value: '5-layer AI pipeline with 50+ bank patterns, confidence scoring, and self-learning rules' },
              { label: 'Database', value: 'Supabase (Postgres) with Row Level Security on all tables — your data is physically isolated' },
              { label: 'Authentication', value: 'OAuth 2.0 with Google (Gmail read-only scope) — we never see your password' },
              { label: 'Learning Engine', value: 'Merchant rules that improve from every correction you make — personalized to your spending patterns' },
              { label: 'Frontend', value: 'React 19 + TypeScript — fast, type-safe, and optimized with code splitting' },
              { label: 'Hosting', value: 'Vercel global CDN with HTTPS enforcement, security headers, and HSTS' },
            ].map((item) => (
              <div key={item.label} className="rounded-[6px] bg-sb-canvas-soft border border-sb-hairline p-4">
                <p className="sb-micro font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sb-primary)' }}>{item.label}</p>
                <p className="sb-caption leading-relaxed" style={{ color: 'var(--sb-ink-secondary)' }}>{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Signals */}
        <section className="mb-12 space-y-6">
          <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Our Commitments to You</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              'We never store your banking passwords',
              'We never read personal emails — only bank alerts',
              'We never sell your financial data',
              'We never show you ads based on your spending',
              'You can export all your data anytime',
              'You can delete your account and all data anytime',
              'Row Level Security on every database table',
              'Encrypted backup files only you can decrypt',
            ].map((commitment) => (
              <div key={commitment} className="flex items-center gap-3 rounded-[6px] bg-sb-canvas border border-sb-hairline px-4 py-3 sb-caption font-medium" style={{ color: 'var(--sb-ink-secondary)' }}>
                <span className="text-sb-primary">✓</span> {commitment}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center rounded-[12px] bg-sb-canvas-night border border-[#2e2e2e] p-10 space-y-6">
          <h2 className="sb-heading-lg" style={{ color: 'var(--sb-on-dark)' }}>Start Taking Control of Your Finances</h2>
          <p className="sb-caption leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 480, margin: '0 auto' }}>Connect your Gmail and let Dhanrakshak handle the tracking while you focus on the decisions.</p>
          <Link
            to={ROUTES.DASHBOARD}
            className="sb-btn-primary"
            style={{ padding: '10px 24px' }}
          >
            Open Dashboard →
          </Link>
        </div>
      </main>

      <footer className="border-t border-sb-hairline mt-16 py-8 text-center sb-micro" style={{ color: 'var(--sb-ink-muted)' }}>
        <p>© 2026 Dhanrakshak. Your Personal CFO.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Terms of Service</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>About</Link>
          <Link to="/support" className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Support</Link>
        </div>
      </footer>
    </div>
  )
}
