import { Card, EmptyState } from '@/components/ui'
import { formatCurrencyCompact } from '@/utils'
import { CATEGORIES } from '@/constants'
import { PieChart } from 'lucide-react'

interface CategoryBreakdownItem {
  category: string
  amount: number
  count: number
  percentage: number
}

interface SummaryData {
  total_income: number
  total_expenses: number
  savings: number
  category_breakdown: CategoryBreakdownItem[]
}

interface ExpenseBreakdownProps {
  summary: SummaryData | null
  loading: boolean
}

export function ExpenseBreakdown({
  summary,
  loading,
}: ExpenseBreakdownProps) {
  // Conic Gradient for doughnut
  const getConicGradientString = () => {
    if (!summary || summary.category_breakdown.length === 0) {
      return 'conic-gradient(var(--zinc-800) 0% 100%)'
    }
    let currentAngle = 0
    const slices = summary.category_breakdown.map((item) => {
      const cat = CATEGORIES[item.category as keyof typeof CATEGORIES] || CATEGORIES.other
      const start = currentAngle
      const end = currentAngle + item.percentage
      currentAngle = end
      return `${cat.color} ${start.toFixed(1)}% ${end.toFixed(1)}%`
    })
    return `conic-gradient(${slices.join(', ')})`
  }

  return (
    <Card className="lg:col-span-6 flex flex-col min-h-[400px] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PieChart className="w-5 h-5 text-brand-400 shrink-0" />
            Expense Allocation
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Category distribution for selected period</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center py-4">
        {loading ? (
          <div className="flex flex-col items-center space-y-6">
            <div className="skeleton h-36 w-36 rounded-full" />
            <div className="skeleton h-4 w-32" />
          </div>
        ) : !summary || summary.total_expenses === 0 ? (
          <EmptyState
            icon={<PieChart className="w-8 h-8 text-zinc-500" />}
            title="No allocation data"
            description="Record expenses in this period to see category distribution."
          />
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-8 w-full justify-around pt-2">
            <div
              className="h-36 w-36 sm:h-40 sm:w-40 rounded-full flex items-center justify-center shadow-lg relative shrink-0"
              style={{
                backgroundImage: getConicGradientString(),
              }}
            >
              <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-surface-1 flex flex-col items-center justify-center shadow-inner">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Outflow
                </p>
                <p className="text-base font-bold text-white mt-0.5">
                  {formatCurrencyCompact(summary.total_expenses)}
                </p>
              </div>
            </div>

            <div className="flex-1 max-w-xs space-y-2 text-xs w-full">
              {summary.category_breakdown.slice(0, 5).map((item) => {
                const cat =
                  CATEGORIES[item.category as keyof typeof CATEGORIES] || CATEGORIES.other
                return (
                  <div key={item.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate mr-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-zinc-400 font-medium truncate">
                        {cat.label}
                      </span>
                    </div>
                    <div className="font-semibold text-zinc-200 shrink-0">
                      {formatCurrencyCompact(item.amount)}{' '}
                      <span className="text-zinc-500 font-normal text-xs">
                        ({item.percentage.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                )
              })}
              {summary.category_breakdown.length > 5 && (
                <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold border-t border-border-subtle/30 pt-1.5">
                  <span>Other categories</span>
                  <span>
                    {formatCurrencyCompact(
                      summary.category_breakdown
                        .slice(5)
                        .reduce((sum, item) => sum + item.amount, 0)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default ExpenseBreakdown
