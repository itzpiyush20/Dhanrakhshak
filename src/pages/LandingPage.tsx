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
    merchant: string
    amount: number
    bank: string
    category: string
    status: string
  } | null>(null)
  const [parsing, setParsing] = useState(false)

  // Native platform auto-redirect: Skip marketing landing page if running as native app
  useEffect(() => {
    if (!loading && Capacitor.isNativePlatform()) {
      if (user) {
        navigate(ROUTES.DASHBOARD || '/dashboard', { replace: true })
      } else {
        navigate(ROUTES.LOGIN || '/login', { replace: true })
      }
    }
  }, [user, loading, navigate])

  // Set page title
  useEffect(() => {
    document.title = 'Dhanrakshak | Automatically Track Spends & Budgets'
    window.scrollTo(0, 0)
  }, [])

  const handleTestParse = () => {
    setParsing(true)
    setTimeout(() => {
      const text = mockEmail.toLowerCase()
      let amount = 0
      let merchant = 'Unknown Merchant'
      let bank = 'Unknown Bank'
      let category = 'Others'

      const amtMatch = text.match(/(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i)
      if (amtMatch) amount = parseFloat(amtMatch[1].replace(/,/g, ''))

      if (text.includes('netflix')) {
        merchant = 'Netflix'
        category = 'Subscriptions 🔄'
      } else if (text.includes('zomato')) {
        merchant = 'Zomato'
        category = 'Food & Dining 🍔'
      } else if (text.includes('coffee') || text.includes('starbucks')) {
        merchant = 'Starbucks Coffee'
        category = 'Food & Dining 🍔'
      } else if (text.includes('uber') || text.includes('ola')) {
        merchant = 'Uber Cab'
        category = 'Transport 🚗'
      }

      if (text.includes('icici')) bank = 'ICICI Bank'
      else if (text.includes('sbi') || text.includes('state bank')) bank = 'SBI'
      else if (text.includes('hdfc')) bank = 'HDFC Bank'

      setParsedResult({
        merchant,
        amount: amount || 649,
        bank,
        category,
        status: 'Scanned Securely ✔'
      })
      setParsing(false)
    }, 600)
  }

  const faqItems = [
    {
      q: 'How does the app automatically know what I spent?',
      a: 'Whenever you pay with UPI, debit card, or credit card, your bank sends an email confirmation. If you choose to link your email account, Dhanrakshak scans your inbox specifically for these bank transaction alert emails (like HDFC, SBI, ICICI, etc.) to list your spends. It reads the amount and merchant automatically so you do not have to type anything.'
    },
    {
      q: 'Can the app see my bank passwords or take money from my account?',
      a: 'Absolutely not. Dhanrakshak is completely read-only. We never ask for your passwords, net-banking PINs, card numbers, CVV, or OTPs. We cannot touch your money, move funds, or make payments. Your money remains 100% secure in your bank.'
    },
    {
      q: 'Do my private emails leave my phone or device?',
      a: 'No. Privacy is our top priority. The scanning of bank alerts happens locally inside your browser or app. Your personal emails are never sent to our servers or shared with anyone else.'
    },
    {
      q: 'Do I have to connect my email to use the app?',
      a: 'No, it is entirely optional. If you prefer, you can type in your spends manually, copy-paste bank SMS texts, or import them from a spreadsheet. The app works great either way.'
    },
    {
      q: 'What happens after the 14-day free trial ends?',
      a: 'During the 14-day trial, you get full access to all features including automatic email tracking. Once the trial ends, automatic email scanning is paused, but you can upgrade to a premium plan to keep it going. If you decide not to upgrade, you can still use manual tracking and export all your data safely.'
    }
  ]

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] flex flex-col font-sans antialiased selection:bg-[#0066cc]/10 selection:text-[#0066cc]">
      
      {/* 2-Row Navigation Header */}
      <header className="sticky top-0 z-50 w-full flex flex-col select-none">
        {/* Row 1: Global Navigation Bar (44px, Black) */}
        <nav className="h-11 bg-black text-white text-[12px] font-sans border-b border-white/10 flex items-center" aria-label="Global Directory">
          <div className="mx-auto max-w-7xl w-full flex items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2 text-white hover:opacity-85 transition-opacity">
              <span className="text-base font-bold" aria-hidden="true">₹</span>
              <span className="font-semibold tracking-tight">Dhanrakshak</span>
            </Link>

            <div className="flex items-center gap-6 text-zinc-400 font-normal">
              {user ? (
                <Link to={ROUTES.DASHBOARD} className="hover:text-white transition-colors">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to={ROUTES.LOGIN} className="hover:text-white transition-colors">
                    Sign In
                  </Link>
                  <Link to={ROUTES.SIGNUP} className="hover:text-white transition-colors">
                    Create Account
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Row 2: Product Sub-Nav Bar (52px, frosted Translucent) */}
        <div className="h-[52px] border-b border-[#e0e0e0] bg-white/80 backdrop-blur-xl flex items-center">
          <div className="mx-auto max-w-7xl w-full flex items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="text-[17px] font-semibold text-[#1d1d1f] tracking-tight">Dhanrakshak</span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold hidden sm:inline">Automatic Expense Tracker</span>
            </div>
            
            <div className="flex items-center gap-5 text-[12px] font-normal text-zinc-600">
              <a href="#daily-utility" className="hover:text-[#1d1d1f] transition-colors">Daily Life</a>
              <a href="#features" className="hover:text-[#1d1d1f] transition-colors">Features</a>
              <a href="#download" className="hover:text-[#1d1d1f] transition-colors">Download App</a>
              <a href="#faq" className="hover:text-[#1d1d1f] transition-colors">FAQ</a>
              <Link to="/pricing" className="hover:text-[#1d1d1f] transition-colors">Pricing</Link>
              <Link to="/support" className="hover:text-[#1d1d1f] transition-colors">Support</Link>
              {user ? (
                <Link
                  to={ROUTES.DASHBOARD}
                  className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-[#0066cc] hover:bg-[#0071e3] active:scale-95 transition-all cursor-pointer"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  to={ROUTES.SIGNUP}
                  className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-[#0066cc] hover:bg-[#0071e3] active:scale-95 transition-all cursor-pointer"
                >
                  Get Started
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-grow">
        
        {/* TILE 1 (DARK HERO - Full-bleed near-black product showcase) */}
        <section className="w-full bg-[#0a0b0d] text-white py-24 md:py-32 relative overflow-hidden rounded-none border-b border-white/[0.04]">
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.012)_1px,transparent_0)] bg-[size:32px_32px] pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
            {/* Left Column */}
            <div className="lg:col-span-6 text-left space-y-6 z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 font-normal">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2997ff]" />
                <span>100% Secure, Local & Private</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-semibold tracking-tight text-white leading-[1.05] max-w-xl">
                Stop typing your expenses. Let Dhanrakshak track them.
              </h1>
              
              <p className="text-[17px] text-zinc-400 leading-relaxed max-w-md font-normal">
                Tired of writing down every rupee you spend? Dhanrakshak automatically maps your budget from your bank alerts. Safe, automatic, and simple.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                <Link
                  to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP}
                  className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-full text-sm font-semibold text-white bg-[#0066cc] hover:bg-[#0071e3] active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  {user ? 'Go to Dashboard' : 'Start Free Account'}
                </Link>
                <a
                  href="#download"
                  className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-full text-sm font-semibold text-white border border-white/20 hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                >
                  Download App
                </a>
              </div>

              {/* Quick Metrics */}
              <div className="pt-8 grid grid-cols-3 gap-6 max-w-md text-left border-t border-white/[0.05]">
                <div>
                  <p className="text-xl font-mono font-semibold text-white">Zero</p>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">Manual Typing</p>
                </div>
                <div>
                  <p className="text-xl font-mono font-semibold text-[#2997ff]">100%</p>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">Local Scans</p>
                </div>
                <div>
                  <p className="text-xl font-mono font-semibold text-white">All</p>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">Major UPI Banks</p>
                </div>
              </div>
            </div>

            {/* Right Column: Signature Layered Product-UI Mockups */}
            <div className="lg:col-span-6 relative h-[420px] sm:h-[450px] flex items-center justify-center">
              {/* Back card - Card Balance */}
              <div className="absolute w-[280px] sm:w-[320px] bg-[#272729] border border-white/[0.06] rounded-2xl p-6 product-shadow z-10 -translate-y-8 -translate-x-8 -rotate-3 hover:rotate-0 transition-transform duration-300">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">Active Spend Limit</span>
                    <h4 className="text-xs font-semibold text-zinc-200 mt-0.5">Primary Bank Account</h4>
                  </div>
                  <div className="h-6 w-9 rounded bg-white/5 flex items-center justify-center text-[8px] font-bold italic text-zinc-400">VISA</div>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-mono font-medium text-white">₹4,250.00</p>
                  <p className="text-[10px] text-zinc-500">Remaining of ₹15,000 budget limit</p>
                </div>
                <div className="mt-6 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full w-[28%] bg-[#0066cc] rounded-full" />
                </div>
              </div>

              {/* Front Overlapping Card - Live Scan Alert */}
              <div className="absolute w-[290px] sm:w-[310px] bg-[#2a2a2c] border border-[#2997ff]/40 rounded-2xl p-5 product-shadow z-20 translate-y-16 translate-x-12 rotate-2 hover:rotate-0 transition-transform duration-300">
                <div className="flex gap-3 items-center mb-3">
                  <div className="h-8 w-8 rounded-full bg-[#0066cc]/10 flex items-center justify-center text-sm">💡</div>
                  <div>
                    <p className="text-xs font-semibold text-white">Dhanrakshak Auto-Read</p>
                    <p className="text-[9px] text-zinc-400">Bank alert email read instantly</p>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Zomato Food</p>
                    <p className="text-[8px] font-mono text-zinc-500">04 Jun, 23:42</p>
                  </div>
                  <p className="text-sm font-mono font-medium text-white">₹649.00</p>
                </div>
              </div>

              {/* Tiny accessory circular stats floating */}
              <div className="absolute h-20 w-20 bg-[#252527] border border-white/[0.06] rounded-full product-shadow z-30 -translate-y-24 translate-x-28 -rotate-12 flex flex-col items-center justify-center text-center p-2">
                <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">Saved</span>
                <span className="text-xs font-mono font-medium text-[#2997ff]">+12%</span>
              </div>
            </div>
          </div>
        </section>

        {/* TILE 2 (LIGHT TIMELINE - Pure white floor) */}
        <section id="daily-utility" className="w-full bg-[#ffffff] text-[#1d1d1f] py-24 rounded-none border-b border-[#e0e0e0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-20 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0066cc]">Rhythm of Tracking</span>
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-[#1d1d1f] tracking-tight leading-tight">
                A Day in Your Spend Routine
              </h2>
              <p className="text-zinc-500 text-[17px] leading-relaxed">
                See how Dhanrakshak helps you keep track of your money automatically as you go about your day.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Time Card 1 */}
              <div className="bg-[#f5f5f7] rounded-2xl p-8 flex flex-col justify-between hover:bg-[#fafafc] transition-colors duration-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-[#0066cc] uppercase tracking-widest bg-white border border-[#e0e0e0] px-3 py-1 rounded-full">08:30 AM</span>
                    <span className="text-xl">☕</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Morning Tea or Coffee</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    You buy a tea or coffee on your way to work. Your bank sends you an alert email. Dhanrakshak automatically reads the expense and logs it for you. You do not have to type a single thing.
                  </p>
                </div>
              </div>

              {/* Time Card 2 */}
              <div className="bg-[#f5f5f7] rounded-2xl p-8 flex flex-col justify-between hover:bg-[#fafafc] transition-colors duration-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-[#0066cc] uppercase tracking-widest bg-white border border-[#e0e0e0] px-3 py-1 rounded-full">01:15 PM</span>
                    <span className="text-xl">🍔</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Smart Budget Guard</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    You treat yourself to lunch. Dhanrakshak updates your monthly lunch budget immediately. If you are close to your spending limit, the app gently flags it to keep you on track.
                  </p>
                </div>
              </div>

              {/* Time Card 3 */}
              <div className="bg-[#f5f5f7] rounded-2xl p-8 flex flex-col justify-between hover:bg-[#fafafc] transition-colors duration-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-[#0066cc] uppercase tracking-widest bg-white border border-[#e0e0e0] px-3 py-1 rounded-full">10:00 PM</span>
                    <span className="text-xl">📊</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Simple Daily Summary</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Open the app before bed to view a beautiful, easy-to-understand breakdown of what you spent today and how much you saved. Complete clarity without the stress of manual accounts.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TILE 3 (PARCHMENT FEATURES - alternating floor) */}
        <section id="features" className="w-full bg-[#f5f5f7] text-[#1d1d1f] py-24 rounded-none border-b border-[#e0e0e0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
            {/* Left Column */}
            <div className="lg:col-span-6 space-y-8">
              <div className="space-y-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#0066cc]">Product design</span>
                <h2 className="text-3xl sm:text-4xl font-display font-semibold text-[#1d1d1f] tracking-tight leading-tight">
                  Smart, Simple, and 100% Private.
                </h2>
                <p className="text-zinc-500 text-[17px] leading-relaxed">
                  Keeping track of your hard-earned money should not feel like a chore. Dhanrakshak does the heavy lifting for you while keeping your information strictly confidential.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#e0e0e0] flex items-center justify-center text-lg shrink-0">🚀</div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1d1d1f]">Easy Automatic Tracking</h3>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      We automatically read expense alerts from your inbox. You never have to manually enter a single tea, grocery, or dining bill again.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#e0e0e0] flex items-center justify-center text-lg shrink-0">🛡️</div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1d1d1f]">Complete Safety</h3>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      We never ask for your bank login IDs, passwords, PINs, or credit card numbers. Your emails are parsed directly on your device, ensuring maximum privacy.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#e0e0e0] flex items-center justify-center text-lg shrink-0">📱</div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1d1d1f]">Install on Any Phone</h3>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      Download the lightweight app for your Android phone or add it directly to your iPhone home screen in seconds.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Demo Box on White Floor */}
            <div className="lg:col-span-6">
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-8 hover:bg-[#fafafc] transition-colors duration-200">
                <h3 className="text-sm font-semibold text-[#1d1d1f] mb-1 flex items-center gap-2">
                  <span>⚡ Try the Auto-Detector</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-6">
                  Paste any transaction message or notification text below (like "Sent Rs 500 to Zomato") and see how we understand it instantly:
                </p>

                <div className="space-y-4">
                  <textarea
                    value={mockEmail}
                    onChange={(e) => setMockEmail(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-xl p-3.5 text-xs text-[#1d1d1f] focus:outline-none focus:ring-1 focus:ring-[#0066cc] resize-none h-20"
                    placeholder="Enter transaction text..."
                  />
                  
                  <button
                    onClick={handleTestParse}
                    disabled={parsing || !mockEmail.trim()}
                    className="w-full h-11 rounded-full bg-[#0066cc] hover:bg-[#0071e3] text-white text-xs font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {parsing ? 'Reading alert text...' : 'Auto-Read Transaction'}
                  </button>

                  {parsedResult && (
                    <div className="bg-[#f5f5f7] border border-[#e0e0e0] rounded-xl p-4 space-y-2.5 animate-fade-in">
                      <div className="flex justify-between items-center text-[9px] text-zinc-500 font-semibold tracking-wider uppercase border-b border-[#e0e0e0] pb-2">
                        <span>Detected Details</span>
                        <span className="text-[#0066cc] font-bold">{parsedResult.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-[#1d1d1f]">
                        <div>
                          <p className="text-zinc-500 font-normal">Merchant:</p>
                          <p className="font-semibold">{parsedResult.merchant}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 font-normal">Amount spent:</p>
                          <p className="font-semibold font-mono text-[#0066cc]">₹{parsedResult.amount.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 font-normal">Bank:</p>
                          <p className="font-semibold">{parsedResult.bank}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 font-normal">Category:</p>
                          <p className="font-semibold text-zinc-500">{parsedResult.category}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TILE 4 (LIGHT DOWNLOAD - Pure white floor) */}
        <section id="download" className="w-full bg-[#ffffff] text-[#1d1d1f] py-24 rounded-none border-b border-[#e0e0e0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0066cc]">Get the app</span>
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-[#1d1d1f] tracking-tight leading-tight">
                Easy Setup on Mobile
              </h2>
              <p className="text-zinc-500 text-[17px] leading-relaxed">
                Dhanrakshak is lightweight and fast. Download the app directly for your Android phone or link it as a web app on your iPhone.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#f5f5f7] flex items-center justify-center text-sm border border-[#e0e0e0]">⚡</div>
                  <p className="text-xs font-semibold text-zinc-600">Very small size (~3.2 MB)</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#f5f5f7] flex items-center justify-center text-sm border border-[#e0e0e0]">🔒</div>
                  <p className="text-xs font-semibold text-zinc-600">100% safe to install & use</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-[#f5f5f7] border border-[#e0e0e0] rounded-2xl p-8 hover:bg-[#fafafc] transition-colors duration-200">
                {/* Tab Selector */}
                <div className="flex border-b border-[#e0e0e0] mb-6">
                  <button
                    onClick={() => setDownloadTab('android')}
                    className={`flex-1 pb-4 text-sm font-semibold transition-colors cursor-pointer border-b-2 text-center ${
                      downloadTab === 'android' ? 'text-[#0066cc] border-[#0066cc]' : 'text-zinc-400 border-transparent hover:text-zinc-600'
                    }`}
                  >
                    🤖 Android App Download
                  </button>
                  <button
                    onClick={() => setDownloadTab('ios')}
                    className={`flex-1 pb-4 text-sm font-semibold transition-colors cursor-pointer border-b-2 text-center ${
                      downloadTab === 'ios' ? 'text-[#0066cc] border-[#0066cc]' : 'text-zinc-400 border-transparent hover:text-zinc-600'
                    }`}
                  >
                    🍎 iPhone / iOS Setup
                  </button>
                </div>

                {/* Android Content */}
                {downloadTab === 'android' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white rounded-xl p-5 border border-[#e0e0e0] flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <p className="text-xs font-bold text-[#1d1d1f]">Android APK File</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Version 1.0.4 · Official package</p>
                      </div>
                      <a
                        href="/dhanrakshak.apk"
                        download="dhanrakshak.apk"
                        className="inline-flex items-center h-10 px-5 rounded-full text-xs font-semibold text-white bg-[#0066cc] hover:bg-[#0071e3] active:scale-95 transition-colors cursor-pointer"
                      >
                        📥 Download APK
                      </a>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Installation Steps:</p>
                      <ol className="space-y-2 text-xs text-zinc-500 pl-4 list-decimal leading-relaxed">
                        <li>Tap the download button above to download the installer.</li>
                        <li>Open the downloaded `.apk` file from your phone files or notifications.</li>
                        <li>If prompted, approve permission to install packages from sources.</li>
                        <li>Open Dhanrakshak from your home screen and sign in!</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* iOS Content */}
                {downloadTab === 'ios' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white rounded-xl p-5 border border-[#e0e0e0]">
                      <p className="text-xs font-bold text-[#1d1d1f]">iPhone Web App Setup</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Launches full screen right from your iPhone home screen.</p>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Easy iOS Steps:</p>
                      <ul className="space-y-2 text-xs text-zinc-500 leading-relaxed list-disc pl-4">
                        <li>Open Safari browser and go to this web address.</li>
                        <li>Tap the <strong className="text-[#1d1d1f]">Share</strong> icon at the bottom of Safari.</li>
                        <li>Scroll down and choose <strong className="text-[#1d1d1f]">Add to Home Screen</strong>.</li>
                        <li>Name the application and tap <strong className="text-[#1d1d1f]">Add</strong> to complete setup.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* TILE 5 (PARCHMENT FAQs - Alternating floor) */}
        <section id="faq" className="w-full bg-[#f5f5f7] text-[#1d1d1f] py-24 rounded-none border-t border-[#e0e0e0]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0066cc]">Questions</span>
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-[#1d1d1f] tracking-tight leading-tight">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqItems.map((item, idx) => {
                const isOpen = expandedFaq === idx
                return (
                  <div
                    key={idx}
                    className="bg-white border border-[#e0e0e0] rounded-xl overflow-hidden transition-all duration-200"
                  >
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full text-left px-6 py-5 flex items-center justify-between font-semibold text-sm text-[#1d1d1f] hover:text-[#0066cc] transition-colors cursor-pointer"
                    >
                      <span>{item.q}</span>
                      <span className="text-lg text-[#0066cc] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
                        ＋
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-6 text-sm text-zinc-500 leading-relaxed border-t border-[#e0e0e0]/50 pt-4 animate-fade-in">
                        {item.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* TILE 6 (DARK BOTTOM BANNER - Full-bleed near-black CTA) */}
        <section className="w-full bg-[#0a0b0d] text-white py-24 text-center relative overflow-hidden border-t border-white/[0.04]">
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.01)_1px,transparent_0)] bg-[size:32px_32px] pointer-events-none" />
          
          <div className="max-w-2xl mx-auto space-y-6 relative z-10 px-4">
            <h2 className="text-3xl font-display font-semibold text-white tracking-tight leading-tight">
              Ready to automate your savings?
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Create a free account in less than 60 seconds. You can delete or export your records anytime.
            </p>
            <div className="pt-4">
              <Link
                to={user ? ROUTES.DASHBOARD : ROUTES.SIGNUP}
                className="inline-flex items-center justify-center h-12 px-8 rounded-full text-sm font-semibold text-white bg-[#0066cc] hover:bg-[#0071e3] active:scale-95 transition-all duration-200 cursor-pointer"
              >
                {user ? 'Go to Dashboard' : 'Get Started Free'}
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#e0e0e0] bg-[#ffffff] py-12 text-[#1d1d1f] text-[12px] font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#1d1d1f]">₹</span>
              <span className="font-semibold tracking-tight text-[#1d1d1f] text-sm">
                Dhanrakshak
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">© 2026 Dhanrakshak. Built with privacy by design.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 font-semibold text-zinc-500">
            <Link to={ROUTES.PRIVACY} className="hover:text-[#0066cc] transition-colors">Privacy Policy</Link>
            <Link to={ROUTES.TERMS} className="hover:text-[#0066cc] transition-colors">Terms of Service</Link>
            <Link to={ROUTES.ABOUT} className="hover:text-[#0066cc] transition-colors">About</Link>
            <Link to="/support" className="hover:text-[#0066cc] transition-colors">Support Center</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
