// ============================================
// Button — Multi-variant action button
// ============================================

import { cn } from '@/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'btn-shimmer',
    'bg-gradient-to-r from-brand-500 to-brand-600',
    'text-[#0d0d12] font-semibold',
    'shadow-[0_4px_18px_rgba(62,207,142,0.30),0_2px_12px_rgba(99,102,241,0.15)]',
    'hover:from-brand-400 hover:to-brand-500',
    'hover:shadow-[0_6px_28px_rgba(62,207,142,0.42),0_2px_16px_rgba(99,102,241,0.22)]',
    'active:from-brand-600 active:to-brand-700 active:scale-[0.97]',
    'transition-all duration-200',
  ].join(' '),
  secondary: [
    'bg-surface-2 border border-border-default',
    'dark:bg-white/5 dark:border-white/10',
    'backdrop-blur-sm',
    'text-zinc-200',
    'shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
    'hover:bg-surface-3 hover:border-border-hover hover:shadow-[0_4px_14px_rgba(0,0,0,0.18)]',
    'active:bg-zinc-800 active:scale-[0.98]',
    'transition-all duration-200',
  ].join(' '),
  ghost: [
    'text-zinc-400',
    'hover:text-white hover:bg-surface-2',
    'active:bg-surface-3 active:scale-[0.98]',
    'transition-all duration-200',
  ].join(' '),
  danger: [
    'bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)]',
    'text-[var(--status-danger-text)]',
    'hover:bg-[var(--status-danger-border)] hover:border-[var(--status-danger-text)]/40',
    'hover:shadow-[0_4px_14px_rgba(248,113,113,0.20)]',
    'active:opacity-80 active:scale-[0.98]',
    'transition-all duration-200',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2.5',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium select-none',
        'focus-visible:outline-2 focus-visible:outline-brand-400 focus-visible:outline-offset-2',
        'disabled:opacity-45 disabled:pointer-events-none disabled:saturate-50',
        variantStyles[variant],
        sizeStyles[size],
        block && 'w-full',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
