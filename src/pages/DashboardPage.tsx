// ============================================
// DashboardPage — Placeholder (built in Phase 8)
// ============================================

import { AppLayout } from '@/layouts'
import { Card, Button } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency } from '@/utils'

export default function DashboardPage() {
  const { user, signOut } = useAuth()

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Welcome{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''} 👋
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {user?.email}
            </p>
          </div>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Income', amount: 0 },
            { label: 'Expenses', amount: 0 },
            { label: 'Savings', amount: 0 },
          ].map((item) => (
            <Card key={item.label}>
              <p className="text-sm font-medium text-zinc-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrency(item.amount)}
              </p>
            </Card>
          ))}
        </div>

        {/* Placeholder notice */}
        <Card>
          <div className="text-center py-8">
            <span className="text-4xl mb-3 block">🏗️</span>
            <p className="text-zinc-300 font-medium">Dashboard coming in Phase 8</p>
            <p className="text-sm text-zinc-500 mt-1">Authentication is working! You're signed in.</p>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
