// ============================================
// Input — Styled form input
// ============================================

import { cn } from '@/utils'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export default function Input({
  label,
  error,
  icon,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-zinc-300"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'h-11 w-full rounded-lg border bg-surface-1 px-4 text-sm text-zinc-50',
            'placeholder:text-zinc-400',
            'transition-[border-color,box-shadow] duration-150',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500',
            error
              ? 'border-[var(--status-danger-border)] focus:ring-[var(--status-danger-subtle)] focus:border-[var(--status-danger-text)]'
              : 'border-border-default hover:border-border-hover',
            icon ? 'pl-10' : '',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" aria-live="assertive" className="text-xs text-[var(--status-danger-text)]">{error}</p>
      )}
    </div>
  )
}
