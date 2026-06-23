// ============================================
// TermsPage — Terms of Service & User Agreement
// ============================================

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'

export default function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Service | Dhanrakshak'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-sb-canvas text-sb-ink-secondary" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-sb-hairline bg-sb-canvas/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline font-bold text-lg">
            <span className="text-lg font-bold text-emerald-400">₹</span>
            <span className="text-sb-ink font-medium">Dhanrakshak</span>
          </Link>
          <Link to={ROUTES.DASHBOARD} className="text-xs font-medium no-underline text-emerald-400">
            ← Back to App
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-sb-ink">Terms of Service</h1>
          <p className="text-xs mt-1 text-sb-ink-muted">Last updated: June 2, 2026 · Effective immediately</p>
        </div>

        <div className="prose max-w-none space-y-10">

          <section>
            <div className="sb-card-light p-5 mb-8 leading-relaxed text-sb-ink-secondary">
              Please read these Terms of Service ("Terms") carefully before using Dhanrakshak (the "Service" or "App").
              By signing up for or using Dhanrakshak, you agree to be bound by these Terms and our Privacy Policy.
            </div>
          </section>

          {section("1. The Service", `
            Dhanrakshak is a personal financial intelligence platform designed to parse bank transactions, help users monitor expenses, maintain budgets, and receive financial forecasts.
            
            The Service is provided "as is" and "as available". We do not guarantee that the Service will always be uninterrupted, timely, secure, or free from error.
          `)}

          {section("2. Account Creation & Verification", `
            To use the Service, you must create an account using a valid email address or via Google OAuth. 
            - You represent that all information provided is accurate and truthful.
            - You are responsible for keeping your account credentials secure.
            - We limit account usage to a maximum of 2 active concurrent browser sessions/devices per user to prevent abuse.
          `)}

          {section("3. Email Tracking & Google API Data", `
            If you connect your Google Account (Gmail) to allow the email scanner engine to scan and extract transactions:
            - You explicitly grant Dhanrakshak permission to read, search, and parse financial transactional emails from whitelisted banking domains in your inbox.
            - Dhanrakshak only accesses transactional emails. We do not read personal, promotional, or social correspondence.
            - Gmail parsing uses a combination of client-side pattern matching and Google's own Gemini AI (via a server-side proxy we control) for extraction accuracy. No raw email bodies are stored on our servers — content passes through the proxy in real time and is never logged or retained.
            - You can disconnect your Google account and revoke access at any time.
          `)}

          {section("4. Subscriptions, Trials & Billing", `
            Dhanrakshak offers subscription plans to access advanced automated tracking features:
            - 14-Day Free Trial: New users receive 14 days of free trial access starting from registration. During the trial period, the service gives full Pro access, including automated Gmail scanning and manual entries. Access will be limited or locked after the trial period ends unless upgraded to a subscription plan.
            - Paid Subscription Tiers: Users can choose to upgrade to "Basic" (₹31/month) or "Pro" (₹365/year) to unlock full background and manual Gmail inbox synchronization.
            - Billing and Renewals: All payments are processed securely via Razorpay, a licensed payment gateway. Subscriptions run on a monthly or annual cycle.
            - Cancellation Policy: Subscriptions can be canceled at any time. Access continues through the end of the current billing term. Dhanrakshak does not offer refunds for partial subscription cycles.
          `)}

          {section("5. Prohibited Uses", `
            You agree not to use the Service to:
            - Abuse or hammer our API endpoints (e.g. configuring bots to trigger loops).
            - Circumvent session limit controls or use multiple accounts to bypass tier thresholds.
            - Reverse-engineer the email transaction extraction heuristics or build competing financial tools using our parser definitions.
          `)}

          {section("6. Limitations of Liability", `
            Dhanrakshak is a financial tool, not a financial advisor. All insights, cash flow forecasts, and subscription lists are provided for informational purposes only.
            - We are not liable for any financial decisions, loss of money, or investment decisions you make based on data displayed in the app.
            - Under no circumstances shall Dhanrakshak or its creator be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the Service.
          `)}

          {section("7. Data Ownership & Rights", `
            Your financial data belongs entirely to you. 
            - You can request a full export of your data (as CSV or JSON) at any time.
            - You can permanently delete your account and all associated transaction records directly from the app interface.
          `)}

          {section("8. Amendments to Terms", `
            We reserve the right to modify these Terms at any time. We will alert you to major updates via an in-app notice. Continued use of the Service after changes constitute acceptance of the updated Terms.
          `)}
        </div>
      </main>

      <footer className="border-t border-sb-hairline bg-sb-canvas-soft mt-16 py-8 text-center text-xs text-sb-ink-muted">
        <p>© 2026 Dhanrakshak. All rights reserved.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline text-sb-ink-muted">Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline text-sb-ink-muted">Terms of Service</Link>
          <Link to={ROUTES.REFUND} className="no-underline hover:underline text-sb-ink-muted">Refund Policy</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline text-sb-ink-muted">About</Link>
          <Link to="/support" className="no-underline hover:underline text-sb-ink-muted">Support</Link>
        </div>
      </footer>
    </div>
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
