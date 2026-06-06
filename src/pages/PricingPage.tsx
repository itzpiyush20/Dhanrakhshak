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
  const { user, profile, updateSubscriptionStatus, daysLeft } = useAuth()
  const { showToast } = useToast()

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'promo'>('razorpay')
  const [promoCode, setPromoCode] = useState('')
  const [processing, setProcessing] = useState(false)

  const planName  = selectedPlan === 'annual' ? 'Investor Annual' : 'Starter Monthly'
  const planPrice = selectedPlan === 'annual' ? '365' : '31'
  const planSub   = selectedPlan === 'annual' ? 'Billed once per year' : 'Billed every month'

  useEffect(() => { document.title = 'Pricing & Plans | Dhanrakshak' }, [])

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
    if (!user) { showToast('Please log in to upgrade to Premium.', 'warning'); navigate('/login'); return }
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
        name: 'Dhanrakshak', description: `Upgrade to Premium (${planName})`,
        order_id: orderData.id,
        prefill: { name: profile?.full_name || '', email: user.email || '' },
        theme: { color: '#3ecf8e' },
        handler: async (paymentResponse: any) => {
          setProcessing(true)
          try {
            const verifyResponse = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...paymentResponse, userId: user.id, planType: selectedPlan }) })
            const verifyData = await verifyResponse.json()
            if (!verifyResponse.ok || verifyData.error) throw new Error(verifyData.error || 'Payment verification failed')
            showToast('👑 Payment Successful! Premium features unlocked.', 'success')
            navigate('/payment-success', { state: { planName, expiresAt: verifyData.expiresAt } })
          } catch (err: any) { showToast(`Verification Failed: ${err.message}`, 'error') }
          finally { setProcessing(false) }
        },
        modal: { ondismiss: () => setProcessing(false) },
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch (err: any) { showToast(`Checkout error: ${err.message}`, 'error'); setProcessing(false) }
  }

  // ── Promo code ────────────────────────────────────────────────
  const handlePromoSimulator = () => {
    const validCodes = ['DHANVIP', 'UNLIMITED_VIP', 'FREE_LIFETIME', 'ITZPIYUSH', 'INVESTOR_UNLIMITED']
    if (!validCodes.includes(promoCode.trim().toUpperCase())) { showToast('❌ Invalid or expired coupon code.', 'error'); return }
    setProcessing(true)
    setTimeout(async () => {
      try {
        const success = await updateSubscriptionStatus('active', 'lifetime')
        if (success) { showToast('👑 Unlimited VIP lifetime access unlocked!', 'success'); navigate('/dashboard') }
        else showToast('Failed to apply coupon. Please try again.', 'error')
      } catch (err: any) { showToast('Coupon error: ' + err.message, 'error') }
      finally { setProcessing(false) }
    }, 1500)
  }

  const isActive  = profile?.subscription_status === 'active'
  const isTrial   = profile?.subscription_status === 'trial'

  // ── Render ────────────────────────────────────────────────────
  return (
    <AppLayout isStaticLight={true}>
      <div className="min-h-screen bg-sb-canvas-soft" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>

        {/* ── HEADER BAND WITH GRID PATTERN & GLOWS ──────────────── */}
        <div className="relative py-24 text-center border-b border-sb-hairline bg-sb-canvas overflow-hidden">
          {/* Grid background & gradient glow */}
          <div className="absolute inset-0 bg-grid-pattern opacity-75 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/5 blur-[120px] pointer-events-none" />
          
          <div className="relative mx-auto max-w-[800px] px-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 text-xs font-semibold tracking-wide shadow-sm animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Verify Dhanrakshak Financial Security Plans
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight select-none">
              Simple, <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">honest pricing</span>
            </h1>
            <p className="sb-body-md text-zinc-500 max-w-[500px] mx-auto leading-relaxed">
              Unlock automated transaction logs, AI budget mapping, and offline security. No hidden charges, cancel with one click.
            </p>
          </div>
        </div>

        {/* ── STATUS BANNERS ──────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 pt-10 space-y-3 animate-fade-in">
          {isTrial && daysLeft > 0 && (
            <div className="rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-sb-canvas border border-sb-hairline shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="sb-caption font-bold text-white">Trial Active — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</p>
                  <p className="text-xs text-zinc-500 font-medium">Full access to premium features active. Upgrade to prevent any interruption to your automatic email tracking.</p>
                </div>
              </div>
              <span className="sb-micro px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-amber-50 text-amber-800 border border-amber-200/50 font-semibold shadow-inner">Trial Access</span>
            </div>
          )}

          {(!profile?.subscription_status || (isTrial && daysLeft <= 0)) && (
            <div className="rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-sb-canvas border border-sb-hairline shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="sb-caption font-bold text-white">Trial Expired — Dashboard Access Restricted</p>
                  <p className="text-xs text-zinc-500 font-medium">Upgrade to restore local email parsing, budgets, and priority tracking modules.</p>
                </div>
              </div>
              <span className="sb-micro px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-red-50 text-red-800 border border-red-200/50 font-semibold shadow-inner">Access Locked</span>
            </div>
          )}

          {isActive && (
            <div className="rounded-2xl p-4 flex items-center gap-3 bg-sb-canvas border border-sb-hairline shadow-sm">
              <span className="text-2xl">✅</span>
              <p className="sb-caption font-bold text-emerald-600">You are on Premium — all automation and sync systems are fully active.</p>
            </div>
          )}
        </div>

        {/* ── PRICING CARDS ───────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 py-12">
          <div className="grid md:grid-cols-3 gap-8 items-stretch">

            {/* ── Standard: Monthly ─────────────────────────────── */}
            <div
              className="sb-card-light rounded-2xl shadow-sm flex flex-col cursor-pointer transition-all duration-300 hover:shadow-md bg-sb-canvas relative group hover:-translate-y-1"
              style={{ borderColor: selectedPlan === 'monthly' ? 'var(--sb-primary)' : 'var(--sb-hairline)', borderWidth: selectedPlan === 'monthly' ? 2 : 1 }}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black text-white">Starter Monthly</h2>
                <input type="radio" readOnly checked={selectedPlan === 'monthly'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-4xl text-white tracking-tight">₹31</span>
                  <span className="sb-caption text-zinc-500">/month</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 font-medium">Billed every month · cancel anytime</p>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-sb-hairline-cool pt-5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-500 shrink-0 text-sm font-black">✓</span>
                    <span className="text-xs text-zinc-500 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => { setSelectedPlan('monthly'); setPaymentMethod('razorpay') }}
                  className="sb-btn-secondary w-full justify-center rounded-xl py-3 font-semibold text-xs border border-border-default/60 hover:bg-zinc-100 transition-all active:scale-98 shadow-sm cursor-pointer"
                >
                  Choose Monthly
                </button>
              </div>
            </div>

            {/* ── Featured: Annual (Inverted Canvas Night dark card) ── */}
            <div
              className="sb-card-dark rounded-2xl shadow-xl flex flex-col cursor-pointer relative overflow-hidden transition-all duration-300 hover:shadow-2xl bg-sb-canvas-night hover:-translate-y-1"
              style={{ borderColor: selectedPlan === 'annual' ? 'var(--sb-primary)' : 'rgba(255,255,255,0.12)', borderWidth: selectedPlan === 'annual' ? 2 : 1 }}
              onClick={() => setSelectedPlan('annual')}
            >
              {/* Best value badge */}
              <div className="absolute top-0 right-0 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-bl-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md">
                Best Value · Save 15%
              </div>

              <div className="flex items-center justify-between mb-6 mt-2">
                <h2 className="text-lg font-black text-static-white">Investor Annual</h2>
                <input type="radio" readOnly checked={selectedPlan === 'annual'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-4xl text-static-white tracking-tight">₹365</span>
                  <span className="sb-caption text-static-zinc-400">/year</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="sb-micro px-2 py-0.5 rounded-full bg-[rgba(62,207,142,0.15)] text-sb-primary border border-[rgba(62,207,142,0.3)] font-bold">₹1 per day</span>
                  <span className="text-xs text-static-zinc-400 font-medium">Billed once per year</span>
                </div>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-static-zinc-800 pt-5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-400 shrink-0 text-sm font-black">✓</span>
                    <span className="text-xs text-static-zinc-300 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => { setSelectedPlan('annual'); setPaymentMethod('razorpay') }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98 border border-emerald-400/20"
                >
                  Get Investor Annual
                </button>
                <p className="text-[10px] text-center text-static-zinc-500 font-medium">Secured via Razorpay · 256-bit SSL</p>
              </div>
            </div>

            {/* ── Promo / Coupon ────────────────────────────────── */}
            <div
              className="sb-card-light rounded-2xl shadow-sm flex flex-col bg-sb-canvas relative group hover:-translate-y-1"
              style={{ borderColor: 'var(--sb-hairline)', borderWidth: 1 }}
            >
              <div className="mb-6">
                <span className="sb-pill-tag-soft">Special Access</span>
                <h2 className="text-lg font-black text-white mt-4">Coupon Code</h2>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-4xl text-white tracking-tight">Free</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 font-medium">Lifetime access with a valid coupon</p>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-sb-hairline-cool pt-5">
                {['All Premium features unlocked', 'Lifetime access status', 'No payment card required', 'Instant dashboard activation'].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-emerald-500 shrink-0 text-sm font-black">✓</span>
                    <span className="text-xs text-zinc-500 font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => setPaymentMethod('promo')}
                  className="sb-btn-secondary w-full justify-center rounded-xl py-3 font-semibold text-xs border border-border-default/60 hover:bg-zinc-100 transition-all active:scale-98 shadow-sm cursor-pointer"
                >
                  Enter Coupon Code
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── CHECKOUT SECTION ────────────────────────────────── */}
        <div className="mx-auto max-w-[680px] px-6 pb-12">
          <div className="sb-card-light rounded-2xl shadow-md bg-sb-canvas border border-sb-hairline" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Tab switcher */}
            <div className="flex bg-sb-canvas-soft" style={{ borderBottom: '1px solid var(--sb-hairline)' }}>
              {([['razorpay', '💳 Pay Securely'], ['promo', '🎟️ Promo Code']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPaymentMethod(tab)}
                  className="flex-1 py-4 text-xs cursor-pointer transition-colors border-none bg-transparent"
                  style={{
                    color: paymentMethod === tab ? 'var(--sb-primary)' : 'var(--sb-ink-muted)',
                    borderBottom: paymentMethod === tab ? '2px solid var(--sb-primary)' : '2px solid transparent',
                    fontWeight: paymentMethod === tab ? 700 : 500,
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
                  <div className="rounded-xl p-5 flex justify-between items-start bg-sb-canvas-soft border border-sb-hairline">
                    <div>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Order Summary</p>
                      <p className="sb-heading-md mt-2 font-extrabold text-white">{planName} Plan</p>
                      <p className="text-xs text-zinc-500 font-medium mt-0.5">{planSub}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-2xl text-white tracking-tight">₹{planPrice}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">incl. GST</p>
                    </div>
                  </div>

                  {/* Plan picker */}
                  <div className="flex gap-3">
                    {(['annual', 'monthly'] as const).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => setSelectedPlan(plan)}
                        className="flex-1 py-3 rounded-xl text-xs cursor-pointer transition-all bg-transparent"
                        style={{
                          color: selectedPlan === plan ? 'var(--sb-primary)' : 'var(--sb-ink-muted)',
                          border: selectedPlan === plan ? '1px solid var(--sb-primary)' : '1px solid var(--sb-hairline)',
                          fontWeight: selectedPlan === plan ? 700 : 500,
                        }}
                      >
                        {plan === 'annual' ? 'Annual — ₹365/yr' : 'Monthly — ₹31/mo'}
                      </button>
                    ))}
                  </div>

                  {/* Trust bar */}
                  <div className="rounded-xl p-3 flex flex-wrap items-center justify-center gap-3 bg-sb-canvas-soft border border-sb-hairline">
                    {['UPI', 'Debit/Credit Cards', 'NetBanking', 'Google Pay', 'PhonePe'].map((m) => (
                      <span key={m} className="text-[10px] px-3 py-1 rounded-full bg-sb-canvas border border-sb-hairline text-zinc-500 font-bold uppercase tracking-wider">{m}</span>
                    ))}
                  </div>

                  <button
                    onClick={handleRazorpayCheckout}
                    disabled={processing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98 border border-emerald-400/20"
                    style={{ opacity: processing ? 0.6 : 1 }}
                  >
                    {processing ? 'Opening secure checkout…' : `Pay ₹${planPrice} & Activate Premium`}
                  </button>

                  <p className="text-[10px] text-center text-zinc-500 font-medium">
                    🔒 Secured with bank-grade 256-bit SSL encryption · Powered by Razorpay
                  </p>
                </div>
              )}

              {/* ── Promo flow ────────────────────────────────── */}
              {paymentMethod === 'promo' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="rounded-xl p-4 bg-emerald-500/5 border border-emerald-500/25">
                    <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                      🎟️ <strong className="text-white font-bold">Have a promo code?</strong> Enter your exclusive code below to unlock lifetime access to all tracking, backup, and dashboard automation tools instantly.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] block mb-2 font-bold uppercase tracking-widest text-zinc-400">Promo Code</label>
                      <input
                        className="sb-text-input rounded-xl border border-border-default bg-sb-canvas-soft text-white px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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

          {/* Refund note */}
          <p className="text-xs text-center mt-6 text-zinc-500 font-medium">
            Have questions?{' '}
            <Link to="/support" className="text-sb-primary no-underline hover:underline font-bold">Contact support</Link> · All plans include a 7-day hassle-free refund policy.
          </p>
        </div>

        {/* ── BRAND PROMISE SECTION (THE DHANRAKSHAK STANDARD) ───── */}
        <div className="border-t border-sb-hairline bg-sb-canvas py-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <div className="text-center max-w-xl mx-auto mb-16 space-y-4">
              <span className="sb-pill-tag-soft">The Dhanrakshak Standard</span>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Built on Privacy & Local Isolation</h2>
              <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                We believe your banking transcripts are private. Dhanrakshak is designed from the ground up to prevent data brokerage.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="sb-card-light bg-sb-canvas-soft border border-sb-hairline rounded-2xl p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-600 shadow-sm">
                  🔒
                </div>
                <h3 className="font-bold text-white text-base">Local parsing sandbox</h3>
                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                  Your inbox scans happen client-side directly in your browser. We never upload raw emails or transcripts to external clouds.
                </p>
              </div>

              <div className="sb-card-light bg-sb-canvas-soft border border-sb-hairline rounded-2xl p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-600 shadow-sm">
                  🛡️
                </div>
                <h3 className="font-bold text-white text-base">Read-only mail scans</h3>
                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                  Our Google authentication API permissions are strictly read-only. We have no authority to initiate transfers or drafts.
                </p>
              </div>

              <div className="sb-card-light bg-sb-canvas-soft border border-sb-hairline rounded-2xl p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-600 shadow-sm">
                  🔑
                </div>
                <h3 className="font-bold text-white text-base">No passwords required</h3>
                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
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
