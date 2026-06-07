// ============================================
// ProtectedRoute — Redirect to login if not authenticated
// ============================================

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function ProtectedRoute() {
  const { user, loading, isSubscriptionActive } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/?auth=login&redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  // Exemptions list for expired accounts: /settings, /profile, /support, and /pricing itself
  const isExempted = ['/settings', '/profile', '/support', '/pricing'].includes(location.pathname)

  if (!isSubscriptionActive && !isExempted) {
    return <Navigate to="/pricing" replace />
  }

  return <Outlet />
}
