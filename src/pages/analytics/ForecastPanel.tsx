import { Card, Badge } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { Calendar } from 'lucide-react'

interface ForecastItem {
  label: string
  confidence: number
  forecastIncome: number
  forecastExpenses: number
  forecastSavings: number
}

interface ForecastPanelProps {
  forecast: ForecastItem[]
}

export function ForecastPanel({ forecast }: ForecastPanelProps) {
  if (forecast.length === 0) return null

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-5">
        <Calendar className="w-5 h-5 text-brand-400 shrink-0" />
        <div>
          <h2 className="text-base font-bold text-white">3-Month Cash Flow Forecast</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Based on your last 6 months of spending patterns</p>
        </div>
        <Badge variant="info" className="ml-auto text-xs">Predictive</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {forecast.map((f, i) => (
          <div key={i} className={`rounded-2xl border p-5 ${
            f.forecastSavings >= 0
              ? 'bg-[var(--status-positive-subtle)] border-[var(--status-positive-border)]'
              : 'bg-[var(--status-danger-subtle)] border-[var(--status-danger-border)]'
          }`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <span className="text-sm font-bold text-white">{f.label}</span>
              <span className="text-xs text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5 shrink-0">
                {f.confidence}% confidence
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Expected Income</span>
                <span className="text-[var(--status-positive-text)] font-semibold">{formatCurrency(f.forecastIncome)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Expected Expenses</span>
                <span className="text-[var(--status-warning-text)] font-semibold">{formatCurrency(f.forecastExpenses)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-700/50 pt-2 mt-2">
                <span className="text-zinc-400 font-semibold">Net Savings</span>
                <span className={`font-bold text-sm ${
                  f.forecastSavings >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'
                }`}>
                  {f.forecastSavings >= 0 ? '+' : ''}{formatCurrency(f.forecastSavings)}
                </span>
              </div>
            </div>
            {/* Mini confidence bar */}
            <div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all"
                style={{ width: `${f.confidence}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-400 mt-4 text-center">
        Forecast uses weighted moving average of your last 6 months. Confidence decreases for months further ahead.
      </p>
    </Card>
  )
}

export default ForecastPanel
