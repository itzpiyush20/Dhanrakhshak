import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context'
import { ROUTES } from '@/constants'
import { Capacitor } from '@capacitor/core'

interface InteractionSimulationProps {}

function InteractionSimulation({}: InteractionSimulationProps) {
  const [step, setStep] = useState(0)
  const [budgetAmount, setBudgetAmount] = useState(4000)

  useEffect(() => {
    let active = true
    
    const runSimulation = () => {
      if (!active) return
      
      // Step 0: Idle/Reset state
      setStep(0)
      setBudgetAmount(4000)
      
      // Step 1: Alert notification slides in (SMS/Email alert)
      setTimeout(() => {
        if (!active) return
        setStep(1)
      }, 1000)

      // Step 2: Scanner laser sweep starts
      setTimeout(() => {
        if (!active) return
        setStep(2)
      }, 3500)

      // Step 3: Parsed details insert into the database table
      setTimeout(() => {
        if (!active) return
        setStep(3)
      }, 6000)

      // Step 4: Budget progress bar updates
      setTimeout(() => {
        if (!active) return
        setStep(4)
        setBudgetAmount(4250)
      }, 8500)

      // Hold before restarting
      setTimeout(() => {
        if (active) {
          runSimulation()
        }
      }, 12500)
    }

    runSimulation()
    
    return () => {
      active = false
    }
  }, [])

  // Budget calculations
  const totalBudget = 5000
  const budgetPercent = (budgetAmount / totalBudget) * 100

  return (
    <div className="relative w-full max-w-[480px] bg-sb-canvas border border-sb-hairline rounded-[6px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)] flex flex-col gap-5 overflow-hidden select-none font-sans">
      <style>{`
        @keyframes laser-sweep {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .laser-glow {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: #3ecf8e;
          box-shadow: 0 0 10px #3ecf8e, 0 0 20px #3ecf8e;
          opacity: 0;
          z-index: 10;
        }
        .laser-glow-active {
          animation: laser-sweep 2.2s ease-in-out infinite;
        }
        .pulse-emerald {
          animation: pulse-border 1.5s infinite alternate;
        }
        @keyframes pulse-border {
          0% { border-color: rgba(62, 207, 142, 0.3); box-shadow: 0 0 4px rgba(62, 207, 142, 0.1); }
          100% { border-color: rgba(62, 207, 142, 1); box-shadow: 0 0 12px rgba(62, 207, 142, 0.2); }
        }
        @keyframes insert-flash {
          0% { background-color: rgba(62, 207, 142, 0.3); }
          100% { background-color: transparent; }
        }
        .animate-insert {
          animation: insert-flash 1.5s ease-out;
        }
      `}</style>

      {/* Title block */}
      <div className="flex items-center justify-between border-b border-sb-hairline-cool pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3ecf8e] animate-pulse" />
          <span className="text-[11px] font-medium tracking-tight uppercase text-sb-ink" style={{ letterSpacing: '-0.2px' }}>
            Live Parser Engine
          </span>
        </div>
        <span className="text-[10px] font-mono text-sb-ink-muted bg-sb-canvas-soft px-1.5 py-0.5 rounded-[4px] border border-sb-hairline">
          STATUS: {step === 0 ? 'READY' : step === 1 ? 'ALERT_INCOMING' : step === 2 ? 'PARSING_LOCAL' : step === 3 ? 'DB_COMMIT' : 'BUDGET_SYNCED'}
        </span>
      </div>

      {/* Phase 1 & 2: Alert Notification SMS / Email Card */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-tight text-sb-ink-muted-2 uppercase">
          1. Incoming Bank Alert
        </span>
        <div className="relative min-h-[76px] bg-sb-canvas-soft rounded-[6px] border border-sb-hairline p-3 overflow-hidden transition-all duration-500 flex flex-col justify-center">
          {/* Laser line overlay during parsing */}
          {step === 2 && (
            <div className="laser-glow laser-glow-active" />
          )}

          {step === 0 ? (
            <div className="text-center text-xs text-sb-ink-muted font-mono italic">
              Waiting for incoming transaction...
            </div>
          ) : (
            <div 
              className={`transition-all duration-700 ease-out flex gap-3 items-start ${
                step === 1 ? 'translate-y-0 opacity-100' : ''
              } ${
                step === 2 ? 'pulse-emerald border-sb-primary' : ''
              }`}
              style={{
                transform: step >= 1 ? 'translateY(0)' : 'translateY(-20px)',
                opacity: step >= 1 ? 1 : 0,
              }}
            >
              <div className="h-8 w-8 rounded-[6px] bg-[rgba(62,207,142,0.06)] border border-[rgba(62,207,142,0.15)] flex items-center justify-center shrink-0 text-sb-primary font-mono text-sm font-bold">
                ₹
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-sb-ink">SMS Notification (ICICI Bank)</span>
                  <span className="text-[10px] text-sb-ink-muted">Just now</span>
                </div>
                <p className="text-xs text-sb-ink-secondary leading-normal font-mono">
                  UPI debit of INR 250.00 at Starbucks Coffee successful. Ref: 290812.
                </p>
              </div>
            </div>
          )}

          {/* Secure badge */}
          {step >= 3 && (
            <div className="absolute right-2 bottom-2 bg-[rgba(62,207,142,0.1)] text-sb-primary-deep border border-[rgba(62,207,142,0.25)] px-2 py-0.5 rounded-[4px] text-[9px] font-medium tracking-tight flex items-center gap-1 animate-scale-up">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Parsed Locally (100% Secure)
            </div>
          )}
        </div>
      </div>

      {/* Phase 3: Transaction Logs Table */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-tight text-sb-ink-muted-2 uppercase">
          2. Dhanrakshak Client Log Database (device-only)
        </span>
        <div className="border border-sb-hairline rounded-[6px] overflow-hidden bg-sb-canvas">
          <div className="grid grid-cols-4 bg-sb-canvas-soft border-b border-sb-hairline px-3 py-2 text-[10px] font-medium text-sb-ink-muted tracking-tight">
            <div>DATE</div>
            <div className="col-span-2">MERCHANT & CATEGORY</div>
            <div className="text-right">AMOUNT</div>
          </div>
          <div className="divide-y divide-sb-hairline-cool min-h-[110px]">
            {/* Row 1: The animated row */}
            {step >= 3 ? (
              <div className="grid grid-cols-4 px-3 py-2 text-xs items-center transition-all duration-500 ease-out overflow-hidden bg-[rgba(62,207,142,0.1)] border-b border-sb-hairline animate-insert">
                <div className="text-sb-ink-muted-2 font-mono">Today</div>
                <div className="col-span-2 min-w-0">
                  <div className="font-semibold text-sb-ink truncate">Starbucks Coffee</div>
                  <div className="text-[10px] text-sb-primary font-medium tracking-tight">Food & Dining 🍔</div>
                </div>
                <div className="text-right font-bold text-sb-ink font-mono">-₹250.00</div>
              </div>
            ) : null}

            {/* Static Row A */}
            <div className="grid grid-cols-4 px-3 py-2 text-xs bg-sb-canvas items-center">
              <div className="text-sb-ink-muted font-mono">Yesterday</div>
              <div className="col-span-2 min-w-0">
                <div className="font-medium text-sb-ink truncate">Netflix India</div>
                <div className="text-[10px] text-sb-ink-muted-2 tracking-tight">Subscriptions 🔄</div>
              </div>
              <div className="text-right font-semibold text-sb-ink font-mono">-₹649.00</div>
            </div>

            {/* Static Row B */}
            <div className="grid grid-cols-4 px-3 py-2 text-xs bg-sb-canvas items-center">
              <div className="text-sb-ink-muted font-mono">Jun 04</div>
              <div className="col-span-2 min-w-0">
                <div className="font-medium text-sb-ink truncate">Zomato Delivery</div>
                <div className="text-[10px] text-sb-ink-muted-2 tracking-tight">Food & Dining 🍔</div>
              </div>
              <div className="text-right font-semibold text-sb-ink font-mono">-₹649.00</div>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 4: Budget Progress */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-tight text-sb-ink-muted-2 uppercase">
          3. Monthly Budgets Update
        </span>
        <div className="border border-sb-hairline rounded-[6px] p-3.5 bg-sb-canvas-soft flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🍔</span>
              <span className="text-xs font-semibold text-sb-ink">Food & Dining</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-sb-ink font-mono">
                ₹{budgetAmount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-sb-ink-muted font-mono"> / ₹{totalBudget.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Progress bar wrapper */}
          <div className="h-2 w-full bg-[var(--sb-hairline)] rounded-[6px] overflow-hidden">
            <div 
              className="h-full rounded-[6px] bg-[#3ecf8e] transition-all duration-1000 ease-out"
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-sb-ink-muted font-medium">
            <span>{budgetPercent.toFixed(0)}% Used</span>
            {step === 4 ? (
              <span className="text-sb-primary animate-pulse font-mono">+₹250 added just now</span>
            ) : (
              <span>₹{(totalBudget - budgetAmount).toLocaleString('en-IN')} remaining</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [downloadTab, setDownloadTab] = useState<'android' | 'ios'>('android')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  // Minimal Parser Demo State
  const [mockEmail, setMockEmail] = useState(
    'Alert: UPI debit of INR 649.00 on ICICI Bank Card XX9008 at NETFLIX is successful. Ref: 98127301.'
  )
  const [parsedResult, setParsedResult] = useState<{
    merchant: string; amount: number; bank: string; category: string; status: string
  } | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    if (!loading && Capacitor.isNativePlatform()) {
      if (user) navigate(ROUTES.DASHBOARD || '/dashboard', { replace: true })
      else navigate(ROUTES.LOGIN || '/login', { replace: true })
    }
  }, [user, loading, navigate])

  useEffect(() => {
    document.title = 'Dhanrakshak | Automatically Track Spends & Budgets'
    window.scrollTo(0, 0)
  }, [])

  const handleTestParse = () => {
    setParsing(true)
    setTimeout(() => {
      const text = mockEmail.toLowerCase()
      let amount = 0, merchant = 'Unknown Merchant', bank = 'Unknown Bank', category = 'Others'
      const amtMatch = text.match(/(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i)
      if (amtMatch) amount = parseFloat(amtMatch[1].replace(/,/g, ''))
      if (text.includes('netflix'))  { merchant = 'Netflix'; category = 'Subscriptions 🔄' }
      else if (text.includes('zomato')) { merchant = 'Zomato'; category = 'Food & Dining 🍔' }
      else if (text.includes('starbucks') || text.includes('coffee')) { merchant = 'Starbucks'; category = 'Food & Dining 🍔' }
      else if (text.includes('uber') || text.includes('ola')) { merchant = 'Uber'; category = 'Transport 🚗' }
      if (text.includes('icici')) bank = 'ICICI Bank'
      else if (text.includes('sbi') || text.includes('state bank')) bank = 'SBI'
      else if (text.includes('hdfc')) bank = 'HDFC Bank'
      setParsedResult({ merchant, amount: amount || 649, bank, category, status: 'Scanned Securely ✔' })
      setParsing(false)
    }, 600)
  }

  const faqItems = [
    { q: 'How does the app automatically know what I spent?', a: 'Whenever you pay with UPI, debit card, or credit card, your bank sends an email confirmation. If you choose to link your email account, Dhanrakshak scans your inbox specifically for these bank transaction alert emails to list your spends. It reads the amount and merchant automatically so you do not have to type anything.' },
    { q: 'Can the app see my bank passwords or take money from my account?', a: 'Absolutely not. Dhanrakshak is completely read-only. We never ask for your passwords, net-banking PINs, card numbers, CVV, or OTPs. We cannot touch your money, move funds, or make payments. Your money remains 100% secure in your bank.' },
    { q: 'Do my private emails leave my phone or device?', a: 'No. Privacy is our top priority. The scanning of bank alerts happens locally inside your browser or app. Your personal emails are never sent to our servers or shared with anyone else.' },
    { q: 'Do I have to connect my email to use the app?', a: 'No, it is entirely optional. You can type in your spends manually, copy-paste bank SMS texts, or import them from a spreadsheet. The app works great either way.' },
    { q: 'What happens after the 14-day free trial ends?', a: 'During the 14-day trial, you get full access to all features including automatic email tracking. Once the trial ends, automatic email scanning is paused, but you can upgrade to a premium plan to keep it going.' },
  ]

  return (
    <div className="min-h-screen bg-sb-canvas flex flex-col" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>

      {/* ── NAV (Supabaze style, white canvas bar) ───────────────── */}
      <header className="sticky top-0 z-50 bg-sb-canvas border-b border-sb-hairline">
        <nav className="mx-auto max-w-[1280px] px-6 h-[64px] flex items-center justify-between" aria-label="Primary">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-lg font-bold" style={{ color: 'var(--sb-primary)' }}>₹</span>
            <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--sb-ink)', letterSpacing: '-0.3px' }}>Dhanrakshak</span>
          </Link>

          {/* Center links */}
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Daily Life', href: '#daily-utility' },
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '/pricing', isLink: true },
              { label: 'Download', href: '#download' },
              { label: 'FAQ', href: '#faq' },
              { label: 'Support', href: '/support', isLink: true },
            ].map((item) =>
              item.isLink ? (
                <Link key={item.label} to={item.href!} className="sb-caption font-medium" style={{ color: 'var(--sb-ink-muted)', textDecoration: 'none' }}>{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} className="sb-caption font-medium" style={{ color: 'var(--sb-ink-muted)', textDecoration: 'none' }}>{item.label}</a>
              )
            )}
          </div>

          {/* Right CTAs */}
          <div className="flex items-center gap-4">
            {user ? (
              <Link to={ROUTES.DASHBOARD} className="sb-btn-primary rounded-[6px]">Dashboard</Link>
            ) : (
              <>
                <Link to={ROUTES.LOGIN} className="sb-caption font-medium" style={{ color: 'var(--sb-ink-muted)', textDecoration: 'none' }}>Sign in</Link>
                <Link to={ROUTES.SIGNUP} className="sb-btn-primary rounded-[6px]">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main-content">

        {/* ── BAND 1: HERO (pure white canvas with product UI stacked panes) ─── */}
        <section className="py-24 bg-sb-canvas border-b border-sb-hairline-cool overflow-hidden">
          <div className="mx-auto max-w-[1280px] px-6 grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-1.5 bg-[#e6fbf3] text-[#16a34a] border border-[#a7f3d0] px-3 py-1 rounded-[6px] text-xs font-semibold tracking-tight">
                <span>🔒</span> 100% Local Scanning · Zero Bank Passwords Required
              </div>

              <h1 className="sb-display-xl tracking-tight text-sb-ink" style={{ letterSpacing: '-1.5px', lineHeight: '1.15' }}>
                Auto-track your spends.<br />
                <span className="text-[#24b47e]">Zero manual typing.</span>
              </h1>

              <p className="sb-body-md max-w-[500px]" style={{ color: 'var(--sb-ink-muted)', lineHeight: '1.6' }}>
                Dhanrakshak reads secure, read-only transaction alert SMS and emails and compiles your expenses automatically. Designed for developers and privacy-focused spenders, the entire parsing engine runs <strong className="font-medium" style={{ color: 'var(--sb-ink)' }}>locally on your device</strong>. Your private financial data never hits our servers.
              </p>

              {/* Quick How It Works Steps for 5-Second Comprehension */}
              <div className="space-y-3 pt-2 border-t border-sb-hairline-cool">
                <p className="text-xs font-bold uppercase tracking-wider text-sb-ink-muted-2">How it works in 5 seconds:</p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex gap-3 items-start">
                    <div className="h-5 w-5 rounded-[6px] bg-[rgba(62,207,142,0.1)] text-[#24b47e] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <p className="sb-caption leading-normal" style={{ color: 'var(--sb-ink-muted)' }}>
                      <strong className="font-medium" style={{ color: 'var(--sb-ink)' }}>Make a transaction:</strong> Spend via any UPI app, credit card, or bank card as usual.
                    </p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="h-5 w-5 rounded-[6px] bg-[rgba(62,207,142,0.1)] text-[#24b47e] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <p className="sb-caption leading-normal" style={{ color: 'var(--sb-ink-muted)' }}>
                      <strong className="font-medium" style={{ color: 'var(--sb-ink)' }}>Local detection:</strong> Our client-side parser scans the bank notification alert instantly.
                    </p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="h-5 w-5 rounded-[6px] bg-[rgba(62,207,142,0.1)] text-[#24b47e] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <p className="sb-caption leading-normal" style={{ color: 'var(--sb-ink-muted)' }}>
                      <strong className="font-medium" style={{ color: 'var(--sb-ink)' }}>Live budget update:</strong> Dhanrakshak logs the spend and updates category budgets automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-sb-hairline-cool">
                <Link to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP} className="sb-btn-primary rounded-[6px]" style={{ padding: '12px 24px', fontWeight: 500 }}>
                  {user ? 'Go to Dashboard' : 'Start free — no card needed'}
                </Link>
                <a href="#download" className="sb-btn-secondary rounded-[6px]" style={{ padding: '12px 24px', fontWeight: 500 }}>
                  Download App
                </a>
              </div>

              {/* Mini metrics */}
              <div className="flex gap-8 pt-4 border-t border-sb-hairline-cool">
                {[
                  { val: 'Zero', label: 'Manual entries' },
                  { val: '100%', label: 'Local-only parsing', accent: true },
                  { val: 'All', label: 'Indian Banks & UPI' },
                ].map((m) => (
                  <div key={m.label}>
                    <p className="sb-caption font-bold text-base" style={{ color: m.accent ? 'var(--sb-primary)' : 'var(--sb-ink)' }}>{m.val}</p>
                    <p className="sb-micro" style={{ color: 'var(--sb-ink-muted-2)', marginTop: 2 }}>{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: live interactive simulation */}
            <div className="flex items-center justify-center lg:justify-end">
              <InteractionSimulation />
            </div>
          </div>
        </section>

        {/* ── BAND 2: DAILY LIFE (canvas-soft warm paper floor) ─────────────────── */}
        <section id="daily-utility" className="py-24 bg-sb-canvas-soft">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="text-center mb-16">
              <div className="sb-pill-tag-soft mb-4">Rhythm of tracking</div>
              <h2 className="sb-display-lg" style={{ color: 'var(--sb-ink)' }}>A day in your spend routine</h2>
              <p className="sb-body-lg mt-4 mx-auto" style={{ color: 'var(--sb-ink-muted)', maxWidth: 520 }}>
                See how Dhanrakshak helps you keep track of your money automatically as you go about your day.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { time: '08:30 AM', emoji: '☕', title: 'Morning Tea or Coffee', body: 'You buy a tea or coffee on your way to work. Your bank sends you an alert email. Dhanrakshak automatically reads the expense and logs it for you. You do not have to type a single thing.' },
                { time: '01:15 PM', emoji: '🍔', title: 'Smart Budget Guard', body: 'You treat yourself to lunch. Dhanrakshak updates your monthly lunch budget immediately. If you are close to your spending limit, the app gently flags it to keep you on track.' },
                { time: '10:00 PM', emoji: '📊', title: 'Simple Daily Summary', body: 'Open the app before bed to view a beautiful, easy-to-understand breakdown of what you spent today and how much you saved. Complete clarity without the stress of manual accounts.' },
              ].map((card) => (
                <div key={card.title} className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-200 bg-sb-canvas">
                  <div className="flex items-center justify-between mb-6">
                    <span className="sb-micro px-2 py-1 rounded-full bg-[rgba(62,207,142,0.1)] text-[#24b47e] font-semibold">{card.time}</span>
                    <span className="text-2xl">{card.emoji}</span>
                  </div>
                  <h3 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>{card.title}</h3>
                  <p className="sb-caption mt-3 leading-relaxed" style={{ color: 'var(--sb-ink-muted)' }}>{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BAND 3: FEATURES (white canvas) ─── */}
        <section id="features" className="py-24 bg-sb-canvas border-b border-sb-hairline-cool">
          <div className="mx-auto max-w-[1280px] px-6 grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div className="space-y-8">
              <div>
                <div className="sb-pill-tag-soft mb-4">Product design</div>
                <h2 className="sb-display-lg" style={{ color: 'var(--sb-ink)' }}>Smart, simple, and 100% private.</h2>
                <p className="sb-body-lg mt-4" style={{ color: 'var(--sb-ink-muted)' }}>
                  Keeping track of your hard-earned money should not feel like a chore. Dhanrakshak does the heavy lifting while keeping your information strictly confidential.
                </p>
              </div>

              <div className="space-y-6">
                {[
                  { emoji: '🚀', title: 'Easy Automatic Tracking', body: 'We automatically read expense alerts from your inbox. You never have to manually enter a single tea, grocery, or dining bill again.' },
                  { emoji: '🛡️', title: 'Complete Safety', body: 'We never ask for your bank login IDs, passwords, PINs, or credit card numbers. Your emails are parsed directly on your device.' },
                  { emoji: '📱', title: 'Install on Any Phone', body: 'Download the lightweight app for your Android phone or add it directly to your iPhone home screen in seconds.' },
                ].map((f) => (
                  <div key={f.title} className="flex gap-4">
                    <div className="h-10 w-10 rounded-[6px] flex items-center justify-center text-lg shrink-0 bg-sb-canvas-soft border border-sb-hairline">{f.emoji}</div>
                    <div>
                      <h3 className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>{f.title}</h3>
                      <p className="sb-caption mt-1" style={{ color: 'var(--sb-ink-muted)' }}>{f.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Try the parser */}
            <div className="sb-card-light shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-sb-hairline bg-sb-canvas">
              <h3 className="sb-heading-md flex items-center gap-2" style={{ color: 'var(--sb-ink)' }}>
                <span>⚡</span> Try the Auto-Detector
              </h3>
              <p className="sb-caption mt-2" style={{ color: 'var(--sb-ink-muted)' }}>
                Paste any transaction message below and see how our engine parses details in real-time:
              </p>

              <div className="space-y-4 mt-6">
                <textarea
                  value={mockEmail}
                  onChange={(e) => setMockEmail(e.target.value)}
                  className="sb-text-input resize-none h-[85px] font-mono text-xs"
                  placeholder="Enter transaction text..."
                />
                <button
                  onClick={handleTestParse}
                  disabled={parsing || !mockEmail.trim()}
                  className="sb-btn-primary w-full text-center"
                  style={{ opacity: parsing || !mockEmail.trim() ? 0.5 : 1 }}
                >
                  {parsing ? 'Reading alert text…' : 'Auto-Read Transaction'}
                </button>

                {parsedResult && (
                  <div className="sb-code-block mt-4 border border-[#2e2e2e]">
                    <div className="flex justify-between items-center text-xs pb-2 border-b border-[#2e2e2e] text-static-zinc-500 mb-3">
                      <span>Parser scan result</span>
                      <span className="text-sb-primary font-bold">{parsedResult.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs leading-normal">
                      <div><p className="text-static-zinc-500">Merchant:</p><p className="font-semibold text-static-white">{parsedResult.merchant}</p></div>
                      <div><p className="text-static-zinc-500">Amount:</p><p className="font-bold text-sb-primary">₹{parsedResult.amount.toLocaleString('en-IN')}</p></div>
                      <div><p className="text-static-zinc-500">Bank Source:</p><p className="font-semibold text-static-white">{parsedResult.bank}</p></div>
                      <div><p className="text-static-zinc-500">Spend Category:</p><p className="font-semibold text-static-white">{parsedResult.category}</p></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 3b: SUPABAZE TRUST / LOCAL SECURITY CARD ──────────────────────────── */}
        <section className="py-20 bg-sb-canvas-soft border-b border-sb-hairline-cool">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="sb-card-light bg-sb-canvas rounded-[12px] p-8 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border-t-4 border-t border-sb-primary flex flex-col md:flex-row items-center justify-between gap-10">
              <div className="max-w-lg">
                <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Your money, your data. Always local. Always yours.</h2>
                <p className="sb-caption mt-4 leading-relaxed" style={{ color: 'var(--sb-ink-muted)' }}>
                  Dhanrakshak never uploads your emails to any servers. The transaction scanner parses your local bank alerts directly on your device, ensuring total privacy.
                </p>
              </div>
              <div className="flex gap-12 shrink-0">
                {[
                  { val: '0', label: 'Cloud uploads', sub: 'Completely local parsing' },
                  { val: '256-bit', label: 'Request security', sub: 'SSL bank-grade safety' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="sb-code font-bold text-4xl" style={{ color: 'var(--sb-ink)' }}>{s.val}</p>
                    <p className="sb-caption font-semibold mt-2" style={{ color: 'var(--sb-ink)' }}>{s.label}</p>
                    <p className="sb-micro text-static-zinc-500" style={{ marginTop: 2 }}>{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 4: DOWNLOAD (canvas-soft) ───────────────────── */}
        <section id="download" className="py-24 bg-sb-canvas-soft border-b border-sb-hairline-cool">
          <div className="mx-auto max-w-[1280px] px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="sb-pill-tag-soft">Get the app</div>
              <h2 className="sb-display-lg" style={{ color: 'var(--sb-ink)' }}>Easy setup on mobile</h2>
              <p className="sb-body-lg" style={{ color: 'var(--sb-ink-muted)' }}>
                Dhanrakshak is lightweight and fast. Download the app directly for your Android phone or link it as a web app on your iPhone.
              </p>
              <div className="space-y-3">
                {[
                  { icon: '⚡', text: 'Very small size (~3.2 MB)' },
                  { icon: '🔒', text: '100% safe to install & use' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm bg-sb-canvas border border-sb-hairline shadow-[0_1px_3px_rgba(0,0,0,0.06)]">{item.icon}</div>
                    <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink-secondary)' }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="sb-card-light shadow-[0_8px_24px_rgba(0,0,0,0.08)] bg-sb-canvas" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Tab bar */}
              <div className="flex bg-sb-canvas-soft border-b border-sb-hairline">
                {(['android', 'ios'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDownloadTab(tab)}
                    className="flex-1 py-4 sb-caption cursor-pointer transition-colors border-none bg-transparent"
                    style={{
                      color: downloadTab === tab ? 'var(--sb-primary)' : 'var(--sb-ink-muted)',
                      borderBottom: downloadTab === tab ? '2px solid var(--sb-primary)' : '2px solid transparent',
                      fontWeight: downloadTab === tab ? 600 : 400,
                    }}
                  >
                    {tab === 'android' ? '🤖 Android App' : '🍎 iPhone / iOS'}
                  </button>
                ))}
              </div>

              <div className="p-8 bg-sb-canvas">
                {downloadTab === 'android' ? (
                  <div className="space-y-6">
                    <div className="rounded-[6px] p-4 flex items-center justify-between flex-wrap gap-4 bg-sb-canvas-soft border border-sb-hairline">
                      <div>
                        <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>Android APK File</p>
                        <p className="sb-micro mt-0.5" style={{ color: 'var(--sb-ink-muted)' }}>Version 1.0.4 · Official package</p>
                      </div>
                      <a href="/dhanrakshak.apk" download className="sb-btn-primary">📥 Download APK</a>
                    </div>
                    <div className="space-y-2">
                      <p className="sb-micro font-semibold" style={{ color: 'var(--sb-ink-muted)' }}>Installation steps</p>
                      <ol className="space-y-1.5 sb-caption pl-4 list-decimal" style={{ color: 'var(--sb-ink-muted)' }}>
                        <li>Tap the download button above.</li>
                        <li>Open the downloaded <code className="bg-sb-canvas-soft border border-sb-hairline text-sb-primary font-mono text-xs px-1.5 py-0.5 rounded">.apk</code> file.</li>
                        <li>If prompted, approve permission to install packages.</li>
                        <li>Open Dhanrakshak from your home screen and sign in.</li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-[6px] p-4 bg-sb-canvas-soft border border-sb-hairline">
                      <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>iPhone Web App Setup</p>
                      <p className="sb-micro mt-1" style={{ color: 'var(--sb-ink-muted)' }}>Launches full screen from your home screen.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="sb-micro font-semibold" style={{ color: 'var(--sb-ink-muted)' }}>Easy iOS steps</p>
                      <ul className="space-y-1.5 sb-caption pl-4 list-disc" style={{ color: 'var(--sb-ink-muted)' }}>
                        <li>Open Safari and visit this web address.</li>
                        <li>Tap the <strong style={{ color: 'var(--sb-ink)' }}>Share</strong> icon at the bottom.</li>
                        <li>Choose <strong style={{ color: 'var(--sb-ink)' }}>Add to Home Screen</strong>.</li>
                        <li>Name the app and tap <strong style={{ color: 'var(--sb-ink)' }}>Add</strong>.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 5: FAQ (white canvas) ───────────────────────────────── */}
        <section id="faq" className="py-24 bg-sb-canvas border-b border-sb-hairline-cool">
          <div className="mx-auto max-w-[800px] px-6">
            <div className="text-center mb-14">
              <div className="sb-pill-tag-soft mb-4">Questions</div>
              <h2 className="sb-display-lg" style={{ color: 'var(--sb-ink)' }}>Frequently asked questions</h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, idx) => {
                const isOpen = expandedFaq === idx
                return (
                  <div key={idx} className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-sb-canvas" style={{ padding: 0, overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full text-left px-6 py-5 flex items-center justify-between cursor-pointer border-none bg-transparent"
                    >
                      <span className="sb-heading-md font-semibold" style={{ color: 'var(--sb-ink)' }}>{item.q}</span>
                      <span style={{ color: 'var(--sb-primary)', fontSize: 20, transition: 'transform 0.2s', transform: isOpen ? 'rotate(45deg)' : 'none', flexShrink: 0, marginLeft: 16 }}>＋</span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 animate-fade-in border-t border-sb-hairline pt-4">
                        <p className="sb-body-md leading-relaxed" style={{ color: 'var(--sb-ink-muted)' }}>{item.a}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── BAND 6: CTA (deep dark canvas-night) ───────────────── */}
        <section className="py-24 text-center bg-sb-canvas-night border-b border-[#2e2e2e]">
          <div className="mx-auto max-w-[600px] px-6 space-y-6">
            <h2 className="sb-display-lg" style={{ color: 'var(--sb-on-dark)' }}>Ready to automate your savings?</h2>
            <p className="sb-body-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Create a free account in less than 60 seconds. You can delete or export your records anytime.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP} className="sb-btn-primary" style={{ padding: '10px 24px' }}>
                {user ? 'Go to Dashboard' : 'Get started free'}
              </Link>
              <Link to={ROUTES.PRICING} className="sb-btn-on-dark" style={{ padding: '10px 24px' }}>
                View pricing
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER (Supabaze style, white footer) ─────────── */}
      <footer style={{ background: 'var(--sb-canvas-soft)', borderTop: '1px solid var(--sb-hairline)' }} className="py-16">
        <div className="mx-auto max-w-[1280px] px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--sb-primary)' }}>₹</span>
              <span className="sb-body-md font-semibold" style={{ color: 'var(--sb-ink)' }}>Dhanrakshak</span>
            </div>
            <p className="sb-caption" style={{ color: 'var(--sb-ink-muted)' }}>© 2026 Dhanrakshak. Built with privacy by design.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { label: 'Pricing', to: '/pricing' },
              { label: 'Privacy Policy', to: ROUTES.PRIVACY },
              { label: 'Terms of Service', to: ROUTES.TERMS },
              { label: 'About', to: ROUTES.ABOUT },
              { label: 'Support', to: '/support' },
            ].map((l) => (
              <Link key={l.label} to={l.to} className="sb-caption font-medium" style={{ color: 'var(--sb-ink-muted)', textDecoration: 'none' }}>{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
