// ============================================
// RefundPage — Cancellation & Refund Policy
// Tailored for Razorpay merchant verification
// ============================================

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES, APP_CONFIG } from '@/constants'
import { useAuth } from '@/context/AuthContext'
import { UserMenu } from '@/components/ui'

export default function RefundPage() {
  const { user, openAuthModal } = useAuth()
  useEffect(() => {
    document.title = 'Cancellation & Refund Policy | Dhanrakshak'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-sb-canvas-soft text-sb-ink-secondary" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-sb-hairline bg-sb-canvas sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline font-bold text-lg">
            <span className="text-lg font-bold" style={{ color: 'var(--sb-primary)' }}>₹</span>
            <span style={{ color: 'var(--sb-ink)', fontWeight: 500 }}>Dhanrakshak</span>
          </Link>
          {user ? (
            <UserMenu />
          ) : (
            <button onClick={() => openAuthModal()} className="sb-caption font-medium bg-transparent border-0 cursor-pointer" style={{ color: 'var(--sb-primary)' }}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="sb-display-md" style={{ color: 'var(--sb-ink)' }}>Cancellation & Refund Policy</h1>
          <p className="sb-micro mt-1" style={{ color: 'var(--sb-ink-muted)' }}>Last updated: June 8, 2026 · Effective immediately</p>
        </div>

        <div className="prose max-w-none space-y-10">
          {/* Note Section */}
          <section>
            <div className="rounded-[12px] bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)] p-5 mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <p className="sb-caption leading-relaxed" style={{ color: 'var(--sb-ink-secondary)' }}>
                At <strong style={{ color: 'var(--sb-ink)' }}>Dhanrakshak</strong>, we strive to maintain complete transparency in our billing operations. Please read this policy carefully to understand your rights and options regarding subscription cancellations and refund claims for payments processed through our payment gateway provider, Razorpay.
              </p>
            </div>
          </section>

          {/* Section 1: Subscriptions & Trials */}
          {section("1. Free Trial and Billing Cycles", `
            Dhanrakshak offers a 14-Day Free Trial to new users upon registration, allowing access to all premium features, including automated Gmail scanning and budget insights.
            
            - You will not be charged during the trial period.
            - Once the trial expires, you must manually upgrade and select a paid subscription (Basic at ₹31/month or Pro at ₹365/year) to keep auto-synchronization active.
            - Paid subscriptions are billed in advance on a recurring monthly or annual basis, depending on the plan you select.
          `)}

          {/* Section 2: Cancellation Policy */}
          {section("2. Cancellation Policy", `
            You have the right to cancel your Dhanrakshak subscription at any time.
            
            - To cancel, navigate to your Settings → Subscriptions panel inside the dashboard and click the "Cancel Subscription" button, or contact us at ${APP_CONFIG.SUPPORT_EMAIL}.
            - Upon cancellation, your subscription will remain active, and you will continue to have full access to premium features, until the end of your current billing cycle.
            - We do not charge any cancellation fees.
          `)}

          {/* Section 3: Refund Eligibility & Exceptions */}
          {section("3. Refund Eligibility & Claims", `
            Since Dhanrakshak offers a digital financial intelligence service with a 14-day free trial, all subscription fees are generally non-refundable once billed. However, we offer refunds under the following specific conditions:
            
            - Accidental Subscription Upgrades: If you accidentally upgraded your account and have not used the parsing service since upgrading, you may request a refund within forty-eight (48) hours of the transaction timestamp.
            - Technical Failures: If a payment was successfully processed but your account failed to upgrade due to system integration errors, and our engineering team is unable to resolve the issue within three (3) business days of your report, a full refund will be issued.
            - Duplicate Billings: In the event that your payment source was charged multiple times for a single subscription cycle due to payment gateway lag or server errors, duplicate charges will be refunded in full.
          `)}

          {/* Section 4: Refund Processing & Timelines */}
          {section("4. Processing Timelines (Razorpay)", `
            All transactions and refund claims on Dhanrakshak are processed securely via our payment partner, Razorpay.
            
            - Once your refund request is approved, the refund is initiated automatically through Razorpay.
            - Refunded amounts will be credited back to your original payment source (credit card, debit card, UPI ID, or Netbanking account).
            - As per banking guidelines, the refund processing timeline typically takes between five (5) to seven (7) business days to reflect in your bank account or payment method statement.
          `)}

          {/* Section 5: Dispute Resolution & Contact */}
          {section("5. Contact Us for Billing Disputes", `
            For any queries, accidental transaction reports, billing disputes, or cancellation requests, please contact our support team immediately.
            
            - Email: ${APP_CONFIG.SUPPORT_EMAIL}
            - Expected response time: We review and respond to all billing inquiries within 24 to 48 hours.
          `)}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-sb-hairline mt-16 py-8 text-center sb-micro" style={{ color: 'var(--sb-ink-muted)' }}>
        <p>© 2026 Dhanrakshak. All rights reserved.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Terms of Service</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>About</Link>
          <Link to="/support" className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Support</Link>
        </div>
      </footer>
    </div>
  )
}

function section(title: string, body: string) {
  return (
    <section key={title} className="space-y-3">
      <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>{title}</h2>
      <div className="sb-caption leading-relaxed whitespace-pre-line" style={{ color: 'var(--sb-ink-secondary)' }}>
        {body.trim()}
      </div>
    </section>
  )
}
