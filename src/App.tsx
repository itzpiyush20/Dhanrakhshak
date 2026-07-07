// ============================================
// App — Root component with routing
// Code-split via React.lazy for performance
// ============================================

import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider, ToastProvider } from '@/context'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AutoUpdateChecker from '@/components/AutoUpdateChecker'
import InstallPrompt from '@/components/InstallPrompt'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import CookieConsent from '@/components/CookieConsent'
import URLAuthTrigger from '@/components/auth/URLAuthTrigger'
import AuthModal from '@/components/auth/AuthModal'
import ScrollProgressBar from '@/components/ui/ScrollProgressBar'
import { CursorFollower } from '@/components/ui'

// ─── Eagerly loaded (public pages — tiny) ───────────────
import LandingPage from '@/pages/LandingPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import SupportPage from '@/pages/SupportPage'

// Helper redirects for in-context authentication modal triggers
function LoginRedirect() {
  const location = useLocation()
  return <Navigate to={`/?auth=login${location.search ? '&' + location.search.substring(1) : ''}${location.hash}`} replace />
}

function SignupRedirect() {
  const location = useLocation()
  return <Navigate to={`/?auth=signup${location.search ? '&' + location.search.substring(1) : ''}${location.hash}`} replace />
}

function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    // Check if the change is just an auth modal query param opening/closing
    const params = new URLSearchParams(search)
    // If it has 'auth' and nothing else, ignore. If it has 'auth' and others, or no 'auth', we scroll to top.
    const isOnlyAuthChange = params.has('auth') && Array.from(params.keys()).length === 1
    
    if (!isOnlyAuthChange) {
      window.scrollTo(0, 0)
    }
  }, [pathname, search])

  return null
}

// ─── Lazy loaded (protected pages — code split) ─────────
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'))
const ExpensesPage     = lazy(() => import('@/pages/ExpensesPage'))
const BudgetsPage      = lazy(() => import('@/pages/BudgetsPage'))
const PendingPage      = lazy(() => import('@/pages/PendingPage'))
const AnalyticsPage    = lazy(() => import('@/pages/AnalyticsPage'))
const SettingsPage     = lazy(() => import('@/pages/SettingsPage'))
const ProfilePage      = lazy(() => import('@/pages/ProfilePage'))
const SubscriptionsPage = lazy(() => import('@/pages/SubscriptionsPage'))
const PrivacyPage      = lazy(() => import('@/pages/PrivacyPage'))
const AboutPage        = lazy(() => import('@/pages/AboutPage'))
const TermsPage        = lazy(() => import('@/pages/TermsPage'))
const PricingPage      = lazy(() => import('@/pages/PricingPage'))
const RefundPage       = lazy(() => import('@/pages/RefundPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))

const PaymentSuccessPage = lazy(() => import('@/pages/PaymentSuccessPage'))

// ─── Loading fallback ────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <span className="text-xs text-zinc-500 font-medium">Loading…</span>
      </div>
    </div>
  )
}

// ─── Animated Routes — page transition wrapper ───────────
function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        // IMPORTANT: animate TRANSFORM ONLY — never opacity — for the app-shell
        // wrapper. framer-motion sets `initial` as an inline style on mount and
        // fades to `animate` via requestAnimationFrame. The browser PAUSES rAF in a
        // backgrounded / mid-transition tab (exactly the tab state during a Google
        // OAuth redirect back to /dashboard) and on a GPU compositor stall (a known
        // failure mode here — see commit 55d2ace). If we gated visibility on opacity,
        // a stalled animation would leave the ENTIRE app (nav + content) at opacity:0
        // — a blank white screen with a correct page title. A stalled transform only
        // leaves content a few px off, so the app is always visible regardless.
        initial={{ y: 14 }}
        animate={{ y: 0 }}
        exit={{ y: -8 }}
        transition={{ duration: 0.30, ease: [0.16, 1, 0.3, 1] }}
        style={{ minHeight: '100vh' }}
      >
        <Routes location={location}>
          {/* Public routes */}
          <Route path="/"                element={<LandingPage />} />
          <Route path="/login"           element={<LoginRedirect />} />
          <Route path="/signup"          element={<SignupRedirect />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/support"         element={<SupportPage />} />
          <Route path="/privacy"         element={<PrivacyPage />} />
          <Route path="/about"           element={<AboutPage />} />
          <Route path="/terms"           element={<TermsPage />} />
          <Route path="/pricing"         element={<PricingPage />} />
          <Route path="/refund-policy"   element={<RefundPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard"       element={<DashboardPage />} />
            <Route path="/expenses"        element={<ExpensesPage />} />
            <Route path="/budgets"         element={<BudgetsPage />} />
            <Route path="/pending"         element={<PendingPage />} />
            <Route path="/insights"        element={<AnalyticsPage />} />
            <Route path="/settings"        element={<SettingsPage />} />
            <Route path="/profile"         element={<ProfilePage />} />
            <Route path="/subscriptions"   element={<SubscriptionsPage />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dhanrakshak_theme')
      // System-aware default: honor an explicit choice, otherwise follow the OS.
      const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches
      const useLight = stored === 'light' || (!stored && prefersLight)
      if (useLight) {
        document.documentElement.classList.add('light')
      } else {
        document.documentElement.classList.remove('light')
      }
    } catch (e) {}
  }, [])

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AutoUpdateChecker />
      <InstallPrompt />
      <CookieConsent />
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary fallback={null}>
                <URLAuthTrigger />
              </ErrorBoundary>
              <AuthModal />
              <ScrollProgressBar />
              <CursorFollower />
              
              <AnimatedRoutes />
            </Suspense>
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
