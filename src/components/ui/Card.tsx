// ============================================
// Card — Premium glass-style container
// The primary surface element across the app
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Remove default padding */
  noPadding?: boolean
  /** Hover glow effect */
  hoverable?: boolean
}

export default function Card({
  children,
  noPadding = false,
  hoverable = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-subtle bg-surface-1',
        'transition-all duration-200',
        !noPadding && 'p-5',
        hoverable && 'hover:border-border-hover hover:bg-surface-2 hover:shadow-lg hover:shadow-black/20 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
