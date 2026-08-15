// ============================================
// AdminRoute — hides the admin section from non-admins.
//
// Cosmetic by design: the real gate is the is_admin() check inside every admin
// SQL function. Defeating this in a browser yields an empty page.
// ============================================

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAdmin } from '@/services/adminAccess'

export default function AdminRoute() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    )
  }

  if (!canAccessAdmin(profile)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
