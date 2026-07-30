import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'
import { cn, getCurrentMonth, resolveDateFilter, type DateFilter } from '@/utils'

interface DateFilterPickerProps {
  value: DateFilter
  onChange: (next: DateFilter) => void
  /** Furthest month the user can navigate forward to in Month mode. Defaults to the current month. */
  maxMonth?: string
  className?: string
}

function shiftMonth(monthStr: string, delta: number): string {
  const [year, mon] = monthStr.split('-').map(Number)
  const date = new Date(year, mon - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthName(monthStr: string): string {
  const [year, mon] = monthStr.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function DateFilterPicker({ value, onChange, maxMonth, className }: DateFilterPickerProps) {
  const max = maxMonth ?? getCurrentMonth()

  // Remembers the last month viewed in Month mode, so switching Custom -> Month
  // restores where the user left off instead of jumping back to the current month.
  const [lastMonth, setLastMonth] = useState(value.mode === 'month' ? value.month : getCurrentMonth())

  const switchToMonth = () => onChange({ mode: 'month', month: lastMonth })

  const switchToCustom = () => {
    if (value.mode !== 'month') return
    const { dateFrom, dateTo } = resolveDateFilter(value)
    const today = todayStr()
    onChange({ mode: 'custom', from: dateFrom, to: dateTo > today ? today : dateTo })
  }

  const handleMonthChange = (month: string) => {
    setLastMonth(month)
    onChange({ mode: 'month', month })
  }

  const handleFromChange = (from: string) => {
    if (value.mode !== 'custom') return
    onChange({ mode: 'custom', from, to: value.to < from ? from : value.to })
  }

  const handleToChange = (to: string) => {
    if (value.mode !== 'custom') return
    onChange({ mode: 'custom', from: value.from, to })
  }

  return (
    <div className={cn('flex items-center gap-1 bg-surface-1 border border-border-subtle rounded-xl p-1 shrink-0 flex-wrap', className)}>
      <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 mr-0.5" role="tablist" aria-label="Date filter mode">
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'month'}
          onClick={switchToMonth}
          className={cn(
            'px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer',
            value.mode === 'month' ? 'bg-surface-1 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          Month
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'custom'}
          onClick={switchToCustom}
          className={cn(
            'px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer',
            value.mode === 'custom' ? 'bg-surface-1 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          Custom
        </button>
      </div>

      {value.mode === 'month' ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMonthChange(shiftMonth(value.month, -1))}
            className="h-11 w-11 p-0"
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm font-semibold text-zinc-200 min-w-[120px] text-center">
            {formatMonthName(value.month)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMonthChange(shiftMonth(value.month, 1))}
            className="h-11 w-11 p-0"
            aria-label="Next month"
            title="Next month"
            disabled={value.month >= max}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-1.5 px-1">
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(e) => handleFromChange(e.target.value)}
            className="bg-surface-2 border border-border-subtle/50 text-zinc-200 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            aria-label="From date"
          />
          <span className="text-zinc-600 text-xs" aria-hidden="true">–</span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            max={todayStr()}
            onChange={(e) => handleToChange(e.target.value)}
            className="bg-surface-2 border border-border-subtle/50 text-zinc-200 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            aria-label="To date"
          />
        </div>
      )}
    </div>
  )
}
