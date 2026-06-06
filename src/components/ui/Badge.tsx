// ============================================
// Badge — Status & category labels
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

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
