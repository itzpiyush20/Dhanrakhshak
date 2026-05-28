import { AppLayout } from '@/layouts'
import { Card, Button, Input, Badge, EmptyState } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { CATEGORIES } from '@/constants'

function App() {
  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Your financial overview</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Income', amount: 85000, badge: 'success' as const, trend: '+12%' },
            { label: 'Expenses', amount: 42350, badge: 'danger' as const, trend: '-5%' },
            { label: 'Savings', amount: 42650, badge: 'info' as const, trend: '+24%' },
          ].map((item, i) => (
            <Card key={item.label} hoverable className={`animate-slide-up stagger-${i + 1}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-400">{item.label}</p>
                <Badge variant={item.badge}>{item.trend}</Badge>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {formatCurrency(item.amount)}
              </p>
            </Card>
          ))}
        </div>

        {/* Button variants */}
        <Card>
          <p className="mb-4 text-sm font-medium text-zinc-400">Button Variants</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Add Expense</Button>
            <Button variant="secondary">Export CSV</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="primary" loading>Saving...</Button>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="lg">Large</Button>
          </div>
        </Card>

        {/* Input demo */}
        <Card>
          <p className="mb-4 text-sm font-medium text-zinc-400">Form Inputs</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Amount" placeholder="₹ 0.00" type="number" />
            <Input label="Description" placeholder="What did you spend on?" />
            <Input label="Email" placeholder="you@example.com" error="Invalid email address" />
          </div>
        </Card>

        {/* Category badges */}
        <Card>
          <p className="mb-4 text-sm font-medium text-zinc-400">Categories</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).slice(0, 10).map(([key, cat]) => (
              <Badge key={key}>
                {cat.emoji} {cat.label}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Empty state */}
        <Card>
          <EmptyState
            icon="💸"
            title="No expenses yet"
            description="Add your first expense to start tracking your spending."
            action={<Button>Add Expense</Button>}
          />
        </Card>

        {/* Skeleton loading demo */}
        <Card>
          <p className="mb-4 text-sm font-medium text-zinc-400">Loading Skeleton</p>
          <div className="space-y-3">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-10 w-full" />
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}

export default App
