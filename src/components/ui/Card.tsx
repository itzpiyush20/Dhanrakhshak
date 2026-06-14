// ============================================
// Card — Clean surface container
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  noPadding?: boolean
  hoverable?: boolean
  /** Emphasize as a featured card with a brand-tinted border */
  glow?: boolean
  /** Premium frosted glassmorphism effect */
  glass?: boolean
}

export default function Card({
  children,
  noPadding = false,
  hoverable = false,
  glow = false,
  glass = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        // Base — solid surface, hairline border, soft neutral elevation
        glass ? 'glass-panel rounded-2xl' : 'rounded-2xl border bg-surface-1 border-border-subtle shadow-[var(--shadow-sm)]',
        glow && 'border-brand-500/35 shadow-[0_0_20px_rgba(47,192,154,0.06)]',
        'transition-[transform,box-shadow,border-color] duration-300 ease-out',
        !noPadding && 'p-5 md:p-6',
        // Hoverable — subtle lift, stronger border + elevation
        hoverable && [
          'cursor-pointer glow-hover'
        ],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
