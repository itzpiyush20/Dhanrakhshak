// ============================================
// PricingPage — Stripe-design-language version
// Featured dark-navy tier, tabular figures, indigo pill CTAs
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
        theme: { color: '#533afd' },
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
    <AppLayout>
      <div
        className="min-h-screen"
        style={{
          background: 'var(--s-canvas-soft)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontFeatureSettings: '"ss01"',
        }}
      >

        {/* ── HEADER BAND ─────────────────────────────────────── */}
        <div className="stripe-mesh-bg py-16 text-center">
          <div className="mx-auto max-w-[700px] px-6 space-y-4">
            <div className="s-pill-tag" style={{ display: 'inline-flex' }}>Pricing & Plans</div>
            <h1 className="s-display-xl" style={{ color: 'var(--s-ink)' }}>
              Simple, honest pricing
            </h1>
            <p className="s-body-lg" style={{ color: 'var(--s-ink-mute)', maxWidth: 480, margin: '0 auto' }}>
              Gain full automated tracking with any plan. No hidden fees, no dark patterns. Cancel at any time.
            </p>
          </div>
        </div>

        {/* ── STATUS BANNERS ──────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 pt-8 space-y-3">
          {isTrial && daysLeft > 0 && (
            <div className="rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ background: '#fffbeb', border: '1px solid #f59e0b' }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="s-caption" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>Trial Active — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</p>
                  <p className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>Full premium access including automated Gmail Sync. Upgrade to keep it after your trial ends.</p>
                </div>
              </div>
              <span className="s-micro-cap px-3 py-1.5 rounded-full whitespace-nowrap shrink-0" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>Trial access</span>
            </div>
          )}

          {(!profile?.subscription_status || (isTrial && daysLeft <= 0)) && (
            <div className="rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="s-caption" style={{ color: 'var(--s-ink)', fontWeight: 500 }}>Trial Expired — Dashboard Gated</p>
                  <p className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>Upgrade to restore access to analytics, expenses, and automated email scans.</p>
                </div>
              </div>
              <span className="s-micro-cap px-3 py-1.5 rounded-full whitespace-nowrap shrink-0" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>Access locked</span>
            </div>
          )}

          {isActive && (
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
              <span className="text-2xl">✅</span>
              <p className="s-caption" style={{ color: '#166534', fontWeight: 500 }}>You're on Premium — all features are fully unlocked.</p>
            </div>
          )}
        </div>

        {/* ── PRICING CARDS ───────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-6 py-12">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">

            {/* ── Standard: Monthly ─────────────────────────────── */}
            <div
              className="s-card s-shadow-1 flex flex-col cursor-pointer transition-all hover:s-shadow-2"
              style={{ borderColor: selectedPlan === 'monthly' ? 'var(--s-primary)' : 'var(--s-hairline)', borderWidth: selectedPlan === 'monthly' ? 2 : 1 }}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="s-heading-lg" style={{ color: 'var(--s-ink)' }}>Starter Monthly</h2>
                <input type="radio" readOnly checked={selectedPlan === 'monthly'} className="h-4 w-4 cursor-pointer accent-[#533afd]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="tnum" style={{ fontSize: 36, fontWeight: 300, color: 'var(--s-ink)', letterSpacing: '-0.8px' }}>₹31</span>
                  <span className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>/month</span>
                </div>
                <p className="s-caption mt-1" style={{ color: 'var(--s-ink-mute)' }}>Billed monthly · cancel anytime</p>
              </div>

              <ul className="space-y-3 flex-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--s-primary)', flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                    <span className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => { setSelectedPlan('monthly'); setPaymentMethod('razorpay') }}
                  className="s-btn-secondary"
                  style={{ width: '100%', padding: '10px 20px', justifyContent: 'center' }}
                >
                  Choose Monthly
                </button>
              </div>
            </div>

            {/* ── Featured: Annual (deep navy) ───────────────────── */}
            <div
              className="s-card-featured flex flex-col cursor-pointer relative overflow-hidden"
              style={{ boxShadow: 'rgba(83,58,253,0.20) 0 8px 32px, rgba(83,58,253,0.08) 0 2px 8px', cursor: 'pointer' }}
              onClick={() => setSelectedPlan('annual')}
            >
              {/* Best value badge */}
              <div className="absolute top-0 right-0 text-[9px] font-bold uppercase tracking-widest px-4 py-2 rounded-bl-xl" style={{ background: 'var(--s-primary)', color: '#fff', letterSpacing: '0.08em' }}>
                Best value · Save 15%
              </div>

              <div className="flex items-center justify-between mb-6 mt-2">
                <h2 className="s-heading-lg" style={{ color: '#fff' }}>Investor Annual</h2>
                <input type="radio" readOnly checked={selectedPlan === 'annual'} className="h-4 w-4 cursor-pointer accent-[#533afd]" />
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="tnum" style={{ fontSize: 36, fontWeight: 300, color: '#fff', letterSpacing: '-0.8px' }}>₹365</span>
                  <span className="s-caption" style={{ color: 'rgba(255,255,255,0.55)' }}>/year</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="tnum s-micro-cap px-2 py-0.5 rounded-full" style={{ background: 'rgba(83,58,253,0.3)', color: 'var(--s-primary-soft)', border: '1px solid rgba(102,94,253,0.3)' }}>₹1 per day</span>
                  <span className="s-caption" style={{ color: 'rgba(255,255,255,0.55)' }}>Billed once per year</span>
                </div>
              </div>

              <ul className="space-y-3 flex-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--s-primary-soft)', flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                    <span className="s-caption" style={{ color: 'rgba(255,255,255,0.72)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => { setSelectedPlan('annual'); setPaymentMethod('razorpay') }}
                  className="s-btn-primary"
                  style={{ width: '100%', padding: '11px 20px', justifyContent: 'center', fontSize: 15 }}
                >
                  Get Investor Annual
                </button>
                <p className="s-micro-cap text-center" style={{ color: 'rgba(255,255,255,0.40)' }}>Secured via Razorpay · 256-bit SSL</p>
              </div>
            </div>

            {/* ── Promo / Coupon ────────────────────────────────── */}
            <div className="s-card s-shadow-1 flex flex-col" style={{ borderColor: 'var(--s-hairline)' }}>
              <div className="mb-6">
                <span className="s-pill-tag">Special Access</span>
                <h2 className="s-heading-lg mt-4" style={{ color: 'var(--s-ink)' }}>Coupon Code</h2>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="tnum" style={{ fontSize: 36, fontWeight: 300, color: 'var(--s-ink)', letterSpacing: '-0.8px' }}>Free</span>
                </div>
                <p className="s-caption mt-1" style={{ color: 'var(--s-ink-mute)' }}>Lifetime access with a valid coupon</p>
              </div>

              <ul className="space-y-3 flex-1">
                {['All Premium features', 'Lifetime access', 'No payment required', 'Instant activation'].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span style={{ color: 'var(--s-primary)', flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                    <span className="s-caption" style={{ color: 'var(--s-ink-mute)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <button
                  onClick={() => setPaymentMethod('promo')}
                  className="s-btn-secondary"
                  style={{ width: '100%', padding: '10px 20px', justifyContent: 'center' }}
                >
                  Enter Coupon Code
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── CHECKOUT SECTION ────────────────────────────────── */}
        <div className="mx-auto max-w-[680px] px-6 pb-20">
          <div className="s-card s-shadow-2" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Tab switcher */}
            <div className="flex" style={{ borderBottom: '1px solid var(--s-hairline)' }}>
              {([['razorpay', '💳 Pay Securely'], ['promo', '🎟️ Promo Code']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPaymentMethod(tab)}
                  className="flex-1 py-4 s-caption cursor-pointer transition-colors"
                  style={{
                    background: 'none', border: 'none',
                    color: paymentMethod === tab ? 'var(--s-primary)' : 'var(--s-ink-mute)',
                    borderBottom: paymentMethod === tab ? '2px solid var(--s-primary)' : '2px solid transparent',
                    fontWeight: paymentMethod === tab ? 500 : 300,
                    fontFamily: "'Inter', system-ui",
                    fontFeatureSettings: '"ss01"',
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
                  <div className="rounded-xl p-5 flex justify-between items-start" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                    <div>
                      <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>Order Summary</p>
                      <p className="s-heading-md mt-1" style={{ color: 'var(--s-ink)' }}>{planName} Plan</p>
                      <p className="s-caption mt-0.5" style={{ color: 'var(--s-ink-mute)' }}>{planSub}</p>
                    </div>
                    <div className="text-right">
                      <p className="tnum" style={{ fontSize: 26, fontWeight: 300, color: 'var(--s-ink)', letterSpacing: '-0.6px' }}>₹{planPrice}</p>
                      <p className="s-micro-cap" style={{ color: 'var(--s-ink-mute)' }}>incl. GST</p>
                    </div>
                  </div>

                  {/* Plan picker */}
                  <div className="flex gap-3">
                    {(['annual', 'monthly'] as const).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => setSelectedPlan(plan)}
                        className="flex-1 py-2.5 rounded-full s-caption cursor-pointer transition-all"
                        style={{
                          background: selectedPlan === plan ? 'var(--s-primary)' : 'transparent',
                          color: selectedPlan === plan ? '#fff' : 'var(--s-ink-mute)',
                          border: selectedPlan === plan ? '1px solid var(--s-primary)' : '1px solid var(--s-hairline)',
                          fontFamily: "'Inter', system-ui",
                          fontFeatureSettings: '"ss01"',
                        }}
                      >
                        {plan === 'annual' ? 'Annual — ₹365/yr' : 'Monthly — ₹31/mo'}
                      </button>
                    ))}
                  </div>

                  {/* Trust bar */}
                  <div className="rounded-xl p-3 flex flex-wrap items-center justify-center gap-4" style={{ background: 'var(--s-canvas-soft)', border: '1px solid var(--s-hairline)' }}>
                    {['UPI', 'Cards', 'NetBanking', 'GPay', 'PhonePe'].map((m) => (
                      <span key={m} className="s-micro-cap px-2 py-1 rounded-full" style={{ background: 'var(--s-canvas)', color: 'var(--s-ink-mute)', border: '1px solid var(--s-hairline)' }}>{m}</span>
                    ))}
                  </div>

                  <button
                    onClick={handleRazorpayCheckout}
                    disabled={processing}
                    className="s-btn-primary"
                    style={{ width: '100%', padding: '13px 20px', fontSize: 16, justifyContent: 'center', opacity: processing ? 0.6 : 1 }}
                  >
                    {processing ? 'Opening payment…' : `Pay ₹${planPrice} & Unlock Premium`}
                  </button>

                  <p className="s-caption text-center" style={{ color: 'var(--s-ink-mute)' }}>
                    🔒 Secured with 256-bit SSL · Powered by Razorpay
                  </p>
                </div>
              )}

              {/* ── Promo flow ────────────────────────────────── */}
              {paymentMethod === 'promo' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="rounded-xl p-4" style={{ background: 'rgba(83,58,253,0.04)', border: '1px solid rgba(83,58,253,0.15)' }}>
                    <p className="s-caption" style={{ color: 'var(--s-ink-secondary)' }}>
                      🎟️ <strong style={{ color: 'var(--s-ink)' }}>Have a coupon?</strong> Enter your unique code below to unlock lifetime access to all premium features instantly.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="s-micro-cap block mb-2" style={{ color: 'var(--s-ink-mute)' }}>Coupon Code</label>
                      <input
                        className="s-input"
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
                      className="s-btn-primary"
                      style={{ width: '100%', padding: '12px 20px', fontSize: 15, justifyContent: 'center', opacity: processing || !promoCode.trim() ? 0.5 : 1 }}
                    >
                      {processing ? 'Applying coupon…' : 'Apply & Unlock Access'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer note */}
          <p className="s-caption text-center mt-6" style={{ color: 'var(--s-ink-mute)' }}>
            Have questions?{' '}
            <Link to="/support" className="s-link">Contact support</Link> · All plans come with a 7-day refund guarantee.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
