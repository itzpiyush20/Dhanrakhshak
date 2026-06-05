import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context'
import { ROUTES } from '@/constants'
import { Capacitor } from '@capacitor/core'

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
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontFeatureSettings: '"ss01"' }}>

      {/* ── NAV (nav-bar-on-mesh) ─────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#e3e8ee]">
        <nav className="mx-auto max-w-[1200px] px-6 h-[60px] flex items-center justify-between" aria-label="Primary">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-lg font-bold" style={{ color: 'var(--s-primary)' }}>₹</span>
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--s-ink)', letterSpacing: '-0.3px' }}>Dhanrakshak</span>
          </Link>

          {/* Center links */}
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Daily Life', href: '#daily-utility' },
              { label: 'Features', href: '#features' },
              { label: 'Download', href: '#download' },
              { label: 'FAQ', href: '#faq' },
              { label: 'Support', href: '/support', isLink: true },
            ].map((item) =>
              item.isLink ? (
                <Link key={item.label} to={item.href!} className="s-caption" style={{ color: 'var(--s-ink-mute-2)', textDecoration: 'none' }}>{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} className="s-caption" style={{ color: 'var(--s-ink-mute-2)', textDecoration: 'none' }}>{item.label}</a>
              )
            )}
          </div>

          {/* Right CTAs */}
          <div className="flex items-center gap-3">
            {user ? (
              <Link to={ROUTES.DASHBOARD} className="s-btn-primary">Dashboard</Link>
            ) : (
              <>
                <Link to={ROUTES.LOGIN} className="s-caption" style={{ color: 'var(--s-ink-mute-2)', textDecoration: 'none' }}>Sign in</Link>
                <Link to={ROUTES.SIGNUP} className="s-btn-primary">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main-content">

        {/* ── BAND 1: HERO (gradient mesh backdrop) ─────────────────── */}
        <section className="stripe-mesh-bg pt-24 pb-32 relative overflow-hidden">
          {/* subtle noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

          <div className="mx-auto max-w-[1200px] px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
            {/* Left: copy */}
            <div className="space-y-7">
              <div className="s-pill-tag">100% Private · Local Scans</div>

              <h1 className="s-display-xxl" style={{ color: 'var(--s-ink)' }}>
                Stop typing your expenses.<br />
                <span style={{ color: 'var(--s-primary)' }}>Let Dhanrakshak</span><br />
                track them.
              </h1>

              <p className="s-body-lg" style={{ color: 'var(--s-ink-mute)', maxWidth: 440 }}>
                Tired of writing down every rupee you spend? Dhanrakshak automatically maps your budget from your bank alerts. Safe, automatic, and simple.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP} className="s-btn-primary" style={{ fontSize: 16, padding: '11px 28px' }}>
                  {user ? 'Go to Dashboard' : 'Start free — no card needed'}
                </Link>
                <a href="#download" className="s-btn-secondary" style={{ fontSize: 16, padding: '10px 28px' }}>
                  Download App
                </a>
              </div>

              {/* Mini metrics */}
              <div className="flex gap-8 pt-4 border-t" style={{ borderColor: 'rgba(13,37,61,0.1)' }}>
                {[
                  { val: 'Zero', label: 'Manual typing' },
                  { val: '100%', label: 'Local scans', accent: true },
                  { val: 'All', label: 'Major UPI banks' },
                ].map((m) => (
                  <div key={m.label}>
                    <p className="tnum" style={{ fontSize: 20, fontWeight: 300, color: m.accent ? 'var(--s-primary)' : 'var(--s-ink)', letterSpacing: '-0.4px' }}>{m.val}</p>
                    <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)', marginTop: 4 }}>{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: product UI mockup composite */}
            <div className="relative flex items-center justify-center h-[420px]">
              {/* Back card */}
              <div className="absolute w-[300px] bg-white border rounded-2xl p-6 s-shadow-2 -translate-y-8 -translate-x-6 -rotate-3 hover:rotate-0 transition-transform duration-300" style={{ borderColor: 'var(--s-hairline)' }}>
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Active Spend Limit</p>
                    <p className="s-caption" style={{ color: 'var(--s-ink-secondary)', marginTop: 2 }}>Primary Bank Account</p>
                  </div>
                  <span className="text-[8px] font-bold italic px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--s-hairline)', color: 'var(--s-ink-mute)' }}>VISA</span>
                </div>
                <p className="tnum" style={{ fontSize: 26, fontWeight: 300, color: 'var(--s-ink)', letterSpacing: '-0.6px' }}>₹4,250.00</p>
                <p className="s-caption" style={{ color: 'var(--s-ink-mute)', marginTop: 2 }}>Remaining of ₹15,000 budget</p>
                <div className="mt-4 h-1.5 w-full rounded-full" style={{ background: 'var(--s-hairline)' }}>
                  <div className="h-full rounded-full" style={{ width: '28%', background: 'var(--s-primary)' }} />
                </div>
              </div>

              {/* Front card */}
              <div className="absolute w-[290px] bg-white border rounded-2xl p-5 s-shadow-2 translate-y-16 translate-x-14 rotate-2 hover:rotate-0 transition-transform duration-300" style={{ borderColor: 'var(--s-primary)', borderWidth: 1.5 }}>
                <div className="flex gap-3 items-center mb-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(83,58,253,0.08)' }}>💡</div>
                  <div>
                    <p className="s-caption font-medium" style={{ color: 'var(--s-ink)' }}>Dhanrakshak Auto-Read</p>
                    <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Bank alert email read instantly</p>
                  </div>
                </div>
                <div className="rounded-xl p-3 flex justify-between items-center" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                  <div>
                    <p className="s-caption font-medium" style={{ color: 'var(--s-ink)' }}>Zomato Food</p>
                    <p className="tnum" style={{ fontSize: 11, color: 'var(--s-ink-mute)' }}>04 Jun, 23:42</p>
                  </div>
                  <p className="tnum" style={{ fontSize: 15, fontWeight: 400, color: 'var(--s-ink)' }}>₹649.00</p>
                </div>
              </div>

              {/* Float accent circle */}
              <div className="absolute h-20 w-20 rounded-full flex flex-col items-center justify-center text-center s-shadow-1 -translate-y-24 translate-x-28" style={{ background: 'var(--s-canvas)', border: '1px solid var(--s-hairline)' }}>
                <span className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Saved</span>
                <span className="tnum" style={{ fontSize: 14, fontWeight: 400, color: 'var(--s-primary)', marginTop: 2 }}>+12%</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 2: DAILY LIFE (canvas-soft) ─────────────────── */}
        <section id="daily-utility" className="py-24" style={{ background: 'var(--s-canvas-soft)' }}>
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="text-center mb-16">
              <div className="s-pill-tag mb-4" style={{ display: 'inline-flex' }}>Rhythm of tracking</div>
              <h2 className="s-display-lg" style={{ color: 'var(--s-ink)' }}>A day in your spend routine</h2>
              <p className="s-body-lg mt-4 mx-auto" style={{ color: 'var(--s-ink-mute)', maxWidth: 500 }}>
                See how Dhanrakshak helps you keep track of your money automatically as you go about your day.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { time: '08:30 AM', emoji: '☕', title: 'Morning Tea or Coffee', body: 'You buy a tea or coffee on your way to work. Your bank sends you an alert email. Dhanrakshak automatically reads the expense and logs it for you. You do not have to type a single thing.' },
                { time: '01:15 PM', emoji: '🍔', title: 'Smart Budget Guard', body: 'You treat yourself to lunch. Dhanrakshak updates your monthly lunch budget immediately. If you are close to your spending limit, the app gently flags it to keep you on track.' },
                { time: '10:00 PM', emoji: '📊', title: 'Simple Daily Summary', body: 'Open the app before bed to view a beautiful, easy-to-understand breakdown of what you spent today and how much you saved. Complete clarity without the stress of manual accounts.' },
              ].map((card) => (
                <div key={card.title} className="s-card s-shadow-1 hover:s-shadow-2 transition-shadow" style={{ padding: 32 }}>
                  <div className="flex items-center justify-between mb-6">
                    <span className="s-micro-cap px-3 py-1 rounded-full" style={{ background: 'rgba(83,58,253,0.08)', color: 'var(--s-primary)' }}>{card.time}</span>
                    <span className="text-2xl">{card.emoji}</span>
                  </div>
                  <h3 className="s-heading-md" style={{ color: 'var(--s-ink)' }}>{card.title}</h3>
                  <p className="s-body-md mt-3" style={{ color: 'var(--s-ink-mute)' }}>{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BAND 3: FEATURES (white canvas + cream interlude) ─── */}
        <section id="features" className="py-24" style={{ background: 'var(--s-canvas)' }}>
          <div className="mx-auto max-w-[1200px] px-6 grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div className="space-y-8">
              <div>
                <div className="s-pill-tag mb-4" style={{ display: 'inline-flex' }}>Product design</div>
                <h2 className="s-display-lg" style={{ color: 'var(--s-ink)' }}>Smart, simple, and 100% private.</h2>
                <p className="s-body-lg mt-4" style={{ color: 'var(--s-ink-mute)' }}>
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
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>{f.emoji}</div>
                    <div>
                      <h3 className="s-caption font-semibold" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>{f.title}</h3>
                      <p className="s-caption mt-1" style={{ color: 'var(--s-ink-mute)' }}>{f.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Try the parser */}
            <div className="s-card s-shadow-2" style={{ padding: 32 }}>
              <h3 className="s-heading-md" style={{ color: 'var(--s-ink)' }}>⚡ Try the Auto-Detector</h3>
              <p className="s-body-md mt-2" style={{ color: 'var(--s-ink-mute)' }}>
                Paste any transaction message below and see how we understand it instantly:
              </p>

              <div className="space-y-4 mt-6">
                <textarea
                  value={mockEmail}
                  onChange={(e) => setMockEmail(e.target.value)}
                  className="s-input resize-none"
                  style={{ height: 80, fontFamily: "'Inter', system-ui", fontSize: 13, fontWeight: 300 }}
                  placeholder="Enter transaction text..."
                />
                <button
                  onClick={handleTestParse}
                  disabled={parsing || !mockEmail.trim()}
                  className="s-btn-primary"
                  style={{ width: '100%', padding: '11px 20px', fontSize: 15, opacity: parsing || !mockEmail.trim() ? 0.5 : 1 }}
                >
                  {parsing ? 'Reading alert text…' : 'Auto-Read Transaction'}
                </button>

                {parsedResult && (
                  <div className="rounded-xl p-4 space-y-3 animate-fade-in" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                    <div className="flex justify-between items-center s-micro-cap pb-2" style={{ borderBottom: '1px solid var(--s-hairline)', color: 'var(--s-ink-mute)' }}>
                      <span>Detected details</span>
                      <span style={{ color: 'var(--s-primary)' }}>{parsedResult.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 s-caption" style={{ color: 'var(--s-ink)' }}>
                      <div><p style={{ color: 'var(--s-ink-mute)' }}>Merchant:</p><p style={{ fontWeight: 500 }}>{parsedResult.merchant}</p></div>
                      <div><p style={{ color: 'var(--s-ink-mute)' }}>Amount:</p><p className="tnum" style={{ color: 'var(--s-primary)', fontWeight: 500 }}>₹{parsedResult.amount.toLocaleString('en-IN')}</p></div>
                      <div><p style={{ color: 'var(--s-ink-mute)' }}>Bank:</p><p style={{ fontWeight: 500 }}>{parsedResult.bank}</p></div>
                      <div><p style={{ color: 'var(--s-ink-mute)' }}>Category:</p><p style={{ fontWeight: 500 }}>{parsedResult.category}</p></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 3b: CREAM INTERLUDE ──────────────────────────── */}
        <section className="py-20" style={{ background: 'var(--s-canvas-cream)' }}>
          <div className="mx-auto max-w-[1200px] px-6 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="max-w-lg">
              <h2 className="s-display-md" style={{ color: 'var(--s-ink)' }}>Your money, your data.<br />Always local. Always yours.</h2>
              <p className="s-body-md mt-4" style={{ color: 'var(--s-ink-secondary)' }}>
                Dhanrakshak never stores your transaction emails on any server. Everything is parsed locally, on your own device — so your financial data stays yours, period.
              </p>
            </div>
            <div className="flex gap-12 shrink-0">
              {[
                { val: '0', label: 'Emails uploaded to cloud', sub: 'All parsing is local' },
                { val: '256-bit', label: 'SSL on every request', sub: 'Bank-grade security' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="tnum" style={{ fontSize: 28, fontWeight: 300, color: 'var(--s-ink)', letterSpacing: '-0.6px' }}>{s.val}</p>
                  <p className="s-caption" style={{ color: 'var(--s-ink-secondary)', marginTop: 4 }}>{s.label}</p>
                  <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)', marginTop: 2 }}>{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BAND 4: DOWNLOAD (canvas-soft) ───────────────────── */}
        <section id="download" className="py-24" style={{ background: 'var(--s-canvas-soft)' }}>
          <div className="mx-auto max-w-[1200px] px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="s-pill-tag" style={{ display: 'inline-flex' }}>Get the app</div>
              <h2 className="s-display-lg" style={{ color: 'var(--s-ink)' }}>Easy setup on mobile</h2>
              <p className="s-body-lg" style={{ color: 'var(--s-ink-mute)' }}>
                Dhanrakshak is lightweight and fast. Download the app directly for your Android phone or link it as a web app on your iPhone.
              </p>
              <div className="space-y-3">
                {[
                  { icon: '⚡', text: 'Very small size (~3.2 MB)' },
                  { icon: '🔒', text: '100% safe to install & use' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm s-shadow-1" style={{ background: 'var(--s-canvas)', border: '1px solid var(--s-hairline)' }}>{item.icon}</div>
                    <p className="s-caption" style={{ color: 'var(--s-ink-secondary)', fontWeight: 500 }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="s-card s-shadow-2" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Tab bar */}
              <div className="flex" style={{ borderBottom: '1px solid var(--s-hairline)' }}>
                {(['android', 'ios'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDownloadTab(tab)}
                    className="flex-1 py-4 s-caption cursor-pointer transition-colors"
                    style={{
                      color: downloadTab === tab ? 'var(--s-primary)' : 'var(--s-ink-mute)',
                      borderBottom: downloadTab === tab ? '2px solid var(--s-primary)' : '2px solid transparent',
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      background: 'none',
                      fontWeight: downloadTab === tab ? 500 : 300,
                    }}
                  >
                    {tab === 'android' ? '🤖 Android App' : '🍎 iPhone / iOS'}
                  </button>
                ))}
              </div>

              <div className="p-8 animate-fade-in">
                {downloadTab === 'android' ? (
                  <div className="space-y-6">
                    <div className="rounded-xl p-4 flex items-center justify-between flex-wrap gap-4" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                      <div>
                        <p className="s-caption font-medium" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>Android APK File</p>
                        <p className="s-micro-cap mt-0.5" style={{ color: 'var(--s-ink-mute)' }}>Version 1.0.4 · Official package</p>
                      </div>
                      <a href="/dhanrakshak.apk" download className="s-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>📥 Download APK</a>
                    </div>
                    <div className="space-y-2">
                      <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Installation steps</p>
                      <ol className="space-y-1.5 s-caption pl-4 list-decimal" style={{ color: 'var(--s-ink-mute)' }}>
                        <li>Tap the download button above.</li>
                        <li>Open the downloaded <code>.apk</code> file from your phone.</li>
                        <li>If prompted, approve permission to install packages.</li>
                        <li>Open Dhanrakshak from your home screen and sign in.</li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-xl p-4" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                      <p className="s-caption font-medium" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>iPhone Web App Setup</p>
                      <p className="s-micro-cap mt-1" style={{ color: 'var(--s-ink-mute)' }}>Launches full screen from your home screen.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Easy iOS steps</p>
                      <ul className="space-y-1.5 s-caption pl-4 list-disc" style={{ color: 'var(--s-ink-mute)' }}>
                        <li>Open Safari and visit this web address.</li>
                        <li>Tap the <strong style={{ color: 'var(--s-ink)' }}>Share</strong> icon at the bottom of Safari.</li>
                        <li>Choose <strong style={{ color: 'var(--s-ink)' }}>Add to Home Screen</strong>.</li>
                        <li>Name the app and tap <strong style={{ color: 'var(--s-ink)' }}>Add</strong>.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── BAND 5: FAQ (white) ───────────────────────────────── */}
        <section id="faq" className="py-24" style={{ background: 'var(--s-canvas)' }}>
          <div className="mx-auto max-w-[800px] px-6">
            <div className="text-center mb-14">
              <div className="s-pill-tag mb-4" style={{ display: 'inline-flex' }}>Questions</div>
              <h2 className="s-display-lg" style={{ color: 'var(--s-ink)' }}>Frequently asked questions</h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, idx) => {
                const isOpen = expandedFaq === idx
                return (
                  <div key={idx} className="s-card s-shadow-1" style={{ padding: 0, overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full text-left px-6 py-5 flex items-center justify-between cursor-pointer"
                      style={{ background: 'none', border: 'none' }}
                    >
                      <span className="s-body-md" style={{ color: 'var(--s-ink)', fontWeight: isOpen ? 500 : 300 }}>{item.q}</span>
                      <span style={{ color: 'var(--s-primary)', fontSize: 20, transition: 'transform 0.2s', transform: isOpen ? 'rotate(45deg)' : 'none', flexShrink: 0, marginLeft: 16 }}>＋</span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 animate-fade-in">
                        <p className="s-body-md" style={{ color: 'var(--s-ink-mute)' }}>{item.a}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── BAND 6: CTA (deep navy brand-dark) ───────────────── */}
        <section className="py-24 text-center" style={{ background: 'var(--s-brand-dark)' }}>
          <div className="mx-auto max-w-[600px] px-6 space-y-6">
            <h2 className="s-display-lg" style={{ color: '#fff' }}>Ready to automate your savings?</h2>
            <p className="s-body-lg" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Create a free account in less than 60 seconds. You can delete or export your records anytime.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP} className="s-btn-primary" style={{ fontSize: 16, padding: '11px 28px' }}>
                {user ? 'Go to Dashboard' : 'Get started free'}
              </Link>
              <Link to={ROUTES.PRICING} className="s-btn-on-dark" style={{ fontSize: 16, padding: '10px 28px' }}>
                View pricing
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer style={{ background: 'var(--s-canvas)', borderTop: '1px solid var(--s-hairline)' }} className="py-16">
        <div className="mx-auto max-w-[1200px] px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--s-primary)' }}>₹</span>
              <span className="s-body-md" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>Dhanrakshak</span>
            </div>
            <p className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>© 2026 Dhanrakshak. Built with privacy by design.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { label: 'Privacy Policy', to: ROUTES.PRIVACY },
              { label: 'Terms of Service', to: ROUTES.TERMS },
              { label: 'About', to: ROUTES.ABOUT },
              { label: 'Support', to: '/support' },
            ].map((l) => (
              <Link key={l.label} to={l.to} className="s-caption s-link" style={{ color: 'var(--s-ink-mute)' }}>{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
