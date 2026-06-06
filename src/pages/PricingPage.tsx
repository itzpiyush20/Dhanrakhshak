// ============================================
// PricingPage — Supabaze Design Language version
// White standard cards, inverted dark featured card, 6px buttons, green accents
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

        {/* ── HEADER BAND ─────────────────────────────────────── */}
        <div className="py-16 text-center border-b border-sb-hairline bg-sb-canvas">
          <div className="mx-auto max-w-[700px] px-6 space-y-4">
            <div className="sb-pill-tag-soft">Pricing & Plans</div>
            <h1 className="sb-display-xl" style={{ color: 'var(--sb-ink)' }}>
              Simple, honest pricing
            </h1>
            <p className="sb-body-lg" style={{ color: 'var(--sb-ink-muted)', maxWidth: 480, margin: '0 auto' }}>
              Gain full automated tracking with any plan. No hidden fees, no dark patterns. Cancel at any time.
            </p>
          </div>
        </div>

        {/* ── STATUS BANNERS ──────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 pt-8 space-y-3">
          {isTrial && daysLeft > 0 && (
            <div className="rounded-[6px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-sb-canvas border border-sb-hairline shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>Trial Active — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</p>
                  <p className="sb-caption" style={{ color: 'var(--sb-ink-muted)' }}>Full premium access including automated Gmail Sync. Upgrade to keep it after your trial ends.</p>
                </div>
              </div>
              <span className="sb-micro px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-amber-50 text-amber-800 border border-amber-200">Trial access</span>
            </div>
          )}

          {(!profile?.subscription_status || (isTrial && daysLeft <= 0)) && (
            <div className="rounded-[6px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-sb-canvas border border-sb-hairline shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>Trial Expired — Dashboard Gated</p>
                  <p className="sb-caption" style={{ color: 'var(--sb-ink-muted)' }}>Upgrade to restore access to analytics, expenses, and automated email scans.</p>
                </div>
              </div>
              <span className="sb-micro px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-red-50 text-red-800 border border-red-200">Access locked</span>
            </div>
          )}

          {isActive && (
            <div className="rounded-[6px] p-4 flex items-center gap-3 bg-sb-canvas border border-sb-hairline shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <span className="text-2xl">✅</span>
              <p className="sb-caption font-semibold" style={{ color: '#16a34a' }}>You're on Premium — all features are fully unlocked.</p>
            </div>
          )}
        </div>

        {/* ── PRICING CARDS ───────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 py-12">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">

            {/* ── Standard: Monthly ─────────────────────────────── */}
            <div
              className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-col cursor-pointer transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] bg-sb-canvas"
              style={{ borderColor: selectedPlan === 'monthly' ? 'var(--sb-primary)' : 'var(--sb-hairline)', borderWidth: selectedPlan === 'monthly' ? 2 : 1 }}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="sb-heading-lg" style={{ color: 'var(--sb-ink)' }}>Starter Monthly</h2>
                <input type="radio" readOnly checked={selectedPlan === 'monthly'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-4xl" style={{ color: 'var(--sb-ink)', letterSpacing: '-0.8px', fontFamily: 'Inter' }}>₹31</span>
                  <span className="sb-caption" style={{ color: 'var(--sb-ink-muted)' }}>/month</span>
                </div>
                <p className="sb-caption mt-1" style={{ color: 'var(--sb-ink-muted)' }}>Billed every month · cancel anytime</p>
              </div>

              <ul className="space-y-3 flex-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--sb-primary)', flexShrink: 0, fontSize: 13, marginTop: 1, fontWeight: 'bold' }}>✓</span>
                    <span className="sb-caption" style={{ color: 'var(--sb-ink-secondary)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => { setSelectedPlan('monthly'); setPaymentMethod('razorpay') }}
                  className="sb-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Choose Monthly
                </button>
              </div>
            </div>

            {/* ── Featured: Annual (Inverted Canvas Night dark card) ── */}
            <div
              className="sb-card-dark shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex flex-col cursor-pointer relative overflow-hidden transition-all duration-200"
              style={{ borderColor: selectedPlan === 'annual' ? 'var(--sb-primary)' : 'rgba(255,255,255,0.15)', borderWidth: selectedPlan === 'annual' ? 2 : 1 }}
              onClick={() => setSelectedPlan('annual')}
            >
              {/* Best value badge */}
              <div className="absolute top-0 right-0 text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-bl-xl bg-sb-primary text-sb-on-primary" style={{ letterSpacing: '0.08em' }}>
                Best value · Save 15%
              </div>

              <div className="flex items-center justify-between mb-6 mt-2">
                <h2 className="sb-heading-lg" style={{ color: 'var(--sb-on-dark)' }}>Investor Annual</h2>
                <input type="radio" readOnly checked={selectedPlan === 'annual'} className="h-4 w-4 cursor-pointer accent-[#3ecf8e]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-4xl" style={{ color: 'var(--sb-on-dark)', letterSpacing: '-0.8px', fontFamily: 'Inter' }}>₹365</span>
                  <span className="sb-caption" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>/year</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="sb-micro px-2 py-0.5 rounded-full bg-[rgba(62,207,142,0.15)] text-sb-primary border border-[rgba(62,207,142,0.3)]">₹1 per day</span>
                  <span className="sb-caption" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Billed once per year</span>
                </div>
              </div>

              <ul className="space-y-3 flex-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--sb-primary)', flexShrink: 0, fontSize: 13, marginTop: 1, fontWeight: 'bold' }}>✓</span>
                    <span className="sb-caption" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => { setSelectedPlan('annual'); setPaymentMethod('razorpay') }}
                  className="sb-btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Get Investor Annual
                </button>
                <p className="sb-micro text-center text-sb-ink-muted">Secured via Razorpay · 256-bit SSL</p>
              </div>
            </div>

            {/* ── Promo / Coupon ────────────────────────────────── */}
            <div className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-col bg-sb-canvas" style={{ borderColor: 'var(--sb-hairline)' }}>
              <div className="mb-6">
                <span className="sb-pill-tag-soft">Special Access</span>
                <h2 className="sb-heading-lg mt-4" style={{ color: 'var(--sb-ink)' }}>Coupon Code</h2>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-4xl" style={{ color: 'var(--sb-ink)', letterSpacing: '-0.8px', fontFamily: 'Inter' }}>Free</span>
                </div>
                <p className="sb-caption mt-1" style={{ color: 'var(--sb-ink-muted)' }}>Lifetime access with a valid coupon</p>
              </div>

              <ul className="space-y-3 flex-1">
                {['All Premium features', 'Lifetime access', 'No payment required', 'Instant activation'].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--sb-primary)', flexShrink: 0, fontSize: 13, marginTop: 1, fontWeight: 'bold' }}>✓</span>
                    <span className="sb-caption" style={{ color: 'var(--sb-ink-secondary)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => setPaymentMethod('promo')}
                  className="sb-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Enter Coupon Code
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── CHECKOUT SECTION ────────────────────────────────── */}
        <div className="mx-auto max-w-[680px] px-6 pb-20">
          <div className="sb-card-light shadow-[0_4px_12px_rgba(0,0,0,0.05)] bg-sb-canvas" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Tab switcher */}
            <div className="flex bg-sb-canvas-soft" style={{ borderBottom: '1px solid var(--sb-hairline)' }}>
              {([['razorpay', '💳 Pay Securely'], ['promo', '🎟️ Promo Code']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPaymentMethod(tab)}
                  className="flex-1 py-4 sb-caption cursor-pointer transition-colors border-none bg-transparent"
                  style={{
                    color: paymentMethod === tab ? 'var(--sb-primary)' : 'var(--sb-ink-muted)',
                    borderBottom: paymentMethod === tab ? '2px solid var(--sb-primary)' : '2px solid transparent',
                    fontWeight: paymentMethod === tab ? 600 : 400,
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
                  <div className="rounded-[6px] p-5 flex justify-between items-start bg-sb-canvas-soft border border-sb-hairline">
                    <div>
                      <p className="sb-micro" style={{ color: 'var(--sb-ink-muted)' }}>Order Summary</p>
                      <p className="sb-heading-md mt-1" style={{ color: 'var(--sb-ink)' }}>{planName} Plan</p>
                      <p className="sb-caption mt-0.5" style={{ color: 'var(--sb-ink-muted)' }}>{planSub}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold" style={{ fontSize: 26, color: 'var(--sb-ink)', letterSpacing: '-0.6px', fontFamily: 'Inter' }}>₹{planPrice}</p>
                      <p className="sb-micro" style={{ color: 'var(--sb-ink-muted)' }}>incl. GST</p>
                    </div>
                  </div>

                  {/* Plan picker */}
                  <div className="flex gap-3">
                    {(['annual', 'monthly'] as const).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => setSelectedPlan(plan)}
                        className="flex-1 py-2 rounded-[6px] sb-caption cursor-pointer transition-all bg-transparent"
                        style={{
                          color: selectedPlan === plan ? 'var(--sb-primary)' : 'var(--sb-ink-muted)',
                          border: selectedPlan === plan ? '1px solid var(--sb-primary)' : '1px solid var(--sb-hairline)',
                          fontWeight: selectedPlan === plan ? 600 : 400,
                        }}
                      >
                        {plan === 'annual' ? 'Annual — ₹365/yr' : 'Monthly — ₹31/mo'}
                      </button>
                    ))}
                  </div>

                  {/* Trust bar */}
                  <div className="rounded-[6px] p-3 flex flex-wrap items-center justify-center gap-4 bg-sb-canvas-soft border border-sb-hairline">
                    {['UPI', 'Cards', 'NetBanking', 'GPay', 'PhonePe'].map((m) => (
                      <span key={m} className="sb-micro px-2.5 py-1 rounded-full bg-sb-canvas border border-sb-hairline text-sb-ink-muted">{m}</span>
                    ))}
                  </div>

                  <button
                    onClick={handleRazorpayCheckout}
                    disabled={processing}
                    className="sb-btn-primary w-full text-center"
                    style={{ opacity: processing ? 0.6 : 1 }}
                  >
                    {processing ? 'Opening payment…' : `Pay ₹${planPrice} & Unlock Premium`}
                  </button>

                  <p className="sb-caption text-center" style={{ color: 'var(--sb-ink-muted)' }}>
                    🔒 Secured with 256-bit SSL · Powered by Razorpay
                  </p>
                </div>
              )}

              {/* ── Promo flow ────────────────────────────────── */}
              {paymentMethod === 'promo' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="rounded-[6px] p-4 bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)]">
                    <p className="sb-caption" style={{ color: 'var(--sb-ink-secondary)' }}>
                      🎟️ <strong style={{ color: 'var(--sb-ink)' }}>Have a coupon?</strong> Enter your unique code below to unlock lifetime access to all premium features instantly.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="sb-micro block mb-2 font-medium" style={{ color: 'var(--sb-ink-muted)' }}>Coupon Code</label>
                      <input
                        className="sb-text-input"
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
                      className="sb-btn-primary w-full text-center"
                      style={{ opacity: processing || !promoCode.trim() ? 0.5 : 1 }}
                    >
                      {processing ? 'Applying coupon…' : 'Apply & Unlock Access'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer note */}
          <p className="sb-caption text-center mt-6" style={{ color: 'var(--sb-ink-muted)' }}>
            Have questions?{' '}
            <Link to="/support" className="text-sb-primary no-underline hover:underline">Contact support</Link> · All plans come with a 7-day refund guarantee.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
