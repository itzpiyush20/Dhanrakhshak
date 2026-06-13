// ============================================
// Badge — Status & category labels
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'aurora'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-zinc-800 text-zinc-300 border-zinc-700/50',
  success: 'bg-[var(--status-positive-subtle)] text-[var(--status-positive-text)] border-[var(--status-positive-border)]',
  warning: 'bg-[var(--status-warning-subtle)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]',
  danger:  'bg-[var(--status-danger-subtle)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]',
  info:    'bg-[var(--status-info-subtle)] text-[var(--status-info-text)] border-[var(--status-info-border)]',
  aurora:  'bg-gradient-to-r from-[rgba(62,207,142,0.15)] to-[rgba(99,102,241,0.15)] border-[rgba(62,207,142,0.25)] text-brand-300',
}

export default function Badge({ children, variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-medium',
        'transition-colors duration-200',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
