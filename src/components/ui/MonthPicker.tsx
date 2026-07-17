import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'
import { getCurrentMonth } from '@/utils'

interface MonthPickerProps {
  value: string
  onChange: (month: string) => void
  /** Furthest month the user can navigate forward to. Defaults to the current month. */
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
  return new Date(year, mon - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

export default function MonthPicker({ value, onChange, maxMonth, className }: MonthPickerProps) {
  const max = maxMonth ?? getCurrentMonth()

  return (
    <div className={`flex items-center gap-1 bg-surface-1 border border-border-subtle rounded-xl p-1 shrink-0 max-w-fit ${className ?? ''}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="h-11 w-11 p-0"
        aria-label="Previous month"
        title="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="px-3 text-sm font-semibold text-zinc-200 min-w-[120px] text-center">
        {formatMonthName(value)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(shiftMonth(value, 1))}
        className="h-11 w-11 p-0"
        aria-label="Next month"
        title="Next month"
        disabled={value >= max}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
