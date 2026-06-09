// ============================================
// PricingPage — Supabaze Design Language version
// Premium layout with glowing grids, dual-tone wordmarks, and brand showcases
// ============================================

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { useAuth, useToast } from '@/context'

// ── Feature list shared by all tiers ──────────────────────────
const FEATURES = [
  'Automated Gmail inbox transaction parsing',
  'Real-time expense categorisation engine',
  'Multi-card limit and threshold tracking',
  'Visual budget charts & spending history',
  'Subscription renewal calendar',
  'Encrypted CSV & JSON data export',
  'Priority support — response within 24 h',
  'Early access to upcoming features',
]

export default function PricingPage() {
  const navigate = useNavigate()
  const { user, profile, updateSubscriptionStatus, daysLeft, openAuthModal } = useAuth()
  const { showToast } = useToast()

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'promo'>('razorpay')
  const [promoCode, setPromoCode] = useState('')
  const [processing, setProcessing] = useState(false)

  const isActive  = profile?.subscription_status === 'active'
  const isTrial   = profile?.subscription_status === 'trial'
  const isPro     = isActive && profile?.subscription_plan_type !== 'monthly'

  const planName  = selectedPlan === 'annual' ? 'Pro' : 'Basic'
  const planPrice = selectedPlan === 'annual' ? '365' : '31'
  const planSub   = selectedPlan === 'annual' ? 'Billed once per year' : 'Billed every month'

  useEffect(() => { document.title = 'Pricing & Plans | Dhanrakshak' }, [])

  useEffect(() => {
    if (isActive && profile?.subscription_plan_type === 'monthly') {
      setSelectedPlan('annual')
    }
  }, [isActive, profile])

  // ── Razorpay ──────────────────────────────────────────────────
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload  = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  const handleRazorpayCheckout = async () => {
    if (!user) { showToast('Please log in to upgrade your plan.', 'warning'); openAuthModal('/pricing'); return }
    setProcessing(true)
    const scriptLoaded = await loadRazorpayScript()
    if (!scriptLoaded) { showToast('Failed to load Razorpay SDK. Check your internet.', 'error'); setProcessing(false); return }
    try {
      const response  = await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planType: selectedPlan, userId: user.id }) })
      const orderData = await response.json()
      if (!response.ok || orderData.error) throw new Error(orderData.error || 'Could not initiate payment order')

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: orderData.amount, currency: orderData.currency,
        name: 'Dhanrakshak', description: `Upgrade to ${planName} Plan`,
        order_id: orderData.id,
        prefill: { name: profile?.full_name || '', email: user.email || '' },
        theme: { color: '#3ecf8e' },
        handler: async (paymentResponse: any) => {
          setProcessing(true)
          try {
            const verifyResponse = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...paymentResponse, userId: user.id, planType: selectedPlan }) })
            const verifyData = await verifyResponse.json()
            if (!verifyResponse.ok || verifyData.error) throw new Error(verifyData.error || 'Payment verification failed')
            
            // Instantly update local subscription status and local storage to prevent override to trial
            await updateSubscriptionStatus('active', selectedPlan)

            showToast(`👑 Payment Successful! ${planName} features unlocked.`, 'success')
            navigate('/payment-success', { state: { planName, expiresAt: verifyData.expiresAt } })
          } catch (err: any) { showToast(`Verification Failed: ${err.message}`, 'error') }
          finally { setProcessing(false) }
        },
        modal: { ondismiss: () => setProcessing(false) },
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', (response: any) => {
        showToast(`Payment Failed: ${response.error.description || 'Unknown error'}`, 'error')
        setProcessing(false)
      })
      rzp.open()
    } catch (err: any) { showToast(`Checkout error: ${err.message}`, 'error'); setProcessing(false) }
  }

  const handleSelectPlan = (plan: 'monthly' | 'annual') => {
    if (!user) {
      showToast('Please sign in or create an account to proceed.', 'warning')
      openAuthModal('/pricing')
      return
    }
    setSelectedPlan(plan)
    setPaymentMethod('razorpay')
    const checkoutElem = document.getElementById('checkout-section')
    if (checkoutElem) {
      checkoutElem.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleSelectPromo = () => {
    if (!user) {
      showToast('Please sign in or create an account to redeem a coupon.', 'warning')
      openAuthModal('/pricing')
      return
    }
    setPaymentMethod('promo')
    const checkoutElem = document.getElementById('checkout-section')
    if (checkoutElem) {
      checkoutElem.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // ── Promo code ────────────────────────────────────────────────
  const handlePromoSimulator = () => {
    if (!user) {
      showToast('Please log in to redeem a promo code.', 'warning')
      openAuthModal('/pricing')
      return
    }
    const enteredCode = promoCode.trim()
    const validCodes = ['DHANVIP', 'UNLIMITED_VIP', 'FREE_LIFETIME', 'ITZPIYUSH', 'INVESTOR_UNLIMITED']
    
    // DHANI2007 is case-sensitive as requested
    const isSpecialCode = enteredCode === 'DHANI2007'
    const isStandardCode = validCodes.includes(enteredCode.toUpperCase())
    
    if (!isSpecialCode && !isStandardCode) {
      showToast('❌ Invalid or expired coupon code.', 'error')
      return
    }
    setProcessing(true)
    setTimeout(async () => {
      try {
        const success = await updateSubscriptionStatus('active', 'lifetime', enteredCode)
        if (success) { showToast('👑 Unlimited VIP lifetime access unlocked!', 'success'); navigate('/dashboard') }
        else showToast('Failed to apply coupon. Please try again.', 'error')
      } catch (err: any) { showToast('Coupon error: ' + err.message, 'error') }
      finally { setProcessing(false) }
    }, 1500)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>

        {/* ── HEADER CARD WITH GRADIENT GLOWS ──────────────── */}
        <div className="relative rounded-3xl overflow-hidden border border-border-subtle bg-surface-1 p-8 sm:p-10 shadow-md">
          {/* Gradient glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Verify Dhanrakshak Financial Security Plans
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white select-none">
              Simple, <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">honest pricing</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Unlock automated transaction logs, AI budget mapping, and offline security. No hidden charges, cancel with one click.
            </p>
          </div>
        </div>

        {/* ── STATUS BANNERS ──────────────────────────────────── */}
        <div className="space-y-3 animate-fade-in">
          {isTrial && daysLeft > 0 && (
            <div className="rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-1 border border-border-subtle shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="text-sm font-bold text-white">Trial Active — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</p>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">Full access to Pro features active. Upgrade to prevent any interruption to your automatic email tracking.</p>
                </div>
              </div>
              <span className="text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">Trial Access</span>
            </div>
          )}

          {(!profile?.subscription_status || (isTrial && daysLeft <= 0)) && (
            <div className="rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-1 border border-border-subtle shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-sm font-bold text-white">Trial Expired — Dashboard Access Restricted</p>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">Upgrade to restore local email parsing, budgets, and priority tracking modules.</p>
                </div>
              </div>
              <span className="text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-wider">Access Locked</span>
            </div>
          )}

          {isActive && (
            <div className="rounded-3xl p-5 flex items-center gap-3 bg-surface-1 border border-border-subtle shadow-md">
              <span className="text-2xl">✅</span>
              <p className="text-sm font-bold text-emerald-400">You are on the {profile?.subscription_plan_type === 'monthly' ? 'Basic' : 'Pro'} Plan — all automation and sync systems are fully active.</p>
            </div>
          )}
        </div>

        {/* ── PRICING CARDS ───────────────────────────────────── */}
        <div className="py-6 animate-fade-in">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">

            {/* ── Standard: Monthly ─────────────────────────────── */}
            <div
              className="rounded-3xl p-8 shadow-md flex flex-col cursor-pointer transition-all duration-300 hover:shadow-lg bg-surface-1 border relative group hover:-translate-y-1"
              style={{ borderColor: selectedPlan === 'monthly' ? 'var(--sb-primary)' : 'var(--border-subtle)', borderWidth: selectedPlan === 'monthly' ? 2 : 1 }}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Basic</h2>
                <input type="radio" readOnly checked={selectedPlan === 'monthly'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-extrabold text-4xl text-white tracking-tight">₹31</span>
                  <span className="text-xs text-zinc-400">/month</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 font-medium">Billed every month · cancel anytime</p>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-border-subtle pt-5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-400 shrink-0 text-sm font-bold">✓</span>
                    <span className="text-xs text-zinc-400 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {isActive && profile?.subscription_plan_type === 'monthly' ? (
                  <button
                    disabled
                    className="w-full justify-center rounded-xl py-3 font-semibold text-xs border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => !isPro && handleSelectPlan('monthly')}
                    disabled={isPro}
                    className={`w-full justify-center rounded-xl py-3 font-semibold text-xs border ${
                      isPro
                        ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed'
                        : 'border-zinc-700 bg-surface-2 hover:bg-zinc-800 text-zinc-300 transition-all active:scale-98 shadow-sm cursor-pointer'
                    }`}
                  >
                    Choose Basic
                  </button>
                )}
              </div>
            </div>

            {/* ── Featured: Annual ── */}
            <div
              className="rounded-3xl p-8 shadow-xl flex flex-col cursor-pointer relative overflow-hidden transition-all duration-300 hover:shadow-2xl bg-surface-1 border relative group hover:-translate-y-1"
              style={{ borderColor: selectedPlan === 'annual' ? 'var(--sb-primary)' : 'var(--border-subtle)', borderWidth: selectedPlan === 'annual' ? 2 : 1 }}
              onClick={() => setSelectedPlan('annual')}
            >
              {/* Best value badge */}
              <div className="absolute top-0 right-0 text-[9px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-bl-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md">
                Best Value · Save 15%
              </div>

              <div className="flex items-center justify-between mb-6 mt-2">
                <h2 className="text-lg font-bold text-white">Pro</h2>
                <input type="radio" readOnly checked={selectedPlan === 'annual'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-extrabold text-4xl text-white tracking-tight">₹365</span>
                  <span className="text-xs text-zinc-400">/year</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">₹1 per day</span>
                  <span className="text-xs text-zinc-400 font-medium">Billed once per year</span>
                </div>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-border-subtle pt-5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-400 shrink-0 text-sm font-bold">✓</span>
                    <span className="text-xs text-zinc-300 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                {isPro ? (
                  <button
                    onClick={() => {
                      if (profile?.subscription_expires_at) {
                        showToast(`Your Pro Plan is active until ${new Date(profile.subscription_expires_at).toLocaleDateString('en-IN')}`, 'info')
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs tracking-wide cursor-pointer hover:bg-emerald-500/20 transition-all select-none"
                    title="Click to view validity"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectPlan('annual')}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98 border border-emerald-400/20"
                  >
                    {isActive && profile?.subscription_plan_type === 'monthly' ? 'Upgrade to Pro' : 'Get Pro'}
                  </button>
                )}
                <p className="text-[10px] text-center text-zinc-500 font-medium">Secured via Razorpay · 256-bit SSL</p>
              </div>
            </div>

            {/* ── Promo / Coupon ────────────────────────────────── */}
            <div
              className="rounded-3xl p-8 shadow-md flex flex-col bg-surface-1 border relative group hover:-translate-y-1"
              style={{ borderColor: 'var(--border-subtle)', borderWidth: 1 }}
            >
              <div className="mb-6">
                <span className="inline-flex items-center bg-surface-2 border border-border-subtle px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-zinc-400">Special Access</span>
                <h2 className="text-lg font-bold text-white mt-4">Coupon Code</h2>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-extrabold text-4xl text-white tracking-tight">Free</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 font-medium">Lifetime access with a valid coupon</p>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-border-subtle pt-5">
                {['All Pro features unlocked', 'Lifetime access status', 'No payment card required', 'Instant dashboard activation'].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-400 shrink-0 text-sm font-bold">✓</span>
                    <span className="text-xs text-zinc-400 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={handleSelectPromo}
                  className="w-full justify-center rounded-xl py-3 font-semibold text-xs border border-zinc-700 bg-surface-2 hover:bg-zinc-800 text-zinc-300 transition-all active:scale-98 shadow-sm cursor-pointer"
                >
                  Enter Coupon Code
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── CHECKOUT SECTION ────────────────────────────────── */}
        {!isPro && (
          <div id="checkout-section" className="max-w-2xl mx-auto pb-12 w-full animate-fade-in">
            {!user ? (
              <div className="rounded-3xl shadow-md bg-surface-1 border border-border-subtle p-8 text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-3xl shadow-sm">
                  🔒
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">Sign in to complete checkout</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-medium max-w-sm mx-auto">
                    To secure your billing and activate automated spends tracking, please log in or create an account first.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => openAuthModal('/pricing', 'login')}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer border border-emerald-400/20 transition-all active:scale-98"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => openAuthModal('/pricing', 'signup')}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl border border-zinc-700 bg-surface-2 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-wide transition-all active:scale-98 shadow-sm cursor-pointer"
                  >
                    Create Account
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                  Standard stepwise checkout · 100% Secure & encrypted
                </p>
              </div>
            ) : (
              <div className="rounded-3xl shadow-md bg-surface-1 border border-border-subtle overflow-hidden">

                {/* Tab switcher */}
                <div className="flex bg-surface-2/40 border-b border-border-subtle">
                  {([['razorpay', '💳 Pay Securely'], ['promo', '🎟️ Promo Code']] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setPaymentMethod(tab)}
                      className="flex-1 py-4 text-xs cursor-pointer transition-colors border-none bg-transparent font-bold"
                      style={{
                        color: paymentMethod === tab ? 'var(--sb-primary)' : 'var(--text-zinc-500)',
                        borderBottom: paymentMethod === tab ? '2px solid var(--sb-primary)' : '2px solid transparent',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-8 space-y-6">

                  {/* ── Razorpay flow ─────────────────────────────── */}
                  {paymentMethod === 'razorpay' && (
                    <div className="space-y-6 animate-fade-in">
                      {/* Order summary card */}
                      <div className="rounded-2xl p-5 flex justify-between items-start bg-surface-2/40 border border-border-subtle/50">
                        <div>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Order Summary</p>
                          <p className="text-lg mt-2 font-extrabold text-white">{planName} Plan</p>
                          <p className="text-xs text-zinc-400 font-medium mt-0.5">{planSub}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-2xl text-white tracking-tight">₹{planPrice}</p>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">incl. GST</p>
                        </div>
                      </div>

                      {/* Plan picker */}
                      <div className="flex gap-3">
                        {(['annual', 'monthly'] as const).map((plan) => (
                          <button
                            key={plan}
                            onClick={() => setSelectedPlan(plan)}
                            className="flex-1 py-3 rounded-xl text-xs cursor-pointer transition-all bg-transparent border font-bold"
                            style={{
                              color: selectedPlan === plan ? 'var(--sb-primary)' : 'var(--text-zinc-400)',
                              borderColor: selectedPlan === plan ? 'var(--sb-primary)' : 'var(--border-subtle)',
                            }}
                          >
                            {plan === 'annual' ? 'Annual — ₹365/yr' : 'Monthly — ₹31/mo'}
                          </button>
                        ))}
                      </div>

                      {/* Trust bar */}
                      <div className="rounded-2xl p-3 flex flex-wrap items-center justify-center gap-2 bg-surface-2/40 border border-border-subtle/50">
                        {['UPI', 'Debit/Credit Cards', 'NetBanking', 'Google Pay', 'PhonePe'].map((m) => (
                          <span key={m} className="text-[10px] px-3 py-1 rounded-full bg-surface-1 border border-border-subtle text-zinc-400 font-bold uppercase tracking-wider">{m}</span>
                        ))}
                      </div>

                      <button
                        onClick={handleRazorpayCheckout}
                        disabled={processing}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98 border border-emerald-400/20"
                        style={{ opacity: processing ? 0.6 : 1 }}
                      >
                        {processing ? 'Opening secure checkout…' : `Pay ₹${planPrice} & Activate ${planName}`}
                      </button>

                      <p className="text-[10px] text-center text-zinc-500 font-semibold uppercase tracking-wider">
                        🔒 Secured with bank-grade 256-bit SSL encryption · Powered by Razorpay
                      </p>
                    </div>
                  )}

                  {/* ── Promo flow ────────────────────────────────── */}
                  {paymentMethod === 'promo' && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="rounded-2xl p-4 bg-emerald-500/5 border border-emerald-500/25">
                        <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                          🎟️ <strong className="text-white">Have a promo code?</strong> Enter your exclusive code below to unlock lifetime access to all tracking, backup, and dashboard automation tools instantly.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] block font-bold uppercase tracking-widest text-zinc-500">Promo Code</label>
                          <input
                            className="w-full bg-surface-2 border border-border-subtle/50 text-zinc-200 text-sm rounded-xl px-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-400 transition-all uppercase font-semibold tracking-wider"
                            type="text"
                            placeholder="e.g. DHANVIP"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePromoSimulator()}
                          />
                        </div>
                        <button
                          onClick={handlePromoSimulator}
                          disabled={processing || !promoCode.trim()}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98 border border-emerald-400/20"
                          style={{ opacity: processing || !promoCode.trim() ? 0.5 : 1 }}
                        >
                          {processing ? 'Applying promo coupon…' : 'Redeem Code & Activate'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* Refund note */}
            <p className="text-xs text-center mt-6 text-zinc-500 font-medium">
              Have questions?{' '}
              <Link to="/support" className="text-emerald-400 no-underline hover:underline font-bold">Contact support</Link> · All plans include a 7-day hassle-free refund policy.
            </p>
          </div>
        )}

        {/* ── BRAND PROMISE SECTION (THE DHANRAKSHAK STANDARD) ───── */}
        <div className="border-t border-border-subtle py-16 animate-fade-in">
          <div className="mx-auto max-w-7xl">
            <div className="text-center max-w-xl mx-auto mb-12 space-y-4">
              <span className="inline-flex items-center bg-surface-1 border border-border-subtle px-3 py-1 rounded-full text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">The Dhanrakshak Standard</span>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Built on Privacy & Local Isolation</h2>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                We believe your banking transcripts are private. Dhanrakshak is designed from the ground up to prevent data brokerage.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="rounded-3xl bg-surface-1 border border-border-subtle p-6 space-y-4 shadow-md hover:shadow-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400 shadow-sm animate-pulse">
                  🔒
                </div>
                <h3 className="font-bold text-white text-base">Local parsing sandbox</h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  Your inbox scans happen client-side directly in your browser. We never upload raw emails or transcripts to external clouds.
                </p>
              </div>

              <div className="rounded-3xl bg-surface-1 border border-border-subtle p-6 space-y-4 shadow-md hover:shadow-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400 shadow-sm animate-pulse">
                  🛡️
                </div>
                <h3 className="font-bold text-white text-base">Read-only mail scans</h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  Our Google authentication API permissions are strictly read-only. We have no authority to initiate transfers or drafts.
                </p>
              </div>

              <div className="rounded-3xl bg-surface-1 border border-border-subtle p-6 space-y-4 shadow-md hover:shadow-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400 shadow-sm animate-pulse">
                  🔑
                </div>
                <h3 className="font-bold text-white text-base">No passwords required</h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  We never prompt for net-banking passwords, PIN numbers, OTPs, or card security details. Your bank credentials remain isolated.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  )
}
