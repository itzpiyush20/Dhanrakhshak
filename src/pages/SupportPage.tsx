// ============================================
// SupportPage — Support, Privacy Policy & FAQ
// Visually stunning, responsive, and Supabaze Design Language compliant
// ============================================

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/layouts'

// Custom interface for tickets stored in localStorage
interface Ticket {
  id: string
  name: string
  email: string
  subject: string
  message: string
  createdAt: string
  status: string
}

export default function SupportPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'privacy'

  // FAQs Accordion State
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  // Form Field States
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Ticket Log State initialized directly from localStorage
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const savedTickets = localStorage.getItem('dhanrakshak_support_tickets')
    if (savedTickets) {
      try {
        return JSON.parse(savedTickets)
      } catch (e) {
        console.error('Error loading tickets:', e)
      }
    }
    return []
  })

  useEffect(() => {
    document.title = 'Support & Privacy | Dhanrakshak'
  }, [])

  const handleTabChange = (tabId: string) => {
    setSearchParams({ tab: tabId })
  }

  // Toggle FAQ accordion
  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  // Handle support ticket form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)

    // Form validation
    const newErrors: Record<string, string> = {}
    if (!name.trim()) {
      newErrors.name = 'Name is required'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!subject.trim()) {
      newErrors.subject = 'Subject is required'
    }

    if (message.trim().length < 10) {
      newErrors.message = 'Message must contain at least 10 characters'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    // Simulate database submission delay
    setTimeout(() => {
      const newTicket: Ticket = {
        id: `TCK-${Math.floor(100000 + Math.random() * 900000)}`,
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        createdAt: new Date().toISOString(),
        status: 'Open',
      }

      const updatedTickets = [newTicket, ...tickets]
      localStorage.setItem('dhanrakshak_support_tickets', JSON.stringify(updatedTickets))
      setTickets(updatedTickets)

      console.log('Support Ticket Logged successfully to sandbox:', newTicket)

      setSubmitting(false)
      setSuccess(true)

      // Reset fields
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    }, 1200)
  }

  // Clear simulated tickets in localStorage
  const clearTickets = () => {
    if (window.confirm('Are you sure you want to clear your ticket history? This does not affect active servers.')) {
      localStorage.removeItem('dhanrakshak_support_tickets')
      setTickets([])
    }
  }

  // FAQ List Definition
  const faqs = [
    {
      q: 'Why does Dhanrakshak scan emails?',
      a: 'It scans incoming emails to locate transaction alerts containing NEFT, RTGS, UPI, credit, or debit details. This automated scanner processes SMS/Email copy to populate expense registries instantly, eliminating tedious manual entry pipelines.',
    },
    {
      q: 'Are my passwords and credentials safe?',
      a: 'Absolutely. Dhanrakshak never requests, stores, or transmits netbanking passwords, credit/debit card PINs, or OTPs. Email access is delegated securely via standard OAuth 2.0 authorization tokens directly provided by Google, allowing you to revoke access at any time.',
    },
    {
      q: 'Why does my Google connection expire?',
      a: 'Standard Google OAuth tokens expire automatically if the application is in "Testing" mode or if security credentials are reset. If scanning halts, simply sign out and log back in to trigger a fresh, secure authorization session and fetch a new token.',
    },
    {
      q: 'Do you scan other personal emails?',
      a: 'No. Our scanner uses strict client-side regular expressions to target transaction alerts and filters out non-financial documents. Newsletter subscriptions, personal correspondence, advertisements, and sensitive OTP logs are completely ignored.',
    },
  ]

  // Sidebar Tabs Config
  const tabs = [
    { id: 'privacy', label: 'Privacy Policy', icon: '🛡️' },
    { id: 'faq', label: 'FAQs', icon: '❓' },
    { id: 'contact', label: 'Help & Contact', icon: '✉️' },
    { id: 'developer', label: 'Developer Details', icon: '💻' },
  ]

  return (
    <AppLayout>
      <div className="min-h-screen bg-sb-canvas-soft -mx-4 -my-6 px-4 py-8 sm:-mx-6 sm:px-6" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
        
        {/* Header */}
        <div className="mb-8 max-w-[1200px] mx-auto">
          <h1 className="sb-display-lg" style={{ color: 'var(--sb-ink)' }}>Support Center</h1>
          <p className="mt-1 sb-caption animate-fade-in" style={{ color: 'var(--sb-ink-muted)' }}>
            Review security compliance documents, browse FAQs, contact support, and explore technical details.
          </p>
        </div>

        {/* Outer Grid layout */}
        <div className="grid gap-6 md:grid-cols-12 max-w-[1200px] mx-auto">
          
          {/* Navigation Tabs Bar / Sidebar */}
          <div className="md:col-span-3 space-y-2">
            {/* Desktop vertical sidebar navigation */}
            <div className="hidden md:flex flex-col space-y-1.5 p-2 rounded-[12px] bg-sb-canvas border border-sb-hairline shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-[6px] text-left transition-all cursor-pointer border-none bg-transparent ${
                      isActive
                        ? 'bg-[rgba(62,207,142,0.1)] text-[#24b47e] border border-[rgba(62,207,142,0.25)]'
                        : 'text-sb-ink-muted hover:text-sb-ink hover:bg-sb-canvas-soft'
                    }`}
                    aria-selected={isActive}
                    role="tab"
                  >
                    <span className="text-lg" aria-hidden="true">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Mobile horizontal navigation tabs */}
            <div className="flex flex-row flex-nowrap md:hidden overflow-x-auto pb-2 gap-2 scrollbar-none max-w-full">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-[6px] whitespace-nowrap transition-all shrink-0 cursor-pointer border-none bg-transparent ${
                      isActive
                        ? 'bg-[rgba(62,207,142,0.1)] text-[#24b47e] border border-[rgba(62,207,142,0.25)]'
                        : 'bg-sb-canvas text-sb-ink-muted border border-sb-hairline'
                    }`}
                    aria-selected={isActive}
                    role="tab"
                  >
                    <span className="text-sm" aria-hidden="true">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active Tab Panel Details */}
          <div className="md:col-span-9">
            
            {/* Tab 1: Privacy Policy */}
            {activeTab === 'privacy' && (
              <div className="space-y-6 animate-scale-up" role="tabpanel" aria-label="Privacy Policy">
                <div className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-sb-canvas space-y-6">
                  <div className="flex items-center gap-3 border-b border-sb-hairline pb-4">
                    <span className="text-3xl" aria-hidden="true">🛡️</span>
                    <div>
                      <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>Privacy Policy & Security Standards</h2>
                      <p className="sb-micro uppercase tracking-wider font-semibold mt-0.5 text-sb-ink-muted">
                        Zero-Trust Client Matching Model
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5 sb-caption leading-relaxed" style={{ color: 'var(--sb-ink-secondary)' }}>
                    <section className="space-y-2">
                      <h3 className="sb-heading-md" style={{ color: 'var(--sb-ink)', fontSize: 16 }}>
                        1. Client-Side Processing Architecture
                      </h3>
                      <p>
                        Dhanrakshak reads transactions strictly client-side. The email scanning heuristics and regular expression engines parse bank alerts locally inside your browser cache. Personal correspondence, newsletters, and private emails never leave your physical device.
                      </p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="sb-heading-md" style={{ color: 'var(--sb-ink)', fontSize: 16 }}>
                        2. Restricted OAuth 2.0 Scopes
                      </h3>
                      <p>
                        We utilize Google OAuth 2.0 configurations targeting the restricted <code className="font-mono text-xs bg-sb-canvas-soft px-1 rounded border border-sb-hairline">gmail.readonly</code> scope. This is a read-only credential that only reads email content. We have zero permissions to write, send, delete, or modify emails.
                      </p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="sb-heading-md" style={{ color: 'var(--sb-ink)', fontSize: 16 }}>
                        3. Row-Level Data Security (RLS)
                      </h3>
                      <p>
                        All categorized transactions saved to our cloud servers are protected by Supabase Row-Level Security (RLS) tables. This physical partitioning prevents cross-tenant access. No user can view, edit, or leak your transactions, even in case of system-wide anomalies.
                      </p>
                    </section>

                    <div className="p-4 rounded-[6px] bg-sb-canvas-soft border border-sb-hairline">
                      <p className="font-medium" style={{ color: 'var(--sb-ink)' }}>🔒 Summary Security Commitment:</p>
                      <p className="mt-1" style={{ color: 'var(--sb-ink-muted)' }}>
                        No selling data · No marketing profiling · No banking passwords requested · Fully auditable open-source code base.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: FAQs */}
            {activeTab === 'faq' && (
              <div className="space-y-4 animate-scale-up" role="tabpanel" aria-label="Frequently Asked Questions">
                <div className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-sb-canvas space-y-4">
                  <div className="flex items-center gap-3 border-b border-sb-hairline pb-4">
                    <span className="text-3xl" aria-hidden="true">❓</span>
                    <div>
                      <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>Frequently Asked Questions</h2>
                      <p className="sb-micro uppercase tracking-wider font-semibold mt-0.5 text-sb-ink-muted">
                        Common Security & Product Queries
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {faqs.map((faq, idx) => {
                      const isExpanded = expandedFaq === idx
                      return (
                        <div key={idx} className="rounded-[6px] border border-sb-hairline overflow-hidden">
                          <button
                            onClick={() => toggleFaq(idx)}
                            className="w-full text-left px-4 py-4 flex items-center justify-between font-semibold transition-colors bg-sb-canvas hover:bg-sb-canvas-soft border-none cursor-pointer"
                          >
                            <span className="sb-caption font-semibold" style={{ color: 'var(--sb-ink)' }}>{faq.q}</span>
                            <span className="text-lg" style={{ color: 'var(--sb-primary)' }}>
                              {isExpanded ? '−' : '＋'}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-sb-hairline bg-sb-canvas-soft">
                              <p className="sb-caption leading-relaxed" style={{ color: 'var(--sb-ink-muted)' }}>{faq.a}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Help & Contact Form */}
            {activeTab === 'contact' && (
              <div className="space-y-6 animate-scale-up" role="tabpanel" aria-label="Help and Contact">
                <div className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-sb-canvas space-y-6">
                  <div className="flex items-center justify-between border-b border-sb-hairline pb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl" aria-hidden="true">✉️</span>
                      <div>
                        <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>Submit Support Ticket</h2>
                        <p className="sb-micro uppercase tracking-wider font-semibold mt-0.5 text-sb-ink-muted">
                          Sandbox Ticket simulator
                        </p>
                      </div>
                    </div>
                    {tickets.length > 0 && (
                      <button
                        onClick={clearTickets}
                        className="sb-caption text-red-500 hover:text-red-700 bg-transparent border-none cursor-pointer font-medium"
                      >
                        Clear History
                      </button>
                    )}
                  </div>

                  {success && (
                    <div className="rounded-[6px] p-4 bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)]">
                      <p className="sb-caption font-semibold" style={{ color: '#16a34a' }}>👑 Ticket Logged Successfully!</p>
                      <p className="sb-micro mt-1 text-sb-ink-muted">
                        This sandbox ticket has been written directly to your local workspace records.
                      </p>
                    </div>
                  )}

                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="sb-micro block mb-1 font-medium text-sb-ink-muted">Full Name</label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="sb-text-input"
                          placeholder="e.g. Piyush Khandelwal"
                        />
                        {errors.name && <p className="sb-micro text-red-500 mt-1">{errors.name}</p>}
                      </div>
                      <div>
                        <label className="sb-micro block mb-1 font-medium text-sb-ink-muted">Email Address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="sb-text-input"
                          placeholder="e.g. piyush@example.com"
                        />
                        {errors.email && <p className="sb-micro text-red-500 mt-1">{errors.email}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="sb-micro block mb-1 font-medium text-sb-ink-muted">Subject</label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="sb-text-input"
                        placeholder="e.g. Gmail integration scan error"
                      />
                      {errors.subject && <p className="sb-micro text-red-500 mt-1">{errors.subject}</p>}
                    </div>

                    <div>
                      <label className="sb-micro block mb-1 font-medium text-sb-ink-muted">Detailed Message</label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        className="sb-text-input resize-none"
                        placeholder="Tell us what went wrong. Include bank or credit card names..."
                      />
                      {errors.message && <p className="sb-micro text-red-500 mt-1">{errors.message}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="sb-btn-primary w-full text-center"
                    >
                      {submitting ? 'Logging ticket…' : 'Submit Ticket'}
                    </button>
                  </form>

                  {/* Local Ticket Log */}
                  {tickets.length > 0 && (
                    <div className="pt-6 border-t border-sb-hairline space-y-4">
                      <h3 className="sb-heading-md" style={{ color: 'var(--sb-ink)', fontSize: 16 }}>Your Ticket Log (Sandbox Local)</h3>
                      <div className="space-y-3">
                        {tickets.map((t) => (
                          <div key={t.id} className="rounded-[6px] p-4 bg-sb-canvas-soft border border-sb-hairline text-xs space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sb-ink-secondary">{t.id} · {t.subject}</span>
                              <span className="sb-micro px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {t.status}
                              </span>
                            </div>
                            <p className="text-sb-ink-muted leading-relaxed">{t.message}</p>
                            <p className="sb-micro text-sb-ink-faint">
                              Logged on: {new Date(t.createdAt).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Developer Details */}
            {activeTab === 'developer' && (
              <div className="space-y-6 animate-scale-up" role="tabpanel" aria-label="Developer Details">
                <div className="sb-card-light shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-sb-canvas space-y-6">
                  <div className="flex items-center gap-3 border-b border-sb-hairline pb-4">
                    <span className="text-3xl" aria-hidden="true">💻</span>
                    <div>
                      <h2 className="sb-heading-md" style={{ color: 'var(--sb-ink)' }}>Developer Details & Audits</h2>
                      <p className="sb-micro uppercase tracking-wider font-semibold mt-0.5 text-sb-ink-muted">
                        Build Integrity & Open Source Core
                      </p>
                    </div>
                  </div>

                  {/* Creator Card */}
                  <div className="p-5 rounded-[12px] bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.2)] text-xs space-y-2">
                    <p className="text-[#24b47e] font-bold uppercase tracking-wider">Creator & Lead Architect</p>
                    <p className="text-sb-ink text-sm font-bold flex items-center gap-1.5">
                      👤 Piyush Khandelwal <span className="text-xs font-normal text-sb-ink-muted">(Chartered Accountant & Developer)</span>
                    </p>
                    <p className="text-sb-ink-secondary leading-relaxed">
                      Dhanrakshak was conceptualized, designed, and developed by <strong>Piyush Khandelwal</strong>, a Chartered Accountant. 
                      Built to combine professional financial domain expertise with a strict focus on local client-side processing, secure row-level isolated databases (Supabase), and seamless automated wealth guarding.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 rounded-[6px] bg-sb-canvas-soft border border-sb-hairline text-xs space-y-2">
                      <p className="text-sb-ink-muted font-bold uppercase tracking-wider">Release Version</p>
                      <p className="text-sb-ink text-sm font-semibold">1.0.0 (Stable Production Build)</p>
                      <p className="text-sb-ink-muted leading-normal">
                        Verified cryptographic release with local regular expressions modules active.
                      </p>
                    </div>

                    <div className="p-4 rounded-[6px] bg-sb-canvas-soft border border-sb-hairline text-xs space-y-2">
                      <p className="text-sb-ink-muted font-bold uppercase tracking-wider">Open Source License</p>
                      <p className="text-sb-ink text-sm font-semibold">MIT License (Open-Source)</p>
                      <p className="text-sb-ink-muted leading-normal">
                        Dhanrakshak is fully auditable. Anyone can clone, test, or modify the source repository.
                      </p>
                    </div>
                  </div>

                  {/* Architecture spec */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--sb-ink)' }}>System Architecture Specifications</h3>
                    <div className="rounded-[6px] border border-sb-hairline bg-sb-canvas-soft overflow-hidden text-xs">
                      <div className="grid grid-cols-3 border-b border-sb-hairline p-3 font-semibold text-sb-ink-secondary bg-sb-canvas-soft">
                        <div>Layer</div>
                        <div>Technology</div>
                        <div>Deployment Mode</div>
                      </div>
                      <div className="grid grid-cols-3 border-b border-sb-hairline p-3 text-sb-ink-muted">
                        <div className="font-medium text-sb-ink">Frontend Client</div>
                        <div>React (Vite) + TypeScript</div>
                        <div>Client-Side SPA</div>
                      </div>
                      <div className="grid grid-cols-3 border-b border-sb-hairline p-3 text-sb-ink-muted">
                        <div className="font-medium text-sb-ink">Database & Security</div>
                        <div>Supabase Engine</div>
                        <div>Row-Level Security (RLS)</div>
                      </div>
                      <div className="grid grid-cols-3 border-b border-sb-hairline p-3 text-sb-ink-muted">
                        <div className="font-medium text-sb-ink">Email Delegation</div>
                        <div>Google OAuth 2.0</div>
                        <div>Restricted gmail.readonly API</div>
                      </div>
                      <div className="grid grid-cols-3 p-3 text-sb-ink-muted">
                        <div className="font-medium text-sb-ink">Parsing Engine</div>
                        <div>RegExp Regex Rules</div>
                        <div>100% Browser Local Parsing</div>
                      </div>
                    </div>
                  </div>

                  {/* Repos and info */}
                  <div className="space-y-4 pt-2 border-t border-sb-hairline">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--sb-ink)' }}>Auditable Repositories</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <a
                        href="https://github.com/dhanrakshak/app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 p-3 rounded-[6px] border border-sb-hairline hover:border-[#24b47e]/40 bg-sb-canvas-soft hover:bg-sb-canvas flex items-center justify-between text-xs transition-all group no-underline"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📁</span>
                          <div>
                            <p className="font-bold text-sb-ink group-hover:text-[#24b47e] transition-colors">
                              dhanrakshak/app
                            </p>
                            <p className="text-[10px] text-sb-ink-muted">Core application repo</p>
                          </div>
                        </div>
                        <span className="text-sb-ink-muted group-hover:text-sb-ink-faint">↗</span>
                      </a>

                      <a
                        href="mailto:support@dhanrakshak.org"
                        className="flex-1 p-3 rounded-[6px] border border-sb-hairline hover:border-[#24b47e]/40 bg-sb-canvas-soft hover:bg-sb-canvas flex items-center justify-between text-xs transition-all group no-underline"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📧</span>
                          <div>
                            <p className="font-bold text-sb-ink group-hover:text-[#24b47e] transition-colors">
                              support@dhanrakshak.org
                            </p>
                            <p className="text-[10px] text-sb-ink-muted">Official email contact</p>
                          </div>
                        </div>
                        <span className="text-sb-ink-muted group-hover:text-sb-ink-faint">↗</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
