// ============================================
// App — Root component with routing
// Code-split via React.lazy for performance
// ============================================

import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, ToastProvider } from '@/context'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AutoUpdateChecker from '@/components/AutoUpdateChecker'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import CookieConsent from '@/components/CookieConsent'
import URLAuthTrigger from '@/components/auth/URLAuthTrigger'
import AuthModal from '@/components/auth/AuthModal'

// ─── Eagerly loaded (public pages — tiny) ───────────────
import LandingPage from '@/pages/LandingPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import SupportPage from '@/pages/SupportPage'

// Helper redirects for in-context authentication modal triggers
function LoginRedirect() {
  const location = useLocation()
  return <Navigate to={`/?auth=login${location.search ? '&' + location.search.substring(1) : ''}`} replace />
}

function SignupRedirect() {
  const location = useLocation()
  return <Navigate to={`/?auth=signup${location.search ? '&' + location.search.substring(1) : ''}`} replace />
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

function App() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dhanrakshak_theme')
      if (stored === 'dark') {
        document.documentElement.classList.remove('light')
      } else {
        document.documentElement.classList.add('light')
        if (stored === null) {
          localStorage.setItem('dhanrakshak_theme', 'light')
        }
      }
    } catch (e) {}
  }, [])

  return (
    <BrowserRouter>
      <AutoUpdateChecker />
      <CookieConsent />
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <URLAuthTrigger />
              <AuthModal />
              
              <Routes>
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

              {/* Redirect to landing page */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
