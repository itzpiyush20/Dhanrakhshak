import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useSpring, useTransform, useMotionValue, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context'
import { ROUTES } from '@/constants'
import { Capacitor } from '@capacitor/core'
import { cn } from '@/utils'
import { useScrollReveal } from '@/hooks'
import { UserMenu } from '@/components/ui'

// ─────────────────────────────────────────────
// Typewriter hook
// ─────────────────────────────────────────────
function useTypewriter(text: string, speed = 38, startDelay = 400) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          clearInterval(interval)
          setTimeout(() => setDone(true), 800)
        }
      }, speed)
      return () => clearInterval(interval)
    }, startDelay)
    return () => clearTimeout(timeout)
  }, [text, speed, startDelay])
  return { displayed, done }
}

// ─────────────────────────────────────────────
// 3D Tilt card wrapper
// ─────────────────────────────────────────────
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) / (rect.width / 2)
    const dy = (e.clientY - cy) / (rect.height / 2)
    ref.current.style.transform = `perspective(800px) rotateY(${dx * 7}deg) rotateX(${-dy * 7}deg) scale(1.02)`
  }, [])
  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg) scale(1)'
  }, [])
  return (
    <div
      ref={ref}
      className={cn('tilt-card', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// Magnetic CTA button
// ─────────────────────────────────────────────
function MagneticButton({ children, className, onClick }: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useSpring(0, { stiffness: 200, damping: 18 })
  const y = useSpring(0, { stiffness: 200, damping: 18 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
    const maxRadius = 90
    if (dist < maxRadius) {
      x.set((e.clientX - cx) * 0.3)
      y.set((e.clientY - cy) * 0.3)
    }
  }
  const handleMouseLeave = () => { x.set(0); y.set(0) }

  return (
    <motion.button
      ref={ref}
      className={cn('magnetic-btn', className)}
      style={{ x, y }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
    >
      {children}
    </motion.button>
  )
}

// ─────────────────────────────────────────────
// Text scramble counter
// ─────────────────────────────────────────────
function ScrambleText({ value, trigger }: { value: string; trigger: boolean }) {
  const [display, setDisplay] = useState('———')
  const chars = '!<>-_\\/[]{}—=+*^?#abcdefghijklmnopqrstuvwxyz0123456789'
  useEffect(() => {
    if (!trigger) return
    let iteration = 0
    const maxIterations = value.length * 3
    const interval = setInterval(() => {
      setDisplay(
        value.split('').map((char, idx) => {
          if (idx < iteration / 3) return char
          if (char === ' ') return ' '
          return chars[Math.floor(Math.random() * chars.length)]
        }).join('')
      )
      iteration++
      if (iteration > maxIterations) {
        clearInterval(interval)
        setDisplay(value)
      }
    }, 35)
    return () => clearInterval(interval)
  }, [trigger, value])
  return <span className="font-mono">{display}</span>
}

// ─────────────────────────────────────────────
// InteractionSimulation (from original)
// ─────────────────────────────────────────────
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
    <div className="relative w-full max-w-[480px] sb-card-light p-6 flex flex-col gap-5 overflow-hidden select-none">
      <style>{`
        @keyframes laser-sweep { 0%{top:0%;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{top:100%;opacity:0} }
        .laser-glow { position:absolute;left:0;right:0;height:2px;background:var(--sb-primary);opacity:0;z-index:10; }
        .laser-glow-active { animation:laser-sweep 2.2s ease-in-out infinite; }
        @keyframes pulse-border { 0%{border-color:var(--border-subtle)} 100%{border-color:var(--sb-primary)} }
        .pulse-emerald { animation:pulse-border 1.5s infinite alternate; }
        @keyframes insert-flash { 0%{background-color:var(--sb-primary-soft, transparent)} 100%{background-color:transparent} }
        .animate-insert { animation:insert-flash 1.5s ease-out; }
      `}</style>

      <div className="flex items-center justify-between border-b border-sb-hairline pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-sb-ink-secondary">Live Parser Engine</span>
        </div>
        <span className="text-[10px] font-mono text-sb-ink-muted bg-sb-canvas px-2 py-0.5 rounded border border-sb-hairline">
          {step === 0 ? 'READY' : step === 1 ? 'ALERT_IN' : step === 2 ? 'PARSING' : step === 3 ? 'DB_COMMIT' : 'SYNCED'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">1 · Incoming Bank Alert</span>
        <div className="relative min-h-[76px] bg-sb-canvas rounded-xl border border-sb-hairline p-3 overflow-hidden flex flex-col justify-center">
          {step === 2 && <div className="laser-glow laser-glow-active" />}
          {step === 0 ? (
            <div className="text-center text-xs text-sb-ink-muted font-mono italic">Waiting for transaction alert…</div>
          ) : (
            <div className={cn('flex gap-3 items-start transition-all duration-700', step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2', step === 2 && 'pulse-emerald')}>
              <div className="h-8 w-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 text-brand-400 font-mono text-sm font-bold">₹</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-sb-ink">SMS · ICICI Bank</span>
                  <span className="text-[10px] text-sb-ink-muted">Just now</span>
                </div>
                <p className="text-xs text-sb-ink-secondary leading-normal font-mono">UPI debit INR 250.00 at Starbucks. Ref: 290812.</p>
              </div>
            </div>
          )}
          {step >= 3 && (
            <div className="absolute right-2 bottom-2 bg-brand-500/10 text-brand-400 border border-brand-500/25 px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 animate-scale-up">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Parsed Locally ✔
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">2 · Device-Only Log</span>
        <div className="border border-sb-hairline rounded-xl overflow-hidden bg-sb-canvas">
          <div className="grid grid-cols-4 bg-sb-canvas border-b border-sb-hairline px-3 py-2 text-[10px] font-semibold text-sb-ink-muted tracking-widest uppercase">
            <div>Date</div><div className="col-span-2">Merchant</div><div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-sb-hairline min-h-[90px]">
            {step >= 3 && (
              <div className="grid grid-cols-4 px-3 py-2 text-xs items-center bg-brand-500/10 animate-insert">
                <div className="text-sb-ink-muted font-mono text-[10px]">Today</div>
                <div className="col-span-2">
                  <div className="font-semibold text-sb-ink">Starbucks</div>
                  <div className="text-[10px] text-brand-400">Food & Dining</div>
                </div>
                <div className="text-right font-bold text-sb-ink font-mono text-xs">-₹250</div>
              </div>
            )}
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-sb-ink-muted font-mono text-[10px]">Yest.</div>
              <div className="col-span-2"><div className="font-medium text-sb-ink">Netflix</div><div className="text-[10px] text-sb-ink-muted">Subscription</div></div>
              <div className="text-right text-sb-ink font-mono text-xs">-₹649</div>
            </div>
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-sb-ink-muted font-mono text-[10px]">Jun 4</div>
              <div className="col-span-2"><div className="font-medium text-sb-ink">Zomato</div><div className="text-[10px] text-sb-ink-muted">Food & Dining</div></div>
              <div className="text-right text-sb-ink font-mono text-xs">-₹320</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">3 · Budget Update</span>
        <div className="border border-sb-hairline rounded-xl p-4 bg-sb-canvas flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">🍔</span>
              <span className="text-xs font-semibold text-sb-ink">Food & Dining</span>
            </div>
            <span className="text-xs font-semibold text-sb-ink font-mono">₹{budgetAmount.toLocaleString('en-IN')} <span className="text-sb-ink-muted font-normal">/ ₹{totalBudget.toLocaleString('en-IN')}</span></span>
          </div>
          <div className="h-2 w-full bg-sb-hairline rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-out" style={{ width: `${budgetPercent}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-sb-ink-muted">
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

// ─────────────────────────────────────────────
// Main LandingPage
// ─────────────────────────────────────────────
export default function LandingPage() {
  const { user, loading, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const [downloadTab, setDownloadTab] = useState<'android' | 'ios'>('android')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [mockSms, setMockSms] = useState('Alert: UPI debit of INR 649.00 on ICICI Bank Card XX9008 at NETFLIX is successful. Ref: 98127301.')
  const [parsedResult, setParsedResult] = useState<{ merchant: string; amount: number; bank: string; category: string } | null>(null)
  const [parsing, setParsing] = useState(false)
  const [trustVisible, setTrustVisible] = useState(false)
  const trustRef = useRef<HTMLDivElement>(null)

  // Typewriter for H1
  const line1 = useTypewriter('Your expenses,', 42, 300)
  const line2 = useTypewriter('tracked automatically.', 38, line1.done ? 100 : 9999)

  // Rotating words for Hero sub-headline
  const rotatingWords = ['transactions', 'expenses', 'budgets', 'subscriptions']
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    if (!line2.done) return
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % rotatingWords.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [line2.done])

  const rotatingWord = rotatingWords[wordIndex]

  // Mouse Spotlight in Hero
  const heroRef = useRef<HTMLDivElement>(null)
  const spotlightX = useMotionValue(0)
  const spotlightY = useMotionValue(0)
  const spotlightSpringConfig = { stiffness: 100, damping: 25 }
  const smoothSpotlightX = useSpring(spotlightX, spotlightSpringConfig)
  const smoothSpotlightY = useSpring(spotlightY, spotlightSpringConfig)

  const handleHeroMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return
    const rect = heroRef.current.getBoundingClientRect()
    spotlightX.set(e.clientX - rect.left)
    spotlightY.set(e.clientY - rect.top)
  }, [spotlightX, spotlightY])

  const spotlightBg = useTransform(
    [smoothSpotlightX, smoothSpotlightY],
    ([x, y]) => `radial-gradient(550px circle at ${x}px ${y}px, rgba(16, 185, 129, 0.075), transparent)`
  )

  // Intersection observer for How It Works step lines drawing
  const stepsRef = useRef<HTMLDivElement>(null)
  const [stepsVisible, setStepsVisible] = useState(false)

  useEffect(() => {
    const el = stepsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStepsVisible(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])



  // Scroll reveal
  useScrollReveal()

  // Trust section observer (for scramble trigger)
  useEffect(() => {
    const el = trustRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setTrustVisible(true); obs.disconnect() } },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!loading && Capacitor.isNativePlatform()) {
      if (user) navigate(ROUTES.DASHBOARD || '/dashboard', { replace: true })
      else openAuthModal()
    }
  }, [user, loading, navigate, openAuthModal])

  useEffect(() => {
    document.title = 'Dhanrakshak | Auto-track your expenses. Zero manual entry.'
    window.scrollTo(0, 0)
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
    <div className="min-h-screen bg-sb-canvas flex flex-col text-sb-ink page-enter" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>

      {/* ── NAVBAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-sb-canvas/80 backdrop-blur-md border-b border-sb-hairline">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group no-underline shrink-0">
            <span className="h-8 w-8 rounded-xl bg-brand-500 flex items-center justify-center text-sm font-black text-white shadow-[var(--shadow-sm)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">₹</span>
            <span className="text-base font-extrabold tracking-tight">
              <span className="text-brand-400">Dhan</span><span>rakshak</span>
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
                <Link key={item.label} to={item.href!} className="text-sm text-sb-ink-muted hover:text-sb-ink transition-colors no-underline">{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} className="text-sm text-sb-ink-muted hover:text-sb-ink transition-colors no-underline">{item.label}</a>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <UserMenu />
            ) : (
              <>
                <button onClick={() => openAuthModal()} className="text-sm text-sb-ink-muted hover:text-sb-ink transition-colors bg-transparent border-0 cursor-pointer">Sign in</button>
                <MagneticButton onClick={() => openAuthModal()} className="sb-btn-primary border-0 cursor-pointer">Get started</MagneticButton>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────── */}
        <section ref={heroRef} onMouseMove={handleHeroMouseMove} className="pt-24 pb-20 border-b border-sb-hairline overflow-hidden relative">
          {/* Mouse Spotlight Glow */}
          <motion.div
            className="absolute inset-0 pointer-events-none hidden md:block z-0"
            style={{ background: spotlightBg }}
          />
          {/* Ambient gradient orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
            <div className="hero-orb-1 absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-brand-500/10 blur-[100px]" />
            <div className="hero-orb-2 absolute top-20 right-0 w-[400px] h-[400px] rounded-full bg-brand-700/15 blur-[120px]" />
            <div className="hero-orb-3 absolute bottom-0 left-1/3 w-[300px] h-[300px] rounded-full bg-brand-400/8 blur-[80px]" />
          </div>

          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
            <div className="space-y-8">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-brand-400"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                100% local parsing · Zero bank access required
              </motion.div>

              {/* Typewriter H1 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-sb-ink mb-4">
                  {line1.displayed}
                  {!line1.done && <span className="typewriter-cursor" />}
                  {line1.done && (
                    <>
                      <br />
                      {line2.displayed}
                      {!line2.done && <span className="typewriter-cursor" />}
                      {line2.done && <span className="typewriter-cursor done" />}
                    </>
                  )}
                </h1>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={line2.done ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-lg text-sb-ink-secondary leading-relaxed max-w-md min-h-[3.5rem]"
                >
                  Dhanrakshak reads your bank alert SMSes and emails, then logs all your{" "}
                  <span className="inline-flex relative min-w-[110px] overflow-hidden align-baseline font-semibold text-brand-400">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={rotatingWord}
                        className="inline-block"
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {rotatingWord}
                      </motion.span>
                    </AnimatePresence>
                  </span>{" "}
                  automatically. No manual entry. Your data stays on your device.
                </motion.p>
              </motion.div>

              {/* CTAs */}
              <motion.div
                className="flex flex-wrap gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={line2.done ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                {user ? (
                  <Link to={ROUTES.DASHBOARD} className="sb-btn-primary no-underline">
                    Go to Dashboard →
                  </Link>
                ) : (
                  <MagneticButton onClick={() => openAuthModal()} className="sb-btn-primary border-0 cursor-pointer">
                    Start free — no card needed →
                  </MagneticButton>
                )}
                <a href="#how-it-works" className="sb-btn-secondary no-underline">
                  See how it works
                </a>
              </motion.div>

              {/* Stats */}
              <motion.div
                className="flex gap-10 pt-2 border-t border-sb-hairline"
                initial={{ opacity: 0 }}
                animate={line2.done ? { opacity: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {[
                  { val: 'Zero', label: 'manual entries' },
                  { val: '100%', label: 'local parsing', accent: true },
                  { val: 'All', label: 'Indian banks & UPI' },
                ].map((m, i) => (
                  <motion.div
                    key={m.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={line2.done ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.4, delay: 0.25 + i * 0.08, type: 'spring', bounce: 0.4 }}
                  >
                    <p className={cn('text-xl font-bold', m.accent ? 'text-brand-400' : 'text-sb-ink')}>{m.val}</p>
                    <p className="text-xs text-sb-ink-muted mt-0.5">{m.label}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Floating hero card */}
            <motion.div
              className="flex justify-center lg:justify-end"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="hero-card-float">
                <InteractionSimulation />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── BANK MARQUEE ───────────────────────────────────── */}
        <section className="py-10 bg-sb-canvas border-b border-sb-hairline overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p className="text-xs font-semibold tracking-wider text-sb-ink-muted uppercase mb-5">
              Works with every Indian bank & UPI app
            </p>
            <div className="marquee-container select-none">
              <div className="marquee-content font-mono text-sm font-semibold tracking-tight text-sb-ink-muted flex items-center">
                {/* Loop 1 */}
                {[
                  'ICICI Bank', 'HDFC Bank', 'SBI', 'Axis Bank', 'Kotak Bank', 
                  'Paytm', 'PhonePe', 'Google Pay', 'Cred', 'Jupiter', 'Fi Money',
                  'IndusInd Bank', 'Yes Bank', 'PNB', 'BOB'
                ].map((bank) => (
                  <div key={bank} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sb-canvas-soft border border-sb-hairline hover:border-brand-500/30 hover:text-sb-primary transition-all duration-300 animate-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500/70" />
                    {bank}
                  </div>
                ))}
                {/* Loop 2 */}
                {[
                  'ICICI Bank', 'HDFC Bank', 'SBI', 'Axis Bank', 'Kotak Bank', 
                  'Paytm', 'PhonePe', 'Google Pay', 'Cred', 'Jupiter', 'Fi Money',
                  'IndusInd Bank', 'Yes Bank', 'PNB', 'BOB'
                ].map((bank) => (
                  <div key={bank + '-dup'} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sb-canvas-soft border border-sb-hairline hover:border-brand-500/30 hover:text-sb-primary transition-all duration-300 animate-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500/70" />
                    {bank}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────── */}
        <section id="how-it-works" className="py-24 bg-sb-canvas-soft border-b border-sb-hairline">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-16">
              <div data-reveal className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-sb-ink-muted mb-4">How it works</div>
              <h2 data-reveal data-delay="80" className="text-4xl font-bold tracking-tight text-sb-ink mb-4">Spend money. We handle the rest.</h2>
              <p data-reveal data-delay="150" className="text-sb-ink-secondary text-lg max-w-lg mx-auto">Three steps, zero effort from your end.</p>
            </div>
            <div ref={stepsRef} className="grid md:grid-cols-3 gap-6">
              {steps.map((s, i) => (
                <div key={s.num} data-reveal data-delay={String(i * 150)}>
                  <TiltCard className="sb-card-light p-8 relative group transition-all duration-300 h-full">
                    <div className="text-5xl font-black text-sb-ink-muted/30 mb-6 leading-none group-hover:text-brand-500/40 transition-colors duration-300">{s.num}</div>
                    {i < steps.length - 1 && (
                      <svg className="hidden md:block absolute top-[60px] -right-[15px] w-8 h-6 text-brand-500/40 z-10" viewBox="0 0 32 16" fill="none">
                        <path
                          d="M0 8C8 8 12 12 16 8S24 4 32 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          className={stepsVisible ? "animate-draw-path" : "stroke-dasharray-200 stroke-dashoffset-200"}
                        />
                        <path
                          d="M26 4l6 4-6 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="transition-opacity duration-300 delay-[1200ms]"
                          style={{ opacity: stepsVisible ? 1 : 0 }}
                        />
                      </svg>
                    )}
                    <h3 className="text-lg font-semibold text-sb-ink mb-3">{s.title}</h3>
                    <p className="text-sm text-sb-ink-secondary leading-relaxed">{s.desc}</p>
                  </TiltCard>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ────────────────────────────────────── */}
        <section id="features" className="py-24 border-b border-sb-hairline">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-16">
              <div data-reveal className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-sb-ink-muted mb-4">Features</div>
              <h2 data-reveal data-delay="80" className="text-4xl font-bold tracking-tight text-sb-ink mb-4">Smart, simple, and <span className="shimmer-text">100% private.</span></h2>
              <p data-reveal data-delay="150" className="text-sb-ink-secondary text-lg max-w-lg mx-auto">Everything you need to manage your money — without handing over your data.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f, i) => (
                <div key={f.title} data-reveal data-delay={String(i * 80)}>
                  <TiltCard className="sb-card-light p-6 group h-full">
                    <motion.div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-xl mb-5 bg-brand-500/10 border border-brand-500/20"
                      whileHover={{ scale: 1.18, rotate: 6 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                      {f.icon}
                    </motion.div>
                    <h3 className="text-base font-semibold text-sb-ink mb-2">{f.title}</h3>
                    <p className="text-sm text-sb-ink-secondary leading-relaxed">{f.desc}</p>
                  </TiltCard>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── LIVE PARSER DEMO ────────────────────────────── */}
        <section className="py-24 bg-sb-canvas-soft border-b border-sb-hairline">
          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-6 pt-4" data-reveal="from-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-sb-ink-muted">Try it live</div>
              <h2 className="text-4xl font-bold tracking-tight text-sb-ink leading-tight">
                Paste any bank SMS.<br /><span className="shimmer-text">Watch it parse.</span>
              </h2>
              <p className="text-sb-ink-secondary leading-relaxed">
                This is exactly how Dhanrakshak works — reading your bank alerts and extracting the merchant, amount, and category automatically. Your real alerts are parsed on-device, never uploaded.
              </p>
              <div className="space-y-3">
                {[
                  'Works with ICICI, HDFC, SBI, Axis, Kotak & more',
                  'Detects UPI, debit card, credit card transactions',
                  'Auto-categorizes into Food, Transport, Shopping etc.',
                ].map((item, i) => (
                  <motion.div
                    key={item}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                  >
                    <div className="h-5 w-5 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm text-sb-ink-secondary">{item}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="sb-card-light p-8 space-y-5" data-reveal="from-right">
              <div>
                <label className="text-xs font-semibold text-sb-ink-muted uppercase tracking-widest block mb-2">Bank alert text</label>
                <textarea
                  value={mockSms}
                  onChange={(e) => { setMockSms(e.target.value); setParsedResult(null) }}
                  rows={4}
                  className="w-full bg-sb-canvas border border-sb-hairline rounded-xl px-4 py-3 text-sm text-sb-ink font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 transition-all placeholder-sb-ink-muted"
                  placeholder="Paste your bank SMS here…"
                />
              </div>
              <MagneticButton
                onClick={handleTestParse}
                className={cn('sb-btn-primary w-full border-0 cursor-pointer', (parsing || !mockSms.trim()) && 'opacity-40 pointer-events-none')}
              >
                {parsing ? 'Reading alert…' : 'Auto-detect transaction'}
              </MagneticButton>

              <AnimatePresence>
                {parsedResult && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-sb-canvas border border-sb-hairline rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sb-ink-muted uppercase tracking-widest">Parse result</span>
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
                      ].map(({ label, val, accent }, i) => (
                        <motion.div
                          key={label}
                          className="bg-sb-canvas-soft rounded-lg p-3"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.06 }}
                        >
                          <p className="text-[10px] text-sb-ink-muted uppercase tracking-widest mb-1">{label}</p>
                          <p className={cn('text-sm font-semibold', accent ? 'text-brand-400' : 'text-sb-ink')}>{val}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* ── TRUST / PRIVACY ─────────────────────────────── */}
        <section className="py-20 border-b border-sb-hairline">
          <div className="mx-auto max-w-6xl px-6">
            <div ref={trustRef} data-reveal className="sb-card-light border-t-4 border-t-brand-500 p-10 md:p-12 flex flex-col md:flex-row items-center gap-10 justify-between">
              <div className="max-w-lg">
                <h2 className="text-2xl font-bold text-sb-ink mb-4">Your money, your data. Always local.</h2>
                <p className="text-sb-ink-secondary leading-relaxed text-sm">
                  Dhanrakshak never uploads your bank alerts or emails to any server. The entire parser runs inside your browser. We cannot see, store, or sell your financial data — because we never receive it.
                </p>
              </div>
              <div className="flex gap-12 shrink-0">
                {[
                  { val: '0', label: 'Cloud uploads', sub: 'Device-only parsing' },
                  { val: '256-bit', label: 'SSL encryption', sub: 'Bank-grade security' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-4xl font-black text-brand-400 font-mono">
                      <ScrambleText value={s.val} trigger={trustVisible} />
                    </p>
                    <p className="text-sm font-semibold text-sb-ink mt-2">{s.label}</p>
                    <p className="text-xs text-sb-ink-muted mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── INSTALL GUIDE ───────────────────────────────── */}
        <section id="install-guide" className="py-24 bg-sb-canvas-soft border-b border-sb-hairline">
          <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6" data-reveal="from-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-sb-ink-muted">Install</div>
              <h2 className="text-4xl font-bold text-sb-ink leading-tight">
                On your phone<br />in <span className="shimmer-text">60 seconds.</span>
              </h2>
              <p className="text-sb-ink-secondary leading-relaxed">
                Dhanrakshak is a Progressive Web App. No App Store, no APK, no Play Store approvals. Just open the website and install it to your home screen.
              </p>
              <div className="space-y-3">
                {[
                  { icon: '⚡', text: 'No App Store or APK needed' },
                  { icon: '🔒', text: 'Safe, lightweight, and offline-capable' },
                  { icon: '🔔', text: 'Enable notifications for instant spend alerts' },
                ].map((item, i) => (
                  <motion.div
                    key={item.text}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                  >
                    <div className="h-8 w-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-sm shrink-0">{item.icon}</div>
                    <p className="text-sm text-sb-ink-secondary font-medium">{item.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="sb-card-light overflow-hidden" style={{ padding: 0 }} data-reveal="from-right">
              <div className="flex bg-sb-canvas border-b border-sb-hairline">
                {(['android', 'ios'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDownloadTab(tab)}
                    className={cn(
                      'flex-1 py-4 text-sm transition-all cursor-pointer border-none bg-transparent font-medium flex items-center justify-center gap-2',
                      downloadTab === tab
                        ? 'text-brand-400 border-b-2 border-brand-400'
                        : 'text-sb-ink-muted border-b-2 border-transparent hover:text-sb-ink-secondary'
                    )}
                  >
                    {tab === 'android' ? (
                      <>
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.523 15.3c-.551 0-1-.449-1-1 0-.551.449-1 1-1s1 .449 1 1c0 .551-.449 1-1 1zm-11.046 0c-.551 0-1-.449-1-1 0-.551.449-1 1-1s1 .449 1 1c0 .551-.449 1-1 1zm11.233-5.963l1.854-3.21a.501.501 0 0 0-.183-.683.499.499 0 0 0-.683.183l-1.884 3.261C15.483 8.35 13.814 8 12 8s-3.483.35-4.83.891L5.286 5.63a.499.499 0 0 0-.683-.183.501.501 0 0 0-.183.683l1.854 3.21C3.473 10.917 1.8 13.399 1.5 16.325h21c-.3-2.926-1.973-5.408-4.743-6.988z"/>
                        </svg>
                        <span>Android</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.62.72-1.16 1.87-1.02 2.98 1.11.09 2.27-.58 2.97-1.42"/>
                        </svg>
                        <span>iOS (iPhone)</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={downloadTab}
                  className="p-8"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <ol className="space-y-4">
                    {(downloadTab === 'android' ? [
                      'Open Google Chrome on your Android device.',
                      'Tap the three-dot menu icon in the top-right corner.',
                      'Select "Add to Home screen" or "Install App".',
                      'Confirm — the app icon appears on your home screen.',
                    ] : [
                      'Open Safari on your iPhone or iPad.',
                      'Tap the Share button (square with arrow pointing up).',
                      'Scroll down the share sheet and tap "Add to Home Screen".',
                      'Tap Add in the top right — done.',
                    ]).map((step, i) => (
                      <motion.li
                        key={i}
                        className="flex gap-3 items-start"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.07 }}
                      >
                        <span className="h-5 w-5 rounded-full bg-brand-500/15 border border-brand-500/25 text-brand-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-sb-ink-secondary leading-relaxed">{step}</p>
                      </motion.li>
                    ))}
                  </ol>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="py-24 border-b border-sb-hairline">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-14">
              <div data-reveal className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-sb-ink-muted mb-4">FAQ</div>
              <h2 data-reveal data-delay="80" className="text-4xl font-bold text-sb-ink">Questions people ask</h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, idx) => {
                const isOpen = expandedFaq === idx
                return (
                  <div key={idx} data-reveal data-delay={String(idx * 70)} className="sb-card-light overflow-hidden" style={{ padding: 0 }}>
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full text-left px-6 py-5 flex items-center justify-between cursor-pointer border-none bg-transparent"
                    >
                      <span className="text-base font-semibold text-sb-ink pr-4">{item.q}</span>
                      <motion.span
                        animate={{ rotate: isOpen ? 45 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-brand-400 text-xl shrink-0"
                      >
                        ＋
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-5 border-t border-sb-hairline pt-4">
                            <p className="text-sm text-sb-ink-secondary leading-relaxed">{item.a}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────── */}
        <section className="py-28 text-center border-b border-sb-hairline relative overflow-hidden">
          {/* Background orb */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="hero-orb-1 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/8 blur-[120px]" />
          </div>
          <div className="mx-auto max-w-2xl px-6 space-y-6 relative z-10">
            <h2 data-reveal="scale" className="text-5xl font-bold tracking-tight text-sb-ink">
              Take control of<br /><span className="shimmer-text">your finances today.</span>
            </h2>
            <p data-reveal data-delay="100" className="text-lg text-sb-ink-secondary max-w-md mx-auto leading-relaxed">
              Free account. 14-day full trial. No credit card required. Delete your data anytime.
            </p>
            <motion.div
              className="flex flex-wrap items-center justify-center gap-4 pt-2"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {user ? (
                <Link to={ROUTES.DASHBOARD} className="sb-btn-primary no-underline">
                  Go to Dashboard →
                </Link>
              ) : (
                <MagneticButton onClick={() => openAuthModal()} className="sb-btn-primary border-0 cursor-pointer text-base px-7 py-3">
                  Start free — no card needed →
                </MagneticButton>
              )}
              <Link to={ROUTES.PRICING} className="sb-btn-secondary no-underline">
                View pricing
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="py-14 bg-sb-canvas-soft border-t border-sb-hairline">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-brand-500 flex items-center justify-center text-xs font-black text-white">₹</span>
              <span className="text-sm font-extrabold"><span className="text-brand-400">Dhan</span><span>rakshak</span></span>
            </div>
            <p className="text-xs text-sb-ink-muted">© 2026 Dhanrakshak. Built with privacy by design.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { label: 'Pricing', to: '/pricing' },
              { label: 'Privacy', to: ROUTES.PRIVACY },
              { label: 'Terms', to: ROUTES.TERMS },
              { label: 'About', to: ROUTES.ABOUT },
              { label: 'Support', to: '/support' },
            ].map((l) => (
              <Link key={l.label} to={l.to} className="text-xs font-medium text-sb-ink-muted hover:text-sb-ink transition-colors no-underline">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
