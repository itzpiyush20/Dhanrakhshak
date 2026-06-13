// ============================================
// Select — Styled dropdown
// ============================================

import { cn } from '@/utils'
import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options?: { value: string; label: string }[]
  placeholder?: string
  children?: React.ReactNode
}

export default function Select({
  label,
  error,
  options = [],
  placeholder,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-zinc-300"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          'h-11 w-full rounded-lg border bg-surface-1 px-3 pr-9 text-sm text-zinc-50',
          'transition-[border-color,box-shadow] duration-150 appearance-none cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500',
          'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23949bab%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-no-repeat bg-[right_12px_center]',
          error
            ? 'border-[var(--status-danger-border)]'
            : 'border-border-default hover:border-border-hover',
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" className="bg-surface-1 text-zinc-400">
            {placeholder}
          </option>
        )}
        {options && options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-1 text-zinc-50">
            {opt.label}
          </option>
        ))}
        {children}
      </select>
      {error && <p id={`${selectId}-error`} role="alert" aria-live="assertive" className="text-xs text-[var(--status-danger-text)]">{error}</p>}
    </div>
  )
}
