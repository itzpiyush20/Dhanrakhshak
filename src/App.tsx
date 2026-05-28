import { AppLayout } from './layouts'
import { formatCurrency } from './utils'

function App() {
  return (
    <AppLayout>
      {/* Temporary content to verify architecture is wired up */}
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Your financial overview</p>
        </div>

        {/* Sample cards to verify Tailwind + layout + utils */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Income', amount: 85000, color: 'emerald' },
            { label: 'Expenses', amount: 42350, color: 'red' },
            { label: 'Savings', amount: 42650, color: 'blue' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-5 transition-all hover:border-zinc-700/60 hover:bg-zinc-900/80"
            >
              <p className="text-sm font-medium text-zinc-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrency(item.amount)}
              </p>
            </div>
          ))}
        </div>

        {/* Architecture verification message */}
        <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/30 p-4 text-center">
          <p className="text-sm text-zinc-500">
            ✅ Layout • Components • Utils • Types • Constants — all wired up
          </p>
        </div>
      </div>
    </AppLayout>
  )
}

export default App
