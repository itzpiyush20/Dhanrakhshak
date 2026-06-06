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
        'rounded-2xl border border-border-subtle bg-surface-1 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all duration-300',
        !noPadding && 'p-5 md:p-6',
        hoverable && 'hover:border-brand-400/30 hover:bg-surface-2 hover:shadow-[0_12px_40px_rgba(0,230,118,0.08)] cursor-pointer transform hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
