// ============================================
// PricingPage — Gated payment & trial checkout
// ============================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { Button, Input } from '@/components/ui'
import { useAuth, useToast } from '@/context'

export default function PricingPage() {
  const navigate = useNavigate()
  const { user, profile, updateSubscriptionStatus, daysLeft } = useAuth()
  const { showToast } = useToast()

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'promo'>('razorpay')

  // Computed Plan Info (available to all handlers)
  const planName = selectedPlan === 'annual' ? 'Investor Annual' : 'Starter Monthly'
  const planPrice = selectedPlan === 'annual' ? '365' : '31'

  // Promo Code State
  const [promoCode, setPromoCode] = useState('')

  // Processing State
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    document.title = 'Upgrade to Premium | Dhanrakshak'
  }, [])

  // Dynamically load Razorpay standard checkout script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handleRazorpayCheckout = async () => {
    if (!user) {
      showToast('Please log in to upgrade to Premium.', 'warning')
      navigate('/login')
      return
    }

    setProcessing(true)

    // 1. Load Razorpay script
    const scriptLoaded = await loadRazorpayScript()
    if (!scriptLoaded) {
      showToast('Failed to load Razorpay payment SDK. Please check your internet.', 'error')
      setProcessing(false)
      return
    }

    try {
      // 2. Call backend to create the Razorpay Order
      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType: selectedPlan,
          userId: user.id,
        }),
      })

      const orderData = await response.json()
      if (!response.ok || orderData.error) {
        throw new Error(orderData.error || 'Could not initiate payment order')
      }

      // 3. Open Razorpay payment checkout modal
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Dhanrakshak',
        description: `Upgrade to Premium (${planName})`,
        image: '/logo.png', // Add logo image path if available
        order_id: orderData.id,
        prefill: {
          name: profile?.full_name || '',
          email: user.email || '',
        },
        theme: {
          color: '#3b82f6', // Brand brand color
        },
        handler: async (paymentResponse: any) => {
          setProcessing(true)
          try {
            // 4. Verify payment signature on backend
            const verifyResponse = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
                userId: user.id,
                planType: selectedPlan,
              }),
            })

            const verifyData = await verifyResponse.json()
            if (!verifyResponse.ok || verifyData.error) {
              throw new Error(verifyData.error || 'Payment verification failed')
            }

            // 5. Success
            showToast('👑 Payment Successful! Premium features unlocked.', 'success')
            navigate('/payment-success', {
              state: {
                planName,
                expiresAt: verifyData.expiresAt,
              },
            })
          } catch (err: any) {
            console.error('Payment verification failed:', err)
            showToast(`Verification Failed: ${err.message}`, 'error')
          } finally {
            setProcessing(false)
          }
        },
        modal: {
          ondismiss: () => {
            setProcessing(false)
          },
        },
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch (err: any) {
      console.error('Razorpay initialization error:', err)
      showToast(`Checkout initialization error: ${err.message}`, 'error')
      setProcessing(false)
    }
  }

  const handlePromoSimulator = () => {
    const cleanCode = promoCode.trim().toUpperCase()
    const validCodes = ['DHANVIP', 'UNLIMITED_VIP', 'FREE_LIFETIME', 'ITZPIYUSH', 'INVESTOR_UNLIMITED']
    
    if (!validCodes.includes(cleanCode)) {
      showToast('❌ Invalid or expired coupon code. Please try again.', 'error')
      return
    }

    setProcessing(true)
    setTimeout(async () => {
      try {
        const success = await updateSubscriptionStatus('active', 'lifetime')
        if (success) {
          showToast('👑 Success! Unlimited VIP lifetime access has been unlocked.', 'success')
          navigate('/dashboard')
        } else {
          showToast('Failed to apply coupon status. Please try again.', 'error')
        }
      } catch (err: any) {
        showToast('Coupon application error: ' + err.message, 'error')
      } finally {
        setProcessing(false)
      }
    }, 1500)
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-4 px-2 sm:px-4 space-y-8 animate-fade-in">
        
        {/* Banner if trial is still active */}
        {profile?.subscription_status === 'trial' && daysLeft > 0 && (
          <div className="rounded-2xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">⏳</span>
              <div>
                <p className="font-bold text-white text-sm">Trial Active: {daysLeft} Days Left</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  You are currently using the trial version with full premium access (including automated Gmail Sync). The access will be restricted after the trial ends.
                </p>
              </div>
            </div>
            <div className="text-xs text-[var(--status-warning-text)] font-semibold bg-[var(--status-warning-subtle)] px-2.5 py-1 rounded-md border border-[var(--status-warning-border)]">
              Full Trial Access
            </div>
          </div>
        )}

        {/* Banner if trial has expired */}
        {(!profile?.subscription_status || (profile?.subscription_status === 'trial' && daysLeft <= 0)) && (
          <div className="rounded-2xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">🔒</span>
              <div>
                <p className="font-bold text-white text-sm">Trial Expired — Dashboard Gated</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Your 14-day trial has concluded. Please upgrade to a premium plan to restore access to analytics, expenses, and automated email scans.
                </p>
              </div>
            </div>
            <div className="text-xs text-[var(--status-danger-text)] font-semibold bg-[var(--status-danger-subtle)] px-2.5 py-1 rounded-md border border-[var(--status-danger-border)]">
              Account Locked
            </div>
          </div>
        )}

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
            Dhanrakshak Premium
          </h1>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm sm:text-base">
            Gain full control of your wealth. Unlock automated email scanning, advanced budgets, and multi-card tracking instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* PLANS SECTION (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-bold text-zinc-300 px-1">1. Select Your Premium Plan</h2>
            
            {/* Annual Plan Card */}
            <div
              onClick={() => setSelectedPlan('annual')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-40 relative overflow-hidden ${
                selectedPlan === 'annual'
                  ? 'border-brand-400 bg-brand-500/5 shadow-lg shadow-brand-500/5 ring-1 ring-brand-400/25'
                  : 'border-border-subtle bg-surface-1 hover:border-zinc-700'
              }`}
            >
              {/* Popular Badge */}
              <div className="absolute top-0 right-0 bg-brand-500 text-white text-[9px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl">
                Best Value (Save 15%)
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={selectedPlan === 'annual'}
                    onChange={() => setSelectedPlan('annual')}
                    className="h-4 w-4 text-brand-500 border-zinc-800 bg-surface-2 focus:ring-brand-500"
                  />
                  <span className="font-bold text-white text-base">Investor Annual</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2 pl-6">
                  Perfect for long-term tracking. Advertised at just ₹1 a day! Includes immediate updates.
                </p>
              </div>

              <div className="pl-6 flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-extrabold text-white">₹365</span>
                <span className="text-xs text-zinc-500">/ year</span>
                <span className="text-[10px] text-brand-400 font-semibold bg-brand-500/10 px-2 py-0.5 rounded ml-2">₹1/day</span>
              </div>
            </div>

            {/* Monthly Plan Card */}
            <div
              onClick={() => setSelectedPlan('monthly')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-40 ${
                selectedPlan === 'monthly'
                  ? 'border-brand-400 bg-brand-500/5 shadow-lg shadow-brand-500/5 ring-1 ring-brand-400/25'
                  : 'border-border-subtle bg-surface-1 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={selectedPlan === 'monthly'}
                    onChange={() => setSelectedPlan('monthly')}
                    className="h-4 w-4 text-brand-500 border-zinc-800 bg-surface-2 focus:ring-brand-500"
                  />
                  <span className="font-bold text-white text-base">Starter Monthly</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2 pl-6">
                  Flexible month-to-month plan. Includes automated scans and full dashboard analytics.
                </p>
              </div>

              <div className="pl-6 flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-extrabold text-white">₹31</span>
                <span className="text-xs text-zinc-500">/ month</span>
              </div>
            </div>

            {/* Feature Checkmarks */}
            <div className="bg-surface-1 border border-border-subtle rounded-2xl p-5 space-y-3.5">
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Features Included:</p>
              <ul className="space-y-2.5 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="text-brand-400">✓</span> Automated Gmail inbox transaction parsing
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand-400">✓</span> Real-time expense categorization engine
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand-400">✓</span> Multi-card limits and threshold tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand-400">✓</span> High-fidelity visual charts & budget history
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand-400">✓</span> Priority customer support and encrypted backup exports
                </li>
              </ul>
            </div>
          </div>

          {/* PAYMENT SECTION (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-zinc-300 px-1">2. Secure Checkout</h2>

            <div className="bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-xl space-y-6">
              
              {/* Payment Type Selection */}
              <div className="flex bg-surface-2 p-1 rounded-xl border border-border-subtle/50">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('razorpay')}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === 'razorpay'
                      ? 'bg-surface-0 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>💳</span> Pay Securely
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('promo')}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === 'promo'
                      ? 'bg-surface-0 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>🎟️</span> Promo Code
                </button>
              </div>

              {/* RAZORPAY GATEWAY FLOW */}
              {paymentMethod === 'razorpay' && (
                <div className="space-y-6">
                  {/* Premium Checkout Banner */}
                  <div className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-850 via-zinc-900 to-brand-950/20 border border-zinc-800/80 shadow-2xl flex flex-col justify-between overflow-hidden">
                    <div className="absolute inset-0 bg-white/[0.01] pointer-events-none" />
                    
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-extrabold tracking-widest text-brand-400">Order Summary</span>
                        <h3 className="text-lg font-bold text-white">{planName} Plan</h3>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                        Razorpay Secure
                      </div>
                    </div>

                    <div className="mt-6 space-y-2.5">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Base Subscription</span>
                        <span>₹{planPrice}.00</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>GST / Taxes</span>
                        <span>₹0.00 (Inclusive)</span>
                      </div>
                      <div className="h-px bg-zinc-800/60 my-2" />
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-bold text-white">Total Amount Due</span>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-2xl font-extrabold text-white">₹{planPrice}</span>
                          <span className="text-xs text-zinc-500">.00</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trust details */}
                  <div className="bg-surface-2/40 border border-border-subtle/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                    <div className="flex items-center justify-center gap-4 text-zinc-500 text-xs">
                      <span className="font-semibold text-zinc-400">Supported Options:</span>
                      <div className="flex gap-2.5 items-center">
                        <span className="px-1.5 py-0.5 rounded border border-zinc-800 text-[10px] font-bold bg-zinc-900/60">UPI</span>
                        <span className="px-1.5 py-0.5 rounded border border-zinc-800 text-[10px] font-bold bg-zinc-900/60">CARDS</span>
                        <span className="px-1.5 py-0.5 rounded border border-zinc-800 text-[10px] font-bold bg-zinc-900/60">NETBANKING</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1 text-center">
                      🔒 Secured with 256-bit SSL encryption. GPay, PhonePe, Paytm, and RuPay card checkouts accepted.
                    </p>
                  </div>

                  <Button
                    onClick={handleRazorpayCheckout}
                    loading={processing}
                    size="lg"
                    block
                    className="bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-xl shadow-brand-500/10 font-bold transition-all duration-300"
                  >
                    Pay ₹{planPrice} & Upgrade Now
                  </Button>
                </div>
              )}

              {/* PROMO CODE SIMULATOR FLOW */}
              {paymentMethod === 'promo' && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 text-xs text-brand-300 leading-relaxed">
                    🎟️ <strong>Dhanrakshak Coupon Code:</strong> Enter your unique coupon code below to unlock unlimited lifetime access to all app features (including automated email scanning and mobile dashboards).
                  </div>
                  
                  <div className="space-y-4">
                    <Input
                      label="Coupon Code"
                      type="text"
                      placeholder="e.g. DHANVIP"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                    />
                    
                    <Button
                      onClick={handlePromoSimulator}
                      loading={processing}
                      block
                    >
                      Apply Coupon & Unlock Access
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>

      </div>
    </AppLayout>
  )
}
