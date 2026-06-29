// ============================================
// RefundPage — Cancellation & Refund Policy
// Tailored for Razorpay merchant verification
// ============================================

import { APP_CONFIG } from '@/constants'
import { MarketingLayout } from '@/layouts'

export default function RefundPage() {
  return (
    <MarketingLayout title="Cancellation & Refund Policy">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-sb-ink">Cancellation & Refund Policy</h1>
        <p className="text-xs mt-1 text-sb-ink-muted">Last updated: June 8, 2026 · Effective immediately</p>
      </div>

      <div className="prose max-w-none space-y-10">
        {/* Note Section */}
        <section>
          <div className="rounded-[12px] bg-brand-500/10 border border-brand-500/20 p-5 mb-8 shadow-sm">
            <p className="text-sm leading-relaxed text-sb-ink-secondary">
              At <strong className="text-sb-ink">Dhanrakshak</strong>, we strive to maintain complete transparency in our billing operations. Please read this policy carefully to understand your rights and options regarding subscription cancellations and refund claims for payments processed through our payment gateway provider, Razorpay.
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

        {/* Section 3: Refund Eligibility & Claims */}
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
    </MarketingLayout>
  )
}

function section(title: string, body: string) {
  return (
    <section key={title} className="space-y-3">
      <h2 className="text-lg font-bold text-sb-ink">{title}</h2>
      <div className="text-sm leading-relaxed whitespace-pre-line text-sb-ink-secondary">
        {body.trim()}
      </div>
    </section>
  )
}
