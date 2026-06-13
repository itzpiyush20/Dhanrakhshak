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
    <div className="min-h-screen bg-[#07070f] text-zinc-300" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-zinc-800 bg-[#07070f]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline font-bold text-lg">
            <span className="text-lg font-bold text-emerald-400">₹</span>
            <span className="text-white font-medium">Dhanrakshak</span>
          </Link>
          <Link to={ROUTES.DASHBOARD} className="text-xs font-medium no-underline text-emerald-400">
            ← Back to App
          </Link>
        </div>
      </header>

      {/* Aurora blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[rgba(62,207,142,0.06)] blur-[120px] animate-aurora-drift" />
        <div className="absolute top-[30%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[rgba(99,102,241,0.07)] blur-[100px] animate-aurora-drift" style={{animationDelay: '4s'}} />
      </div>

      <main className="max-w-4xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-[12px] bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)] text-4xl mb-6">
            🛡️
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight aurora-gradient-text">
            Built for Financial Clarity
          </h1>
          <p className="text-base mt-4 max-w-2xl mx-auto text-zinc-400">
            Dhanrakshak was born from a simple frustration — most personal finance apps either cost too much, share your data, or require manual effort that nobody actually does.
          </p>
        </div>

        {/* Mission */}
        <div className="glass-card rounded-2xl border-t-4 border-emerald-500/40 p-8 mb-12">
          <h2 className="text-xl font-bold text-white">Our Mission</h2>
          <p className="text-sm mt-3 leading-relaxed text-zinc-300">
            To give every Indian professional the financial intelligence of a personal CFO — without the ₹5,000/hour consulting fees.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-8">
            {[
              { icon: '🧠', title: 'Intelligent', body: 'Automatically tracks and categorizes your spending from bank emails with human-like accuracy.' },
              { icon: '🔒', title: 'Private', body: 'Your data never leaves your control. We read bank alerts, not your inbox. No ads. No selling data.' },
              { icon: '📈', title: 'Actionable', body: 'Turns raw transaction data into insights that help you actually improve your financial behavior.' },
            ].map((item) => (
              <div key={item.title} className="glass-card rounded-xl p-5">
                <div className="text-3xl mb-3">{item.icon}</div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs mt-2 leading-relaxed text-zinc-400">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The Problem */}
        <section className="mb-12 space-y-6">
          <h2 className="text-xl font-bold text-white">Why Dhanrakshak Exists</h2>
          <div className="space-y-4">
            {[
              { q: 'Existing apps require too much manual input', a: 'Most people abandon expense trackers within 2 weeks because manually entering every transaction is tedious. Dhanrakshak automates this via Gmail bank alerts — the most reliable financial data source you already have.' },
              { q: 'Bank apps show data, not insight', a: 'Your HDFC or ICICI app tells you what happened. Dhanrakshak tells you what it means — whether you are on track, overspending, or wasting money on subscriptions you forgot about.' },
              { q: 'Privacy should not be negotiable', a: 'We built Dhanrakshak on a read-only Gmail connection, with Row Level Security on every database table, and zero advertising business model. Your data is yours.' },
            ].map((item) => (
              <div key={item.q} className="glass-card rounded-xl p-6">
                <p className="text-sm font-semibold flex items-start gap-2 text-white">
                  <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✦</span>
                  {item.q}
                </p>
                <p className="text-sm leading-relaxed pl-5 mt-2 text-zinc-400">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Technology */}
        <section className="mb-12 space-y-6">
          <h2 className="text-xl font-bold text-white">Technology & Architecture</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: 'Email Intelligence Engine', value: '5-layer AI pipeline with 50+ bank patterns, confidence scoring, and self-learning rules' },
              { label: 'Database', value: 'Supabase (Postgres) with Row Level Security on all tables — your data is physically isolated' },
              { label: 'Authentication', value: 'OAuth 2.0 with Google (Gmail read-only scope) — we never see your password' },
              { label: 'Learning Engine', value: 'Merchant rules that improve from every correction you make — personalized to your spending patterns' },
              { label: 'Frontend', value: 'React 19 + TypeScript — fast, type-safe, and optimized with code splitting' },
              { label: 'Hosting', value: 'Vercel global CDN with HTTPS enforcement, security headers, and HSTS' },
            ].map((item) => (
              <div key={item.label} className="glass-card rounded-xl p-4">
                <p className="text-xs font-bold uppercase tracking-wider mb-1 text-emerald-400">{item.label}</p>
                <p className="text-sm leading-relaxed text-zinc-300">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Signals */}
        <section className="mb-12 space-y-6">
          <h2 className="text-xl font-bold text-white">Our Commitments to You</h2>
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
              <div key={commitment} className="flex items-center gap-3 glass-card rounded-xl px-4 py-3 text-sm font-medium text-zinc-300">
                <span className="text-emerald-400">✓</span> {commitment}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center glass-card aurora-glow-ring rounded-2xl p-10 space-y-6">
          <h2 className="text-xl font-bold text-white">Start Taking Control of Your Finances</h2>
          <p className="text-sm leading-relaxed text-zinc-400" style={{ maxWidth: 480, margin: '0 auto' }}>Connect your Gmail and let Dhanrakshak handle the tracking while you focus on the decisions.</p>
          <Link
            to={ROUTES.DASHBOARD}
            className="sb-btn-primary"
            style={{ padding: '10px 24px' }}
          >
            Open Dashboard →
          </Link>
        </div>
      </main>

      <footer className="border-t border-zinc-800 mt-16 py-8 text-center text-xs text-zinc-500">
        <p>© 2026 Dhanrakshak. Your Personal CFO.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline text-zinc-500">Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline text-zinc-500">Terms of Service</Link>
          <Link to={ROUTES.REFUND} className="no-underline hover:underline text-zinc-500">Refund Policy</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline text-zinc-500">About</Link>
          <Link to="/support" className="no-underline hover:underline text-zinc-500">Support</Link>
        </div>
      </footer>
    </div>
  )
}
