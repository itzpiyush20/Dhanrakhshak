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
        // Base — solid surface, hairline border, soft neutral elevation
        'rounded-2xl border bg-surface-1',
        glow ? 'border-brand-500/35' : 'border-border-subtle',
        'shadow-[var(--shadow-sm)]',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        !noPadding && 'p-5 md:p-6',
        // Hoverable — subtle lift, stronger border + elevation
        hoverable && [
          'cursor-pointer',
          'hover:-translate-y-0.5',
          'hover:border-border-hover',
          'hover:shadow-[var(--shadow-md)]',
        ],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
