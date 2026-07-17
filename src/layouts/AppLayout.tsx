// ============================================
// AppLayout — Main application shell
// Sticky nav with working links
// ============================================

import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { cn } from '@/utils'
import { useState, useEffect, useCallback } from 'react'
import { useAuth, useToast } from '@/context'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { submitFeedback, getTesterFeedbackLogs, supabase } from '@/services'
import { getActiveReceivables } from '@/services/transactions'
import { getInsurancePolicies } from '@/services/insurance'
import {
  Bell,
  User,
  Settings,
  Crown,
  LogOut,
  Menu,
  X,
  BarChart3,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Star,
  Home,
  CreditCard,
  Plus,
  Sparkles,
} from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
  isStaticLight?: boolean
}

const navItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD },
  { label: 'Expenses', path: ROUTES.EXPENSES },
  { label: 'Budgets', path: ROUTES.BUDGETS },
  { label: 'Pending', path: ROUTES.PENDING },
  { label: 'Insights', path: ROUTES.INSIGHTS },
  { label: 'Subscriptions', path: ROUTES.SUBSCRIPTIONS },
  { label: 'Pricing', path: ROUTES.PRICING },
]

export default function AppLayout({ children, isStaticLight = false }: AppLayoutProps) {
  const { user, signOut, profile, daysLeft, openAuthModal, currencySymbol } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const isAppRoute = [
    '/dashboard',
    '/expenses',
    '/budgets',
    '/pending',
    '/insights',
    '/settings',
    '/profile',
    '/subscriptions',
    '/payment-success'
  ].includes(location.pathname)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  type NotificationItem = { key: string; message: string; type: 'danger' | 'warning' | 'info'; href: string }
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false)

  const getDismissedKeys = (): Set<string> => {
    try {
      const raw = localStorage.getItem('dhanrakshak_dismissed_notifications')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  }

  const fetchNotifications = useCallback(async () => {
    if (!user) return

    // Check if we have cached notifications that are less than 5 minutes old (V2: extended from 30s to reduce Supabase load)
    try {
      const cachedData = sessionStorage.getItem('dhanrakshak_notifications_cache')
      if (cachedData) {
        const { items, timestamp } = JSON.parse(cachedData)
        if (Date.now() - timestamp < 300000) {
          const dismissed = getDismissedKeys()
          setNotifications((items as NotificationItem[]).filter((i) => !dismissed.has(i.key)))
          return
        }
      }
    } catch (e) {}

    const items: NotificationItem[] = []

    try {
      const curMonth = new Date().toISOString().substring(0, 7)

      // 1. Fetch pending alerts count
      const { count: pendingCount, error: pendingErr } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending')

      if (!pendingErr && pendingCount && pendingCount > 0) {
        items.push({
          key: 'pending_count',
          message: `You have ${pendingCount} pending transaction alert(s) requiring review.`,
          type: 'info',
          href: '/pending',
        })
      }

      // 2. Fetch budgets and expenses for current month
      const [budgetsRes, summaryRes] = await Promise.all([
        supabase.from('budgets').select('*').eq('user_id', user.id).eq('month', curMonth),
        supabase.from('transactions').select('amount, category').eq('approval_status', 'approved').eq('type', 'debit').gte('date', `${curMonth}-01`)
      ])

      if (!budgetsRes.error && budgetsRes.data && !summaryRes.error && summaryRes.data) {
        const spentMap: Record<string, number> = {}
        summaryRes.data.forEach((t) => {
          spentMap[t.category] = (spentMap[t.category] || 0) + Number(t.amount)
        })

        budgetsRes.data.forEach((budget) => {
          const spent = spentMap[budget.category] || 0
          const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
          const catLabel = budget.category.toUpperCase()

          if (pct >= 100) {
            items.push({
              key: `budget_over_${budget.category}_${curMonth}`,
              message: `Budget exceeded for ${catLabel}! (Spent ${Math.round(pct)}% of limit)`,
              type: 'danger',
              href: '/budgets',
            })
          } else if (pct >= 70) {
            items.push({
              key: `budget_near_${budget.category}_${curMonth}`,
              message: `Reached ${Math.round(pct)}% of budget limit for ${catLabel}.`,
              type: 'warning',
              href: '/budgets',
            })
          }
        })
      }

      // 3 & 4. Receivables and insurance premiums due within 7 days or overdue
      const todayStr = new Date().toISOString().split('T')[0]
      const [{ data: receivables }, { data: policies }] = await Promise.all([
        getActiveReceivables(),
        getInsurancePolicies()
      ])

      if (receivables) {
        receivables.forEach((r) => {
          if (!r.expected_return_date) return
          const dueDate = new Date(r.expected_return_date)
          const isOverdue = r.expected_return_date < todayStr
          const daysOut = Math.ceil((dueDate.getTime() - new Date(todayStr).getTime()) / (24 * 60 * 60 * 1000))
          if (isOverdue) {
            items.push({
              key: `receivable_overdue_${r.id}`,
              message: `${r.counterparty || 'Someone'} still owes you back for an expense (overdue).`,
              type: 'danger',
              href: '/dashboard',
            })
          } else if (daysOut <= 7) {
            items.push({
              key: `receivable_soon_${r.id}`,
              message: `${r.counterparty || 'Someone'} owes you back within ${daysOut} day(s).`,
              type: 'warning',
              href: '/dashboard',
            })
          }
        })
      }

      if (policies) {
        policies.forEach((p) => {
          const dueDate = new Date(p.next_due_date)
          const isOverdue = p.next_due_date < todayStr
          const daysOut = Math.ceil((dueDate.getTime() - new Date(todayStr).getTime()) / (24 * 60 * 60 * 1000))
          if (isOverdue) {
            items.push({
              key: `insurance_overdue_${p.id}`,
              message: `${p.policy_name} premium is overdue.`,
              type: 'danger',
              href: '/dashboard',
            })
          } else if (daysOut <= 7) {
            items.push({
              key: `insurance_soon_${p.id}`,
              message: `${p.policy_name} premium due in ${daysOut} day(s).`,
              type: 'warning',
              href: '/dashboard',
            })
          }
        })
      }
    } catch (e) {
      console.error('Error fetching notifications:', e)
    }

    // Save the full (undismissed-filtered) set to cache, then filter for display
    try {
      sessionStorage.setItem('dhanrakshak_notifications_cache', JSON.stringify({
        items,
        timestamp: Date.now()
      }))
    } catch (e) {}

    const dismissed = getDismissedKeys()
    setNotifications(items.filter((i) => !dismissed.has(i.key)))
  }, [user])

  const handleClearNotifications = () => {
    try {
      const dismissed = getDismissedKeys()
      notifications.forEach((n) => dismissed.add(n.key))
      localStorage.setItem('dhanrakshak_dismissed_notifications', JSON.stringify([...dismissed]))
    } catch (e) {}
    setNotifications([])
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 300000) // 5 min — matches cache TTL
    return () => clearInterval(interval)
  }, [user, fetchNotifications])



  // Helper to extract first name of the user, ignoring standard titles
  const getFirstName = (fullName?: string) => {
    const nameToParse = profile?.full_name || fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'Account'
    
    const parts = nameToParse.trim().split(/\s+/)
    let result = parts[0]
    const cleanWord = (word: string) => word.replace(/[^a-zA-Z]/g, '').toLowerCase()
    
    if (parts.length > 1 && ['ca', 'dr', 'mr', 'ms', 'mrs'].includes(cleanWord(parts[0]))) {
      result = parts[1]
    }
    return result
  }

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  // Escape closes whichever header dropdown/menu is open
  useEffect(() => {
    if (!notificationDropdownOpen && !profileDropdownOpen && !mobileMenuOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setNotificationDropdownOpen(false)
      setProfileDropdownOpen(false)
      setMobileMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [notificationDropdownOpen, profileDropdownOpen, mobileMenuOpen])

  // Feedback Modal States
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackCategory, setFeedbackCategory] = useState<'bug' | 'feature_request' | 'ui_ux' | 'other'>('ui_ux')
  const [feedbackRating, setFeedbackRating] = useState<number>(5)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)
  const [feedbackLogs, setFeedbackLogs] = useState<any[]>([])
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    if (feedbackOpen) {
      setFeedbackLogs(getTesterFeedbackLogs())
    }
  }, [feedbackOpen])

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (feedbackMessage.trim().length < 5) return

    setFeedbackLoading(true)
    try {
      const { success } = await submitFeedback({
        rating: feedbackRating,
        category: feedbackCategory,
        message: feedbackMessage,
      })

      if (success) {
        setFeedbackSuccess(true)
        setFeedbackMessage('')
        setFeedbackRating(5)
        setFeedbackCategory('ui_ux')
        setFeedbackLogs(getTesterFeedbackLogs())
        
        // Auto close overlay after 2.2 seconds
        setTimeout(() => {
          setFeedbackSuccess(false)
          setFeedbackOpen(false)
        }, 2200)
      }
    } catch (err) {
      console.error('Error submitting feedback:', err)
    } finally {
      setFeedbackLoading(false)
    }
  }

  // First-run privacy explainer — a single static dismissible card (no fake
  // "verification" timer; just tells the user what happens once and gets out
  // of the way).
  const [showPrivacyNote, setShowPrivacyNote] = useState(() => {
    try {
      return localStorage.getItem('dhanrakshak_security_acknowledged') !== 'true'
    } catch (e) {
      return true
    }
  })

  const handleDismissPrivacyNote = () => {
    setShowPrivacyNote(false)
    try {
      localStorage.setItem('dhanrakshak_security_acknowledged', 'true')
    } catch (e) {}
  }

  const [isLight, setIsLight] = useState(() => {
    try {
      const stored = localStorage.getItem('dhanrakshak_theme')
      if (stored !== null) {
        return stored === 'light'
      }
      // Default to Day Mode (Light Mode) on first run for both mobile and desktop logins
      return true
    } catch (e) {
      return true
    }
  })

  useEffect(() => {
    try {
      if (isLight) {
        document.documentElement.classList.add('light')
        localStorage.setItem('dhanrakshak_theme', 'light')
      } else {
        document.documentElement.classList.remove('light')
        localStorage.setItem('dhanrakshak_theme', 'dark')
      }
    } catch (e) {}
  }, [isLight])

  useEffect(() => {
    const handleThemeEvent = () => {
      const stored = localStorage.getItem('dhanrakshak_theme')
      setIsLight(stored === 'light')
    }
    window.addEventListener('dhanrakshak_theme_changed', handleThemeEvent)
    return () => {
      window.removeEventListener('dhanrakshak_theme_changed', handleThemeEvent)
    }
  }, [])



  // PWA Install Prompt State and Logic for Mobile Viewports
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e)
      // Check if user has previously dismissed the banner
      const isDismissed = localStorage.getItem('dhanrakshak_pwa_dismissed') === 'true'
      if (!isDismissed) {
        setShowInstallBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setShowInstallBanner(false)
    }
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    // Show the install prompt
    deferredPrompt.prompt()
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    console.log(`User response to the install prompt: ${outcome}`)
    // We've used the prompt, and can't use it again, discard it
    setDeferredPrompt(null)
    setShowInstallBanner(false)
  }

  const handleDismissBanner = () => {
    localStorage.setItem('dhanrakshak_pwa_dismissed', 'true')
    setShowInstallBanner(false)
  }

  return (
    <div className={cn("min-h-screen flex flex-col", isStaticLight ? "bg-sb-canvas text-sb-ink" : "aurora-bg bg-surface-0 text-zinc-100")}>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <header className={cn(
        "sticky top-0 z-50 w-full border-b select-none transition-all duration-300",
        isStaticLight
          ? "border-sb-hairline bg-sb-canvas/90 text-sb-ink backdrop-blur-xl"
          : "border-border-subtle bg-surface-1/95 backdrop-blur-md text-zinc-100 shadow-[var(--shadow-sm)]"
      )}>
        <div className="mx-auto max-w-[1280px] h-[64px] flex items-center justify-between px-6 gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <span className="text-sm font-black flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white shadow-[var(--shadow-sm)] border-0 group-hover:scale-115 group-hover:rotate-12 transition-all duration-300" aria-hidden="true">{currencySymbol}</span>
            <div className="flex items-center gap-2.5">
              <div className="text-base tracking-tight leading-none">
                <span className={cn(
                  "font-extrabold transition-colors duration-300",
                  (isStaticLight || isLight) ? "text-sb-primary" : "text-brand-400"
                )}>Dhan</span><span className={cn((isStaticLight || isLight) ? "text-sb-ink" : "text-white")}>rakshak</span>
              </div>
              <span className={cn(
                "text-xs font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border hidden md:inline-flex items-center gap-1.5",
                (isStaticLight || isLight)
                  ? "bg-brand-50 border-brand-200/60 text-brand-700"
                  : "bg-brand-500/10 border-brand-500/20 text-brand-400"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", (isStaticLight || isLight) ? "bg-brand-600" : "bg-brand-400")} />
                Automated Tracker
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          {user && isAppRoute ? (
            <nav className="hidden lg:flex items-center gap-3 text-xs font-semibold min-w-0 overflow-x-auto scrollbar-none" aria-label="Desktop navigation">
                {navItems
                  .filter(item => item.path !== ROUTES.PRICING)
                  .map((item) => {
                    const isActive = location.pathname === item.path
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "relative py-1.5 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all duration-200 whitespace-nowrap",
                          isActive
                            ? isStaticLight
                              ? "bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/60 shadow-sm"
                              : "text-white font-bold nav-active-indicator"
                            : isStaticLight
                              ? "text-sb-ink-muted hover:text-sb-ink hover:bg-sb-canvas-soft"
                              : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                        )}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
              </nav>
            ) : (
              <nav className="hidden md:flex items-center gap-8" aria-label="Desktop navigation">
                {[
                  { label: 'Daily Life', href: '/#daily-utility' },
                  { label: 'Features', href: '/#features' },
                  { label: 'Pricing', href: '/pricing', isLink: true },
                  { label: 'Install App', href: '/#install-guide' },
                  { label: 'FAQ', href: '/#faq' },
                  { label: 'Support', href: '/support', isLink: true },
                ].map((item) =>
                  item.isLink ? (
                    <Link
                      key={item.label}
                      to={item.href}
                      className="sb-caption font-semibold transition-colors text-sb-ink-muted hover:text-sb-primary whitespace-nowrap no-underline"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href}
                      className="sb-caption font-semibold transition-colors text-sb-ink-muted hover:text-sb-primary whitespace-nowrap no-underline"
                    >
                      {item.label}
                    </a>
                  )
                )}
              </nav>
            )}

            {/* Actions: Notifications, Profile, Hamburger, Upgrade CTA */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">


              {/* Notification Bell */}
              {user && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                    className={cn(
                      "transition-colors h-11 w-11 flex items-center justify-center rounded-lg relative cursor-pointer",
                      isStaticLight
                        ? "text-sb-ink-muted hover:text-sb-ink hover:bg-sb-canvas-soft"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                    title="Notifications"
                    aria-label={notifications.length > 0 ? `View notifications (${notifications.length} unread)` : 'View notifications'}
                    aria-expanded={notificationDropdownOpen}
                  >
                    <Bell className="h-4 w-4" />
                    {notifications.length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-danger-text)] px-0.5 text-[10px] font-bold text-white ring-1 ring-white/10">
                        {notifications.length > 9 ? '9+' : notifications.length}
                      </span>
                    )}
                  </button>

                  {notificationDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setNotificationDropdownOpen(false)} />
                      <div className={cn("absolute right-0 mt-2 w-64 rounded-xl border p-3 shadow-2xl z-50 animate-scale-up backdrop-blur-xl max-h-[80vh] overflow-y-auto", isStaticLight ? "border-sb-hairline bg-sb-canvas text-sb-ink" : "border-border-subtle bg-surface-1 text-zinc-100")}>
                        <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-2">
                          <span className={cn("text-xs font-bold uppercase tracking-widest flex items-center gap-1.5", isStaticLight ? "text-sb-ink-muted" : "text-zinc-400")}>
                            <Bell className="h-3 w-3" /> Notifications
                          </span>
                          {notifications.length > 0 && (
                            <button
                              onClick={handleClearNotifications}
                              className={cn("text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer", isStaticLight ? "text-sb-primary hover:text-sb-primary-deep" : "text-zinc-500 hover:text-zinc-300")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {notifications.length === 0 ? (
                          <p className="text-xs text-zinc-500 py-4 text-center font-medium">
                            No new notifications. All caught up!
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {notifications.map((n) => (
                              <Link
                                key={n.key}
                                to={n.href}
                                onClick={() => setNotificationDropdownOpen(false)}
                                className={cn(
                                  "block p-2.5 rounded-lg border text-xs leading-relaxed font-semibold transition-all hover:opacity-85",
                                  n.type === 'danger'
                                    ? 'bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]'
                                    : n.type === 'warning'
                                    ? 'bg-[var(--status-warning-subtle)] border-[var(--status-warning-border)] text-[var(--status-warning-text)]'
                                    : (isStaticLight ? 'bg-sb-canvas-soft border-sb-hairline text-sb-ink' : 'bg-surface-2 border-border-subtle text-zinc-300')
                                )}
                              >
                                {n.message}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Upgrade or Status CTA */}
              <div className="hidden sm:flex items-center shrink-0">
                {!isAppRoute && user ? (
                  <Link
                    to="/dashboard"
                    className="sb-btn-primary rounded-[6px] text-xs font-semibold border-0 cursor-pointer whitespace-nowrap shadow-sm"
                  >
                    Dashboard
                  </Link>
                ) : profile?.subscription_status === 'active' ? (
                  profile?.subscription_plan_type === 'monthly' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-[6px] text-xs font-bold uppercase tracking-wider text-zinc-300 bg-surface-2 border border-border-subtle shrink-0 select-none">
                        Monthly Plan 👑
                      </span>
                      <Link
                        to="/pricing"
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-[6px] text-[11px] font-bold uppercase tracking-wider text-[var(--sb-on-primary)] bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-deep)] active:scale-97 transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-sm"
                      >
                        Upgrade to Yearly
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (profile?.subscription_expires_at) {
                            showToast(`Your Yearly Plan is active until ${new Date(profile.subscription_expires_at).toLocaleDateString('en-IN')}`, 'info')
                          }
                        }}
                        className="px-2.5 py-1 rounded-[6px] text-xs font-bold uppercase tracking-wider text-[var(--status-positive-text)] bg-[var(--status-positive-subtle)] border border-[var(--status-positive-border)] shrink-0 cursor-pointer hover:bg-[var(--status-positive-border)]/20 transition-all select-none"
                        title="Click to view validity"
                      >
                        Yearly Plan 👑
                      </button>
                    </div>
                  )
                ) : user ? (
                  <Link
                    to="/pricing"
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-[6px] text-[11px] font-bold uppercase tracking-wider text-[var(--sb-on-primary)] bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-deep)] active:scale-97 transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-sm"
                  >
                    Upgrade
                  </Link>
                ) : (
                  <button
                    onClick={() => openAuthModal()}
                    className="sb-btn-primary rounded-[6px] border-0 cursor-pointer text-xs font-semibold whitespace-nowrap shadow-sm"
                  >
                    Get started
                  </button>
                )}
              </div>

              {/* Profile Dropdown */}
              {user ? (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className={cn(
                      "flex items-center gap-1.5 h-11 px-1 transition-colors cursor-pointer",
                      isStaticLight ? "text-sb-ink hover:text-sb-ink" : "text-zinc-400 hover:text-white"
                    )}
                    aria-label="User profile menu"
                    aria-expanded={profileDropdownOpen}
                  >
                    <div className="h-6 w-6 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-500 overflow-hidden border border-brand-500/25 shrink-0">
                      {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        user?.user_metadata?.full_name?.substring(0, 1).toUpperCase() || 'U'
                      )}
                    </div>
                    <span className="text-[11px] font-medium truncate max-w-[60px] hidden sm:inline">{getFirstName()}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {profileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                      <div className={cn("absolute right-0 mt-2 w-48 rounded-xl border p-2 shadow-xl z-50 animate-scale-up", isStaticLight ? "border-sb-hairline bg-sb-canvas text-sb-ink" : "border-border-subtle bg-surface-1 text-zinc-100")}>
                        <Link
                          to="/profile"
                          onClick={() => setProfileDropdownOpen(false)}
                          className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-100")}
                        >
                          <User className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> Profile Section
                        </Link>
                        <Link
                          to="/settings"
                          onClick={() => setProfileDropdownOpen(false)}
                          className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-100")}
                        >
                          <Settings className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> Settings Section
                        </Link>
                        <Link
                          to="/pricing"
                          onClick={() => setProfileDropdownOpen(false)}
                          className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-100")}
                        >
                          <Crown className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> Pricing & Plans
                        </Link>
                        <button
                          onClick={() => {
                            setProfileDropdownOpen(false)
                            setFeedbackOpen(true)
                          }}
                          className={cn("w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-100")}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> Send Feedback
                        </button>
                        <button
                          onClick={() => {
                            setProfileDropdownOpen(false)
                            signOut()
                          }}
                          className={cn("w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors border-t mt-1.5 pt-1.5 cursor-pointer", isStaticLight ? "border-sb-hairline text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)]" : "border-border-subtle text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)]")}
                        >
                          <LogOut className="h-3.5 w-3.5 text-red-400 shrink-0" /> Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => openAuthModal()}
                  className="sb-caption font-semibold border-0 bg-transparent cursor-pointer text-sb-ink-muted hover:text-sb-ink no-underline whitespace-nowrap px-1"
                >
                  Sign in
                </button>
              )}

              {/* Hamburger Menu button for mobile */}
              <button
                className={cn(
                  "flex lg:hidden h-11 w-11 items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0",
                  isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                )}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

        {/* Mobile/Tablet Horizontal Scrollable Sub-Nav Row (Only visible if logged in and below lg viewport) */}
        {user && isAppRoute && (
          <div className={cn("h-9 border-t flex items-center lg:hidden overflow-hidden select-none", isStaticLight ? "border-sb-hairline bg-sb-canvas-soft" : "border-border-subtle bg-surface-1/40")}>
            <div className="mx-auto max-w-7xl w-full flex items-center px-4 sm:px-6 overflow-x-auto scrollbar-none flex-nowrap py-1 gap-2">
              {navItems
                .filter(item => item.path !== ROUTES.PRICING)
                .map((item) => {
                  const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "transition-colors py-1 px-2.5 rounded-lg text-xs font-semibold shrink-0",
                      isActive 
                        ? (isStaticLight ? "bg-sb-canvas text-sb-ink font-bold border border-sb-hairline" : "bg-white/10 text-white font-bold") 
                        : (isStaticLight ? "text-sb-ink-muted hover:text-sb-ink" : "text-zinc-400 hover:text-white")
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <nav className={cn("border-b px-4 py-3 space-y-1 lg:hidden animate-fade-in", isStaticLight ? "border-sb-hairline bg-sb-canvas text-sb-ink" : "border-static-white/10 bg-black text-static-white")} aria-label="Mobile navigation">
            {user && isAppRoute ? (
              <>
                {navItems
                  .filter(item => item.path !== ROUTES.PRICING)
                  .map((item) => {
                    const isActive = location.pathname === item.path
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? (isStaticLight ? 'bg-sb-canvas-soft text-sb-ink font-bold' : 'bg-static-zinc-800 text-static-white')
                          : (isStaticLight ? 'text-sb-ink-muted hover:bg-sb-canvas-soft' : 'text-static-zinc-400 hover:bg-static-zinc-800 hover:text-static-white')
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn("flex items-center rounded-lg px-3 py-2.5 text-sm font-medium border-t mt-2 pt-3", isStaticLight ? "text-sb-ink border-sb-hairline hover:bg-sb-canvas-soft" : "text-static-zinc-400 hover:text-static-white border-static-white/10")}
                >
                  <User className="h-4 w-4 mr-2 text-zinc-500 shrink-0" /> Profile Section
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    location.pathname === '/settings'
                      ? 'font-bold'
                      : ''
                  )}
                >
                  <Settings className="h-4 w-4 mr-2 text-zinc-500 shrink-0" /> Settings Section
                </Link>
                <Link
                  to="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    location.pathname === '/pricing'
                      ? 'font-bold'
                      : ''
                  )}
                >
                  <Crown className="h-4 w-4 mr-2 text-zinc-500 shrink-0" /> Pricing & Plans
                </Link>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    signOut()
                  }}
                  className={cn("w-full text-left flex items-center rounded-lg px-3 py-2.5 text-sm font-medium border-t mt-1 pt-3 cursor-pointer", isStaticLight ? "border-sb-hairline text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)]" : "border-static-white/10 text-[#f87171] hover:bg-[#f87171]/15")}
                >
                  <LogOut className="h-4 w-4 mr-2 text-red-400 shrink-0" /> Sign Out
                </button>
              </>
            ) : (
              <>
                {user && (
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3 text-center no-underline"
                  >
                    <BarChart3 className="h-4 w-4 shrink-0" /> Go to Dashboard
                  </Link>
                )}
                <a href="/#daily-utility" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>Daily Life</a>
                <a href="/#features" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>Features</a>
                <a href="/#install-guide" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>Install App</a>
                <a href="/#faq" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>FAQ</a>
                <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium no-underline", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>Pricing</Link>
                <Link to="/support" onClick={() => setMobileMenuOpen(false)} className={cn("block rounded-lg px-3 py-2 text-sm font-medium no-underline", isStaticLight ? "text-sb-ink hover:bg-sb-canvas-soft" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>Support</Link>

                {user ? (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      signOut()
                    }}
                    className={cn("w-full text-left flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium border-t mt-1 pt-3 cursor-pointer", isStaticLight ? "border-sb-hairline text-[var(--status-danger-text)] hover:bg-[var(--status-danger-subtle)]" : "border-static-white/10 text-[#f87171] hover:bg-[#f87171]/15")}
                  >
                    <LogOut className="h-4 w-4 text-red-400 shrink-0" /> Sign Out
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false)
                        openAuthModal()
                      }}
                      className={cn("w-full block rounded-lg px-3 py-2 text-sm font-medium text-center border mt-3 cursor-pointer", isStaticLight ? "bg-sb-canvas border-sb-hairline text-sb-ink" : "bg-zinc-900 border-zinc-700 text-white")}
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false)
                        openAuthModal()
                      }}
                      className="w-full block rounded-lg px-3 py-2.5 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 text-center rounded-[6px] mt-1.5 border-0 cursor-pointer"
                    >
                      Get Started
                    </button>
                  </>
                )}
              </>
            )}
          </nav>
        )}
      </header>

      {/* Main Content */}
      {profile?.subscription_status === 'trial' && (
        <div className="bg-[var(--status-warning-subtle)] text-[var(--status-warning-text)] text-xs font-semibold py-2.5 px-4 text-center flex flex-col sm:flex-row items-center justify-center gap-1.5 shadow-inner border-b border-[var(--status-warning-border)]">
          <span className="flex items-center gap-1.5 justify-center">
            <Clock className="h-3.5 w-3.5 shrink-0" /> Dhanrakshak Trial: You have {daysLeft} days remaining of full Pro access.
          </span>
          <Link to="/pricing" className="underline hover:opacity-85 transition-opacity font-bold text-[var(--status-warning-text)] flex items-center gap-1">
            Upgrade Account to Keep Auto-Sync Active <Crown className="h-3 w-3 shrink-0" />
          </Link>
        </div>
      )}
      <main className="mx-auto flex-1 max-w-7xl w-full px-4 py-6 sm:px-6" id="main-content">
        {user && isAppRoute && showPrivacyNote && (
          <div className="mb-6 rounded-2xl border border-border-subtle bg-surface-1 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3 shadow-[var(--shadow-sm)]">
            <div className="flex-1 space-y-1.5 text-xs text-zinc-400 leading-relaxed">
              <p className="text-sm font-semibold text-text-primary">How your data is handled</p>
              <p>Bank alerts are read and parsed directly in your browser — nothing is uploaded. Your Google access is read-only, and we never ask for passwords, PINs, or OTPs.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDismissPrivacyNote} className="shrink-0 self-start sm:self-auto">
              Got it
            </Button>
          </div>
        )}
        {children}
      </main>

      {/* Footer Nav and Legal compliance links */}
      <footer className={cn("border-t pt-8 pb-20 md:pb-8 px-4 sm:px-6 mt-auto", isStaticLight ? "border-sb-hairline bg-sb-canvas-soft text-sb-ink-muted" : "border-border-subtle bg-surface-1/40 text-zinc-400")}>
        <div className={cn("mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left text-xs", isStaticLight ? "text-sb-ink-muted" : "text-zinc-400")}>
          <div>
            <p className={cn("font-semibold", isStaticLight ? "text-sb-ink" : "text-zinc-300")}>© 2026 Dhanrakshak · All Rights Reserved</p>
            <p className="mt-1">Version 1.0.0 (Production Build) · Proprietary Closed-Source License</p>
          </div>
          <div className={cn("flex flex-wrap justify-center gap-6 font-medium", isStaticLight ? "text-sb-ink-muted" : "")}>
            <Link to="/privacy" className="hover:text-brand-400 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-brand-400 transition-colors">Terms of Service</Link>
            <Link to="/refund-policy" className="hover:text-brand-400 transition-colors">Refund Policy</Link>
            <Link to="/support?tab=faq" className="hover:text-brand-400 transition-colors">FAQs</Link>
            <Link to="/support?tab=contact" className="hover:text-brand-400 transition-colors">Help & Contact</Link>
          </div>
        </div>
      </footer>

      {/* Feedback Modal — opened from the profile menu / Settings, not a FAB */}
      <Modal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title={feedbackSuccess ? 'Feedback submitted' : 'Send feedback'}
      >
            {/* Success screen */}
            {feedbackSuccess ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 animate-fade-in">
                <div className="h-16 w-16 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-3xl">
                  🎉
                </div>
                <h3 className="text-lg font-bold text-text-primary">Feedback submitted!</h3>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Thank you! Your feedback helps us make Dhanrakshak better.
                </p>
                <div className="w-10 h-1 bg-brand-500 rounded-full mt-2" />
              </div>
            ) : (
              <>
                {/* Form */}
                <form onSubmit={handleFeedbackSubmit} className="space-y-4 flex-1">
                  
                  {/* Category Selection */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                      Feedback Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'ui_ux', label: '🎨 UI/UX Design', desc: 'Spacing & styles' },
                        { key: 'bug', label: '🐛 Bug Report', desc: 'Unexpected error' },
                        { key: 'feature_request', label: '💡 Feature Idea', desc: 'New suggestions' },
                        { key: 'other', label: '❓ Other Feedback', desc: 'General thoughts' }
                      ].map((cat) => (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setFeedbackCategory(cat.key as any)}
                          className={cn(
                            'p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer',
                            feedbackCategory === cat.key
                              ? 'bg-brand-500/10 border-brand-500/50 text-brand-400'
                              : 'bg-surface-2/40 border-border-subtle/50 text-zinc-400 hover:bg-surface-2/85 hover:text-white'
                          )}
                        >
                          <p className="text-xs font-bold">{cat.label}</p>
                          <p className="text-xs opacity-60 mt-0.5 leading-normal">{cat.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rating Selector */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                      How was your experience?
                    </label>
                    <div className="flex items-center justify-between bg-surface-2/40 border border-border-subtle/40 rounded-2xl p-3">
                      {[
                        { val: 1, emoji: '😠', label: 'Bad' },
                        { val: 2, emoji: '🙁', label: 'Poor' },
                        { val: 3, emoji: '😐', label: 'Ok' },
                        { val: 4, emoji: '🙂', label: 'Good' },
                        { val: 5, emoji: '😍', label: 'Love it' }
                      ].map((rt) => (
                        <button
                          key={rt.val}
                          type="button"
                          onClick={() => setFeedbackRating(rt.val)}
                          className="flex flex-col items-center gap-1 focus:outline-none group relative cursor-pointer"
                        >
                          <span
                            className={cn(
                              'text-2xl transition-all duration-200 hover:scale-125 select-none',
                              feedbackRating === rt.val
                                ? 'scale-115 opacity-100'
                                : 'opacity-40 hover:opacity-100'
                            )}
                          >
                            {rt.emoji}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-bold transition-colors duration-200',
                              feedbackRating === rt.val ? 'text-amber-400' : 'text-zinc-500'
                            )}
                          >
                            {rt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Suggestion Text */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                      Suggestions or Issue details
                    </label>
                    <textarea
                      placeholder="Let us know what can be improved or what errors you encountered..."
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      disabled={feedbackLoading}
                      maxLength={500}
                      rows={4}
                      required
                      className="w-full bg-surface-2/60 border border-border-subtle rounded-2xl p-3.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400 transition-all resize-none leading-relaxed"
                    />
                    <div className="flex justify-between items-center mt-1 text-xs text-zinc-500 font-semibold px-1">
                      <span>Minimum 5 characters</span>
                      <span>{feedbackMessage.length}/500</span>
                    </div>
                  </div>

                  <Button type="submit" block loading={feedbackLoading} disabled={feedbackMessage.trim().length < 5}>
                    Submit Feedback
                  </Button>
                </form>

                {/* Expandable Submitted Feedback History Log */}
                {feedbackLogs.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-subtle/50">
                    <button
                      type="button"
                      onClick={() => setShowLogs(!showLogs)}
                      className="w-full flex items-center justify-between text-xs font-bold text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <span>Your submitted feedback ({feedbackLogs.length})</span>
                      {showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {showLogs && (
                      <div className="mt-3 space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {feedbackLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-xl bg-surface-2/40 border border-border-subtle/30 text-xs leading-relaxed space-y-1.5"
                          >
                            <div className="flex justify-between items-center text-xs font-bold text-zinc-400">
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold uppercase",
                                log.category === 'bug'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : log.category === 'feature_request'
                                  ? 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700/50'
                              )}>
                                {log.category === 'bug'
                                  ? '🐛 Bug'
                                  : log.category === 'feature_request'
                                  ? '💡 Feature'
                                  : log.category === 'ui_ux'
                                  ? '🎨 UI/UX'
                                  : '❓ Other'}
                              </span>
                              <span>{new Date(log.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-zinc-200 break-words text-xs">{log.message}</p>
                            <div className="flex items-center gap-1 text-amber-400 font-bold text-xs">
                              <Star className="h-3 w-3 fill-current" />
                              <span>Rating: {log.rating}/5</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
      </Modal>

      {/* PWA Install Banner for Mobile Viewports */}
      {showInstallBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-50 md:hidden animate-slide-up">
          <div className="bg-surface-1/95 border border-border-subtle/85 backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 shadow-[var(--shadow-sm)]">
                <span className="text-base font-bold text-static-white">{currencySymbol}</span>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white leading-tight">Install Dhanrakshak PWA</h4>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">Add to your home screen for quick secure access.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDismissBanner}
                className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-bold text-zinc-400 hover:text-white cursor-pointer transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleInstallClick}
                className="px-4 py-1.5 rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] shadow-[var(--shadow-sm)] cursor-pointer transition-colors hover:bg-[var(--btn-primary-bg-hover)] active:bg-[var(--btn-primary-bg-active)]"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================== */}
      {/* Mobile Bottom Navigation Bar — shown only on mobile (<md) */}
      {/* =========================================================== */}
      {user && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-1/95 backdrop-blur-md border-t border-border-subtle safe-area-inset-bottom"
          aria-label="Mobile navigation"
        >
          <div className="flex items-center justify-around h-16 px-1">
            {/* Dashboard */}
            <Link
              to={ROUTES.DASHBOARD}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-all duration-200',
                location.pathname === ROUTES.DASHBOARD
                  ? 'text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              aria-label="Dashboard"
            >
              <Home className="h-5 w-5" />
              <span className="text-xs font-semibold tracking-wide">Home</span>
            </Link>

            {/* Expenses */}
            <Link
              to={ROUTES.EXPENSES}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-all duration-200',
                location.pathname === ROUTES.EXPENSES
                  ? 'text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              aria-label="Expenses"
            >
              <CreditCard className="h-5 w-5" />
              <span className="text-xs font-semibold tracking-wide">Expenses</span>
            </Link>

            {/* Quick Add FAB — centre button */}
            <div className="flex-1 flex items-center justify-center">
              <Link
                to={ROUTES.EXPENSES}
                state={{ openForm: true }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 hover:bg-brand-600 shadow-[var(--shadow-md)] hover:scale-110 active:scale-95 transition-all duration-200"
                aria-label="Quick add transaction"
              >
                <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
              </Link>
            </div>

            {/* Pending */}
            <Link
              to={ROUTES.PENDING}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-all duration-200 relative',
                location.pathname === ROUTES.PENDING
                  ? 'text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              aria-label="Pending approvals"
            >
              <span className="relative inline-flex">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-danger-text)] px-0.5 text-[10px] font-bold text-white">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold tracking-wide">Pending</span>
            </Link>

            {/* Insights */}
            <Link
              to={ROUTES.INSIGHTS}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-all duration-200',
                location.pathname === ROUTES.INSIGHTS
                  ? 'text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              aria-label="Insights"
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-semibold tracking-wide">Insights</span>
            </Link>
          </div>
        </nav>
      )}
    </div>
  )
}
