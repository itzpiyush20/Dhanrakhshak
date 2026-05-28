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
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface-2 px-4 text-sm text-white',
            'placeholder:text-zinc-500',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400',
            error
              ? 'border-red-500/50 focus:ring-red-400/40 focus:border-red-400'
              : 'border-border-subtle hover:border-border-hover',
            icon && 'pl-10',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
