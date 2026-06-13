// ============================================
// Card — Futuristic glass-style container
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  noPadding?: boolean
  hoverable?: boolean
  /** Gradient border glow on hover */
  glow?: boolean
}

export default function Card({
  children,
  noPadding = false,
  hoverable = false,
  glow = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        // Base — glass surface with depth
        'rounded-2xl border border-border-subtle bg-surface-1/90',
        'shadow-[0_4px_24px_rgba(0,0,0,0.22),0_0_0_1px_rgba(99,102,241,0.04)]',
        'backdrop-blur-sm',
        'transition-all duration-300 ease-out',
        !noPadding && 'p-5 md:p-6',
        // Hoverable — lift + brand glow
        hoverable && 'cursor-pointer hover:-translate-y-1 hover:border-brand-400/25 hover:bg-surface-2 hover:shadow-[0_16px_48px_rgba(0,0,0,0.28),0_0_0_1px_rgba(62,207,142,0.15),0_0_60px_rgba(99,102,241,0.08)]',
        // Glow — gradient border on hover via CSS utility
        glow && 'gradient-border-card',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
