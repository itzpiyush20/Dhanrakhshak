// ============================================
// PrivacyPage — Privacy Policy & Data Rights
// ============================================

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES, APP_CONFIG } from '@/constants'

export default function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy | Dhanrakshak'
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
          <Link to={ROUTES.DASHBOARD} className="sb-caption font-medium no-underline" style={{ color: 'var(--sb-primary)' }}>
            ← Back to App
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="sb-display-md" style={{ color: 'var(--sb-ink)' }}>Privacy Policy</h1>
          <p className="sb-micro mt-1" style={{ color: 'var(--sb-ink-muted)' }}>Last updated: June 2, 2026 · Effective immediately</p>
        </div>

        <div className="prose max-w-none space-y-10">

          {/* Intro */}
          <section>
            <div className="rounded-[12px] bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)] p-5 mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <p className="sb-caption leading-relaxed" style={{ color: 'var(--sb-ink-secondary)' }}>
                <strong style={{ color: 'var(--sb-ink)' }}>Our commitment:</strong> Dhanrakshak is built on a foundation of trust. We never sell your financial data, never store your banking passwords, and never share your personal information with advertisers. Your financial data belongs to you — always.
              </p>
            </div>
          </section>

          {section("1. Who We Are", `
            Dhanrakshak ("we", "us", "our") is a personal financial intelligence platform operated by its founder. The platform is accessible at dhanrakshak-five.vercel.app and any associated domains.

            For privacy-related queries, contact us via the in-app Support page.
          `)}

          {section("2. What Data We Collect", null, [
            { title: "Account Information", body: "When you sign up, we collect your email address and optionally your name and profile photo (if you sign in with Google)." },
            { title: "Transaction Data", body: "Financial transactions you enter manually, or that are automatically extracted from your Gmail bank alert emails. This includes: amount, date, merchant name, category, and payment method type (e.g., credit card last 4 digits). We never store full card numbers, PINs, or banking passwords." },
            { title: "Email Content (Gmail Only)", body: "If you connect Gmail, we read bank transaction alert emails only. We use read-only OAuth scopes. We do not read personal emails, social emails, or promotional emails. Email content is processed in your browser and is not stored on our servers — only the extracted transaction data is saved." },
            { title: "Usage Data", body: "We may collect anonymous usage analytics (page views, feature usage) to improve the product. This data cannot be linked back to your identity." },
            { title: "Device Information", body: "A unique device identifier is stored locally to support our 2-device session limit. This is never transmitted to our servers." },
          ])}

          {section("3. How We Use Your Data", null, [
            { title: "To provide the service", body: "Your transaction data is used exclusively to show you your financial dashboard, insights, budgets, and reports." },
            { title: "To improve accuracy", body: "Your category corrections teach the system to better categorize future transactions for your account only. Your learning data is not used to train global models." },
            { title: "To send you alerts", body: "If you opt in, we may send budget overspend alerts and subscription renewal reminders to your registered email." },
            { title: "We never:", body: "Sell your data · Share data with advertisers · Use your data to train AI for other users · Access emails beyond bank alert parsing" },
          ])}

          {section("4. Data Storage & Security", null, [
            { title: "Database", body: "Your data is stored in Supabase (a Postgres-based cloud database) on servers in India/Europe. Supabase is SOC 2 Type II compliant." },
            { title: "Row Level Security", body: "Every database table has Row Level Security enabled. Your data is physically isolated — no user can access another user's data, even accidentally." },
            { title: "Encryption", body: "All data in transit is encrypted via TLS 1.3. Your optional encrypted backup files use AES-GCM encryption — only you hold the password." },
            { title: "Gmail OAuth", body: "We use OAuth 2.0 with read-only scopes. Your Gmail password is never seen or stored by us." },
          ])}

          {section("5. Your Rights & Consent Control", null, [
            { title: "Access & Portability", body: "You can export all your transaction data anytime as a CSV or JSON file from the Settings page or the dashboard." },
            { title: "Deletion & Erasure", body: "You can permanently delete your account from Settings → Account → Delete Account. This removes all your personal data, transaction history, and configs from our servers within 24 hours." },
            { title: "Correction", body: "You can edit, categorize, or delete any transaction, rule, or profile parameter at any time." },
            { title: "Revoke Gmail Access", body: "You can revoke Gmail inbox access at any time from your Google Account → Security → Third-party apps, or from Settings → Disconnect Gmail in the app." },
            { title: "Withdraw Consent (DPDPA 2023)", body: "Under the Digital Personal Data Protection Act 2023, you have the right to withdraw your consent to data processing at any time by deleting your account, which completely halts data processing and erases all records." },
          ])}

          {section("6. Third-Party Services", null, [
            { title: "Supabase", body: "Database, authentication, and file storage. Privacy policy: supabase.com/privacy" },
            { title: "Google OAuth", body: "Sign-in and Gmail access. Privacy policy: policies.google.com/privacy" },
            { title: "Vercel", body: "Web hosting and CDN. Privacy policy: vercel.com/legal/privacy-policy" },
            { title: "PostHog (if enabled)", body: "Anonymous product analytics. Privacy policy: posthog.com/privacy" },
          ])}

          {section("7. Cookies", `
            We use only essential cookies required for authentication session management. We do not use advertising cookies or tracking cookies.
            
            Session cookies: Required for you to stay logged in. Expire when you log out.
            localStorage: Used to store your theme preference, device ID, and merchant rules for faster access. Never transmitted to third parties.
          `)}

          {section("8. Children's Privacy", `
            Dhanrakshak is not intended for children under 18. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us and we will delete it.
          `)}

          {section("9. Changes to This Policy", `
            We will notify you of material changes to this policy via in-app notification or email. The "Last updated" date at the top of this page always reflects the most recent revision.
          `)}

          {section("10. Google API Services Disclosure", `
            Dhanrakshak's use and transfer of information received from Google APIs to any other app will adhere to Google API Services User Data Policy, including the Limited Use requirements.

            Specifically:
            • We access your Gmail inbox only to read transaction alert emails from banking institutions.
            • We do not store your raw email contents on our servers; they are parsed client-side in your browser.
            • We do not share, transfer, or sell your Google user data to third-party databases, marketing platforms, or ad networks.
            • We do not use your Google user data to train machine learning or artificial intelligence models.
          `)}

          {section("11. Contact Us & Grievance Officer", `
            If you have privacy questions, wish to exercise your data rights, or have complaints, please contact our designated Grievance Officer:

            • Name: ${APP_CONFIG.SUPPORT_NAME}
            • Designation: ${APP_CONFIG.SUPPORT_DESIGNATION}
            • Contact Email: ${APP_CONFIG.SUPPORT_EMAIL}
            • Address: ${APP_CONFIG.SUPPORT_ADDRESS}

            We will address and resolve any complaints or data queries within 30 days of receipt.
          `)}
        </div>
      </main>

      <footer className="border-t border-sb-hairline mt-16 py-8 text-center sb-micro" style={{ color: 'var(--sb-ink-muted)' }}>
        <p>© 2026 Dhanrakshak. Built with privacy by design.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link to={ROUTES.PRIVACY} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Terms of Service</Link>
          <Link to={ROUTES.REFUND} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Refund Policy</Link>
          <Link to={ROUTES.ABOUT} className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>About</Link>
          <Link to="/support" className="no-underline hover:underline" style={{ color: 'var(--sb-ink-muted)' }}>Support</Link>
        </div>
      </footer>
    </div>
  )
}

function section(title: string, body: string | null, items?: { title: string; body: string }[]) {
  return (
    <section key={title} className="space-y-3">
      <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>{title}</h2>
      {body && (
        <div className="sb-caption leading-relaxed whitespace-pre-line" style={{ color: 'var(--sb-ink-secondary)' }}>
          {body.trim()}
        </div>
      )}
      {items && (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.title} className="bg-sb-canvas border border-sb-hairline p-4 rounded-[6px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <p className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>{item.title}</p>
              <p className="sb-caption leading-relaxed mt-1" style={{ color: 'var(--sb-ink-muted)' }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
