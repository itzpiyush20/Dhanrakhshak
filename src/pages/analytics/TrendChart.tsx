import { Card, EmptyState } from '@/components/ui'
import { formatCurrencyCompact } from '@/utils'
import { PeriodSelector } from './PeriodSelector'
import type { RangeType } from './PeriodSelector'
import { BarChart3 } from 'lucide-react'

interface TrendItem {
  label: string
  income: number
  expenses: number
  savings: number
}

interface TrendChartProps {
  trendRange: RangeType
  setTrendRange: (range: RangeType) => void
  trendData: TrendItem[]
  loading: boolean
  hasTransactions: boolean
}

const getTrendDescription = (trendData: TrendItem[], range: RangeType) => {
  if (range === 'this-week') {
    return 'Daily income and expense trend for the current week'
  }
  if (range === 'last-week') {
    return 'Daily income and expense trend for the previous week'
  }
  if (range === 'last-15-days') {
    return 'Daily income and expense trend for the last 15 days'
  }
  if (range === 'last-month') {
    return 'Weekly income and expense trend for the last 30 days'
  }
  if (range === 'last-6-months') {
    const count = trendData.length
    return `Historical overview of last ${count} months`
  }
  return 'Historical financial overview'
}

export function TrendChart({
  trendRange,
  setTrendRange,
  trendData,
  loading,
  hasTransactions,
}: TrendChartProps) {
  const maxVal = trendData.length
    ? Math.max(...trendData.map((h) => Math.max(h.income, h.expenses)))
    : 0

  return (
    <Card className="flex flex-col min-h-[300px] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-400 shrink-0" />
            Income vs Expense Trend
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">{getTrendDescription(trendData, trendRange)}</p>
        </div>
        
        <PeriodSelector value={trendRange} onChange={setTrendRange} />
      </div>

      <div className="flex-1 flex flex-col justify-end mt-8">
        {loading ? (
          <div className="flex items-end justify-between gap-6 h-40 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex-1 flex gap-2 items-end h-full justify-center">
                <div className="skeleton w-6 h-2/3" />
                <div className="skeleton w-6 h-1/3" />
              </div>
            ))}
          </div>
        ) : !hasTransactions ? (
          <EmptyState
            icon={<BarChart3 className="w-8 h-8 text-zinc-500" />}
            title="Insufficient history"
            description="Record transactions over consecutive months to see historical comparisons."
          />
        ) : (
          <div className="space-y-4">
            {/* Pure CSS Bar chart */}
            <div className="overflow-x-auto scrollbar-none w-full pb-2">
              <div className="flex items-end justify-between gap-2.5 sm:gap-6 md:gap-8 h-48 pt-4 relative select-none min-w-[500px] md:min-w-0">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-full border-t border-dashed border-zinc-400 h-0" />
                  ))}
                </div>

                {trendData.map((h, index) => {
                  const incHeight = maxVal > 0 ? (h.income / maxVal) * 100 : 0
                  const expHeight = maxVal > 0 ? (h.expenses / maxVal) * 100 : 0

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center h-full justify-end group relative"
                    >
                      <div className="absolute bottom-full mb-2 bg-zinc-950 border border-zinc-800 text-[10px] p-2.5 rounded-xl shadow-xl space-y-1 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 min-w-[120px] text-left">
                        <p className="font-semibold text-zinc-300 border-b border-border-subtle/50 pb-1 mb-1">
                          {h.label}
                        </p>
                        <div className="flex items-center justify-between text-[var(--status-positive-text)]">
                          <span>Income:</span>
                          <span className="font-bold">{formatCurrencyCompact(h.income)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[var(--status-warning-text)]">
                          <span>Spent:</span>
                          <span className="font-bold">{formatCurrencyCompact(h.expenses)}</span>
                        </div>
                        <div className="flex items-center justify-between text-brand-400 border-t border-border-subtle/50 pt-1 mt-1 font-semibold">
                          <span>Savings:</span>
                          <span className={h.savings >= 0 ? 'text-[var(--status-positive-text)]' : 'text-[var(--status-danger-text)]'}>
                            {formatCurrencyCompact(h.savings)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-1 sm:gap-2 items-end h-full w-full max-w-[64px] justify-center px-1">
                        <div
                          className="w-2.5 sm:w-4 bg-[var(--status-positive-text)]/80 rounded-t-md hover:bg-[var(--status-positive-text)] transition-all duration-500 ease-out"
                          style={{ height: `${Math.max(3, incHeight)}%` }}
                        />
                        <div
                          className="w-2.5 sm:w-4 bg-[var(--status-warning-text)]/80 rounded-t-md hover:bg-[var(--status-warning-text)] transition-all duration-500 ease-out"
                          style={{ height: `${Math.max(3, expHeight)}%` }}
                        />
                      </div>

                      <span className="text-[10px] text-zinc-500 font-semibold mt-2.5 group-hover:text-zinc-200 transition-colors shrink-0">
                        {h.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 pt-2 text-[10px] font-semibold tracking-wide uppercase text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-positive-text)]/80" />
                <span>Total Income</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-warning-text)]/80" />
                <span>Total Outflow</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default TrendChart
