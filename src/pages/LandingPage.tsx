import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context'
import { ROUTES } from '@/constants'
import { Capacitor } from '@capacitor/core'
import { cn } from '@/utils'

function InteractionSimulation() {
  const [step, setStep] = useState(0)
  const [budgetAmount, setBudgetAmount] = useState(4000)

  useEffect(() => {
    let active = true
    const run = () => {
      if (!active) return
      setStep(0); setBudgetAmount(4000)
      setTimeout(() => { if (active) setStep(1) }, 1000)
      setTimeout(() => { if (active) setStep(2) }, 3500)
      setTimeout(() => { if (active) setStep(3) }, 6000)
      setTimeout(() => { if (active) { setStep(4); setBudgetAmount(4250) } }, 8500)
      setTimeout(() => { if (active) run() }, 12500)
    }
    run()
    return () => { active = false }
  }, [])

  const totalBudget = 5000
  const budgetPercent = (budgetAmount / totalBudget) * 100

  return (
    <div className="relative w-full max-w-[480px] rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] backdrop-blur-xl p-6 flex flex-col gap-5 overflow-hidden select-none">
      <style>{`
        @keyframes laser-sweep { 0%{top:0%;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{top:100%;opacity:0} }
        .laser-glow { position:absolute;left:0;right:0;height:3px;background:#3ecf8e;box-shadow:0 0 10px #3ecf8e,0 0 20px #3ecf8e;opacity:0;z-index:10; }
        .laser-glow-active { animation:laser-sweep 2.2s ease-in-out infinite; }
        @keyframes pulse-border { 0%{border-color:rgba(62,207,142,0.3)} 100%{border-color:rgba(62,207,142,1)} }
        .pulse-emerald { animation:pulse-border 1.5s infinite alternate; }
        @keyframes insert-flash { 0%{background-color:rgba(62,207,142,0.3)} 100%{background-color:transparent} }
        .animate-insert { animation:insert-flash 1.5s ease-out; }
      `}</style>

      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-200">Live Parser Engine</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
          {step === 0 ? 'READY' : step === 1 ? 'ALERT_IN' : step === 2 ? 'PARSING' : step === 3 ? 'DB_COMMIT' : 'SYNCED'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">1 · Incoming Bank Alert</span>
        <div className="relative min-h-[76px] bg-white/5 rounded-xl border border-white/10 p-3 overflow-hidden flex flex-col justify-center">
          {step === 2 && <div className="laser-glow laser-glow-active" />}
          {step === 0 ? (
            <div className="text-center text-xs text-zinc-500 font-mono italic">Waiting for transaction alert…</div>
          ) : (
            <div className={cn('flex gap-3 items-start transition-all duration-700', step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2', step === 2 && 'pulse-emerald')}>
              <div className="h-8 w-8 rounded-lg bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.18)] flex items-center justify-center shrink-0 text-brand-400 font-mono text-sm font-bold">₹</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-white">SMS · ICICI Bank</span>
                  <span className="text-[10px] text-zinc-500">Just now</span>
                </div>
                <p className="text-xs text-zinc-300 leading-normal font-mono">UPI debit INR 250.00 at Starbucks. Ref: 290812.</p>
              </div>
            </div>
          )}
          {step >= 3 && (
            <div className="absolute right-2 bottom-2 bg-[rgba(62,207,142,0.1)] text-brand-400 border border-[rgba(62,207,142,0.25)] px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 animate-scale-up">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Parsed Locally ✔
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">2 · Device-Only Log</span>
        <div className="border border-white/10 rounded-xl overflow-hidden bg-white/3">
          <div className="grid grid-cols-4 bg-white/5 border-b border-white/10 px-3 py-2 text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">
            <div>Date</div><div className="col-span-2">Merchant</div><div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-white/8 min-h-[90px]">
            {step >= 3 && (
              <div className="grid grid-cols-4 px-3 py-2 text-xs items-center bg-[rgba(62,207,142,0.08)] animate-insert">
                <div className="text-zinc-400 font-mono text-[10px]">Today</div>
                <div className="col-span-2">
                  <div className="font-semibold text-white">Starbucks</div>
                  <div className="text-[10px] text-brand-400">Food & Dining</div>
                </div>
                <div className="text-right font-bold text-white font-mono text-xs">-₹250</div>
              </div>
            )}
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-zinc-400 font-mono text-[10px]">Yest.</div>
              <div className="col-span-2"><div className="font-medium text-white">Netflix</div><div className="text-[10px] text-zinc-400">Subscription</div></div>
              <div className="text-right text-white font-mono text-xs">-₹649</div>
            </div>
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-zinc-400 font-mono text-[10px]">Jun 4</div>
              <div className="col-span-2"><div className="font-medium text-white">Zomato</div><div className="text-[10px] text-zinc-400">Food & Dining</div></div>
              <div className="text-right text-white font-mono text-xs">-₹320</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">3 · Budget Update</span>
        <div className="border border-white/10 rounded-xl p-4 bg-white/5 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">🍔</span>
              <span className="text-xs font-semibold text-white">Food & Dining</span>
            </div>
            <span className="text-xs font-semibold text-white font-mono">₹{budgetAmount.toLocaleString('en-IN')} <span className="text-zinc-400 font-normal">/ ₹{totalBudget.toLocaleString('en-IN')}</span></span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-out" style={{ width: `${budgetPercent}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-zinc-400">
            <span>{budgetPercent.toFixed(0)}% used</span>
            {step === 4
              ? <span className="text-brand-400 animate-pulse font-mono">+₹250 added just now</span>
              : <span>₹{(totalBudget - budgetAmount).toLocaleString('en-IN')} remaining</span>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { user, loading, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const [downloadTab, setDownloadTab] = useState<'android' | 'ios'>('android')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [mockSms, setMockSms] = useState('Alert: UPI debit of INR 649.00 on ICICI Bank Card XX9008 at NETFLIX is successful. Ref: 98127301.')
  const [parsedResult, setParsedResult] = useState<{ merchant: string; amount: number; bank: string; category: string } | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    if (!loading && Capacitor.isNativePlatform()) {
      if (user) navigate(ROUTES.DASHBOARD || '/dashboard', { replace: true })
      else openAuthModal()
    }
  }, [user, loading, navigate, openAuthModal])

  useEffect(() => {
    document.title = 'Dhanrakshak | Auto-track your expenses. Zero manual entry.'
    window.scrollTo(0, 0)
    // Landing page is always dark
    document.documentElement.classList.remove('light')
  }, [])

  const handleTestParse = () => {
    setParsing(true)
    setTimeout(() => {
      const t = mockSms.toLowerCase()
      let amount = 0, merchant = 'Unknown Merchant', bank = 'Unknown Bank', category = 'Others'
      const m = t.match(/(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i)
      if (m) amount = parseFloat(m[1].replace(/,/g, ''))
      if (t.includes('netflix')) { merchant = 'Netflix'; category = 'Subscriptions 🔄' }
      else if (t.includes('zomato')) { merchant = 'Zomato'; category = 'Food & Dining 🍔' }
      else if (t.includes('starbucks')) { merchant = 'Starbucks Coffee'; category = 'Food & Dining 🍔' }
      else if (t.includes('uber') || t.includes('ola')) { merchant = 'Uber'; category = 'Transport 🚗' }
      else if (t.includes('swiggy')) { merchant = 'Swiggy'; category = 'Food & Dining 🍔' }
      else if (t.includes('amazon')) { merchant = 'Amazon'; category = 'Shopping 🛍️' }
      if (t.includes('icici')) bank = 'ICICI Bank'
      else if (t.includes('sbi') || t.includes('state bank')) bank = 'SBI'
      else if (t.includes('hdfc')) bank = 'HDFC Bank'
      else if (t.includes('axis')) bank = 'Axis Bank'
      setParsedResult({ merchant, amount: amount || 649, bank, category })
      setParsing(false)
    }, 700)
  }

  const features = [
    { icon: '⚡', title: 'Zero manual entry', desc: 'Bank alerts are read and logged automatically. Never type an expense again.' },
    { icon: '🛡️', title: 'Complete privacy', desc: 'All parsing happens on your device. Your data never touches our servers.' },
    { icon: '🏦', title: 'All Indian banks', desc: 'Works with ICICI, HDFC, SBI, Axis, Kotak and every UPI-enabled bank.' },
    { icon: '💰', title: 'Smart budgets', desc: 'Set monthly limits per category. Get alerted before you overspend.' },
    { icon: '📱', title: 'Install like an app', desc: 'Add to your home screen in seconds. No App Store, no APK needed.' },
    { icon: '🔄', title: 'Subscription tracker', desc: 'See all recurring charges in one place. Cancel what you forgot about.' },
  ]

  const steps = [
    { num: '01', title: 'You transact normally', desc: 'Pay via UPI, debit or credit card. Your bank sends a transaction alert SMS or email as usual.' },
    { num: '02', title: 'Detected & parsed locally', desc: 'Our client-side engine reads the alert directly on your device. Merchant, amount, and category extracted instantly.' },
    { num: '03', title: 'Budgets updated live', desc: 'The expense is logged to your dashboard and the relevant budget category is updated automatically.' },
  ]

  const faqItems = [
    { q: 'How does the app automatically detect what I spent?', a: 'When you pay with UPI, debit card, or credit card, your bank sends a transaction alert SMS or email. Dhanrakshak reads these alerts to detect the amount and merchant — so you never have to type anything manually.' },
    { q: 'Can the app see my bank passwords or move money?', a: 'Absolutely not. Dhanrakshak is completely read-only. We never ask for your net-banking credentials, PINs, card numbers, CVV, or OTPs. We cannot touch your money in any way.' },
    { q: 'Do my emails or SMSes leave my phone?', a: 'No. Privacy is our top priority. All scanning happens locally inside your browser or app. Your personal messages are never sent to our servers or shared with anyone.' },
    { q: 'Do I have to connect my email or SMS?', a: 'No — it is entirely optional. You can also paste bank SMS texts manually, import a spreadsheet, or enter expenses by hand. The app works well either way.' },
    { q: 'What happens after the free trial ends?', a: 'During the 14-day free trial you get full access to all features. After that, automatic scanning pauses until you upgrade. Manual entry always remains free.' },
  ]

  return (
    <div className="min-h-screen bg-[#07070f] flex flex-col text-white" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>

      {/* Aurora blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[700px] h-[700px] rounded-full bg-[rgba(62,207,142,0.05)] blur-[140px] animate-aurora-drift" />
        <div className="absolute top-[35%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[rgba(99,102,241,0.06)] blur-[120px] animate-aurora-drift" style={{ animationDelay: '4s' }} />
        <div className="absolute -bottom-[10%] left-[25%] w-[500px] h-[500px] rounded-full bg-[rgba(56,189,248,0.04)] blur-[100px] animate-aurora-drift" style={{ animationDelay: '8s' }} />
      </div>

      {/* ── NAVBAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[rgba(7,7,15,0.82)] backdrop-blur-2xl border-b border-white/8">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group no-underline shrink-0">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-tr from-brand-500 to-emerald-600 flex items-center justify-center text-sm font-black text-[#07070f] shadow-[0_0_16px_rgba(62,207,142,0.45)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">₹</span>
            <span className="text-base font-bold tracking-tight">
              <span className="aurora-gradient-text">Dhan</span><span className="text-white">rakshak</span>
            </span>
            <span className="hidden md:flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />Auto Tracker
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {[
              { label: 'How it works', href: '#how-it-works' },
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '/pricing', link: true },
              { label: 'FAQ', href: '#faq' },
              { label: 'Support', href: '/support', link: true },
            ].map((item) =>
              item.link ? (
                <Link key={item.label} to={item.href!} className="text-sm text-zinc-400 hover:text-white transition-colors no-underline">{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} className="text-sm text-zinc-400 hover:text-white transition-colors no-underline">{item.label}</a>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link to={ROUTES.DASHBOARD} className="px-4 py-2 rounded-xl bg-brand-500 text-[#07070f] text-sm font-semibold hover:bg-brand-400 transition-colors no-underline">Dashboard</Link>
            ) : (
              <>
                <button onClick={() => openAuthModal()} className="text-sm text-zinc-400 hover:text-white transition-colors bg-transparent border-0 cursor-pointer">Sign in</button>
                <button onClick={() => openAuthModal()} className="btn-shimmer px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] text-sm font-bold shadow-[0_4px_18px_rgba(62,207,142,0.28)] hover:shadow-[0_6px_24px_rgba(62,207,142,0.40)] transition-all border-0 cursor-pointer aurora-glow-ring">Get started</button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="pt-24 pb-20 border-b border-white/8 overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs font-semibold text-brand-400">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                100% local parsing · Zero bank access required
              </div>

              <div>
                <h1 className="text-5xl font-bold leading-[1.1] tracking-tight aurora-gradient-text mb-4">
                  Your expenses,<br />tracked automatically.
                </h1>
                <p className="text-lg text-zinc-400 leading-relaxed max-w-md">
                  Dhanrakshak reads your bank alert SMSes and emails, then logs every transaction automatically. No manual entry. No bank login. Your data stays on your device.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {user ? (
                  <Link to={ROUTES.DASHBOARD} className="btn-shimmer inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] text-sm font-bold shadow-[0_4px_20px_rgba(62,207,142,0.30)] hover:shadow-[0_6px_28px_rgba(62,207,142,0.42)] transition-all no-underline">
                    Go to Dashboard →
                  </Link>
                ) : (
                  <button onClick={() => openAuthModal()} className="btn-shimmer inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] text-sm font-bold shadow-[0_4px_20px_rgba(62,207,142,0.30)] hover:shadow-[0_6px_28px_rgba(62,207,142,0.42)] transition-all border-0 cursor-pointer">
                    Start free — no card needed →
                  </button>
                )}
                <a href="#how-it-works" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors no-underline">
                  See how it works
                </a>
              </div>

              <div className="flex gap-10 pt-2 border-t border-white/8">
                {[
                  { val: 'Zero', label: 'manual entries' },
                  { val: '100%', label: 'local parsing', accent: true },
                  { val: 'All', label: 'Indian banks & UPI' },
                ].map((m) => (
                  <div key={m.label}>
                    <p className={cn('text-xl font-bold', m.accent ? 'text-brand-400' : 'text-white')}>{m.val}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <InteractionSimulation />
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────── */}
        <section id="how-it-works" className="py-24 bg-[rgba(255,255,255,0.015)] border-b border-white/8">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-zinc-500 mb-4">How it works</div>
              <h2 className="text-4xl font-bold tracking-tight aurora-gradient-text mb-4">Spend money. We handle the rest.</h2>
              <p className="text-zinc-400 text-lg max-w-lg mx-auto">Three steps, zero effort from your end.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {steps.map((s, i) => (
                <div key={s.num} className="glass-card p-8 relative gradient-border-card group hover:shadow-[0_16px_48px_rgba(0,0,0,0.3)] transition-all duration-300">
                  <div className="text-5xl font-black text-white/8 mb-6 leading-none group-hover:text-white/12 transition-colors">{s.num}</div>
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-brand-500/30 to-transparent z-10" />
                  )}
                  <h3 className="text-lg font-semibold text-white mb-3">{s.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ────────────────────────────────────── */}
        <section id="features" className="py-24 border-b border-white/8">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-zinc-500 mb-4">Features</div>
              <h2 className="text-4xl font-bold tracking-tight text-white mb-4">Smart, simple, and <span className="aurora-gradient-text">100% private.</span></h2>
              <p className="text-zinc-400 text-lg max-w-lg mx-auto">Everything you need to manage your money — without handing over your data.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f) => (
                <div key={f.title} className="glass-card gradient-border-card p-6 group hover:shadow-[0_12px_40px_rgba(0,0,0,0.3),0_0_0_1px_rgba(62,207,142,0.12)] transition-all duration-300">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-xl mb-5 bg-white/5 border border-white/10 group-hover:bg-brand-500/10 group-hover:border-brand-500/20 transition-colors">{f.icon}</div>
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── LIVE PARSER DEMO ────────────────────────────── */}
        <section className="py-24 bg-[rgba(255,255,255,0.015)] border-b border-white/8">
          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-6 pt-4">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-zinc-500">Try it live</div>
              <h2 className="text-4xl font-bold tracking-tight text-white leading-tight">
                Paste any bank SMS.<br /><span className="aurora-gradient-text">Watch it parse.</span>
              </h2>
              <p className="text-zinc-400 leading-relaxed">
                This is exactly how Dhanrakshak works — reading your bank alerts and extracting the merchant, amount, and category automatically. Your real alerts are parsed on-device, never uploaded.
              </p>
              <div className="space-y-3">
                {[
                  'Works with ICICI, HDFC, SBI, Axis, Kotak & more',
                  'Detects UPI, debit card, credit card transactions',
                  'Auto-categorizes into Food, Transport, Shopping etc.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm text-zinc-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card gradient-border-card p-8 space-y-5">
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest block mb-2">Bank alert text</label>
                <textarea
                  value={mockSms}
                  onChange={(e) => { setMockSms(e.target.value); setParsedResult(null) }}
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 transition-all placeholder-zinc-600"
                  placeholder="Paste your bank SMS here…"
                />
              </div>
              <button
                onClick={handleTestParse}
                disabled={parsing || !mockSms.trim()}
                className="btn-shimmer w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] text-sm font-bold shadow-[0_4px_18px_rgba(62,207,142,0.28)] hover:shadow-[0_6px_24px_rgba(62,207,142,0.40)] disabled:opacity-40 disabled:pointer-events-none transition-all border-0 cursor-pointer"
              >
                {parsing ? 'Reading alert…' : 'Auto-detect transaction'}
              </button>

              {parsedResult && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Parse result</span>
                    <span className="text-xs font-semibold text-brand-400 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      Scanned securely
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Merchant', val: parsedResult.merchant },
                      { label: 'Amount', val: `₹${parsedResult.amount.toLocaleString('en-IN')}`, accent: true },
                      { label: 'Bank', val: parsedResult.bank },
                      { label: 'Category', val: parsedResult.category },
                    ].map(({ label, val, accent }) => (
                      <div key={label} className="bg-white/5 rounded-lg p-3">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{label}</p>
                        <p className={cn('text-sm font-semibold', accent ? 'text-brand-400' : 'text-white')}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── TRUST / PRIVACY ─────────────────────────────── */}
        <section className="py-20 border-b border-white/8">
          <div className="mx-auto max-w-6xl px-6">
            <div className="glass-card aurora-glow-ring p-10 md:p-12 rounded-2xl border-t-4 border-t-brand-500 flex flex-col md:flex-row items-center gap-10 justify-between">
              <div className="max-w-lg">
                <h2 className="text-2xl font-bold text-white mb-4">Your money, your data. Always local.</h2>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Dhanrakshak never uploads your bank alerts or emails to any server. The entire parser runs inside your browser. We cannot see, store, or sell your financial data — because we never receive it.
                </p>
              </div>
              <div className="flex gap-12 shrink-0">
                {[
                  { val: '0', label: 'Cloud uploads', sub: 'Device-only parsing' },
                  { val: '256-bit', label: 'SSL encryption', sub: 'Bank-grade security' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-4xl font-black text-brand-400">{s.val}</p>
                    <p className="text-sm font-semibold text-white mt-2">{s.label}</p>
                    <p className="text-xs text-zinc-500 mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── INSTALL GUIDE ───────────────────────────────── */}
        <section id="install-guide" className="py-24 bg-[rgba(255,255,255,0.015)] border-b border-white/8">
          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-zinc-500">Install</div>
              <h2 className="text-4xl font-bold text-white leading-tight">
                On your phone<br />in <span className="aurora-gradient-text">60 seconds.</span>
              </h2>
              <p className="text-zinc-400 leading-relaxed">
                Dhanrakshak is a Progressive Web App. No App Store, no APK, no Play Store approvals. Just open the website and install it to your home screen.
              </p>
              <div className="space-y-3">
                {[
                  { icon: '⚡', text: 'No App Store or APK needed' },
                  { icon: '🔒', text: 'Safe, lightweight, and offline-capable' },
                  { icon: '🔔', text: 'Enable notifications for instant spend alerts' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm shrink-0">{item.icon}</div>
                    <p className="text-sm text-zinc-300 font-medium">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card gradient-border-card overflow-hidden" style={{ padding: 0 }}>
              <div className="flex bg-white/5 border-b border-white/10">
                {(['android', 'ios'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDownloadTab(tab)}
                    className={cn(
                      'flex-1 py-4 text-sm transition-all cursor-pointer border-none bg-transparent font-medium',
                      downloadTab === tab
                        ? 'text-brand-400 border-b-2 border-brand-400'
                        : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
                    )}
                  >
                    {tab === 'android' ? '🤖 Android' : '🍎 iPhone'}
                  </button>
                ))}
              </div>
              <div className="p-8">
                {downloadTab === 'android' ? (
                  <ol className="space-y-4">
                    {[
                      'Open Google Chrome on your Android device.',
                      'Tap the three-dot menu icon in the top-right corner.',
                      'Select "Add to Home screen" or "Install App".',
                      'Confirm — the app icon appears on your home screen.',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="h-5 w-5 rounded-full bg-brand-500/15 border border-brand-500/25 text-brand-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-zinc-300 leading-relaxed">{step}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="space-y-4">
                    {[
                      'Open Safari on your iPhone or iPad.',
                      'Tap the Share button (square with arrow pointing up).',
                      'Scroll down the share sheet and tap "Add to Home Screen".',
                      'Tap Add in the top right — done.',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="h-5 w-5 rounded-full bg-brand-500/15 border border-brand-500/25 text-brand-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-zinc-300 leading-relaxed">{step}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="py-24 border-b border-white/8">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-zinc-500 mb-4">FAQ</div>
              <h2 className="text-4xl font-bold text-white">Questions people ask</h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, idx) => {
                const isOpen = expandedFaq === idx
                return (
                  <div key={idx} className="glass-card overflow-hidden" style={{ padding: 0 }}>
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full text-left px-6 py-5 flex items-center justify-between cursor-pointer border-none bg-transparent"
                    >
                      <span className="text-base font-semibold text-white pr-4">{item.q}</span>
                      <span className={cn('text-brand-400 text-xl shrink-0 transition-transform duration-200', isOpen && 'rotate-45')}>＋</span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 pt-0 border-t border-white/8 pt-4 animate-fade-in">
                        <p className="text-sm text-zinc-400 leading-relaxed">{item.a}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────── */}
        <section className="py-28 text-center aurora-bg border-b border-white/8">
          <div className="mx-auto max-w-2xl px-6 space-y-6">
            <h2 className="text-5xl font-bold tracking-tight aurora-gradient-text">
              Take control of<br />your finances today.
            </h2>
            <p className="text-lg text-zinc-400 max-w-md mx-auto leading-relaxed">
              Free account. 14-day full trial. No credit card required. Delete your data anytime.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              {user ? (
                <Link to={ROUTES.DASHBOARD} className="btn-shimmer inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] font-bold shadow-[0_6px_28px_rgba(62,207,142,0.35)] hover:shadow-[0_8px_36px_rgba(62,207,142,0.48)] transition-all no-underline">
                  Go to Dashboard →
                </Link>
              ) : (
                <button onClick={() => openAuthModal()} className="btn-shimmer inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-[#07070f] font-bold shadow-[0_6px_28px_rgba(62,207,142,0.35)] hover:shadow-[0_8px_36px_rgba(62,207,142,0.48)] transition-all border-0 cursor-pointer">
                  Start free — no card needed →
                </button>
              )}
              <Link to={ROUTES.PRICING} className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors no-underline">
                View pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="py-14 bg-[#050510] border-t border-white/8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-tr from-brand-500 to-emerald-600 flex items-center justify-center text-xs font-black text-[#07070f]">₹</span>
              <span className="text-sm font-bold"><span className="aurora-gradient-text">Dhan</span><span className="text-white">rakshak</span></span>
            </div>
            <p className="text-xs text-zinc-500">© 2026 Dhanrakshak. Built with privacy by design.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { label: 'Pricing', to: '/pricing' },
              { label: 'Privacy', to: ROUTES.PRIVACY },
              { label: 'Terms', to: ROUTES.TERMS },
              { label: 'About', to: ROUTES.ABOUT },
              { label: 'Support', to: '/support' },
            ].map((l) => (
              <Link key={l.label} to={l.to} className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors no-underline">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
