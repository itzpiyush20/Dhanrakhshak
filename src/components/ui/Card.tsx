// ============================================
// Card — Clean surface container
// ============================================

import { cn } from '@/utils'
import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  noPadding?: boolean
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
        // Base — solid surface, hairline border, soft neutral elevation
        'rounded-2xl border bg-surface-1 border-border-subtle shadow-[var(--shadow-sm)]',
        'transition-[box-shadow,border-color] duration-200 ease-out',
        !noPadding && 'p-5 md:p-6',
        // Hoverable — border + elevation shift, no colored glow
        hoverable && 'cursor-pointer hover:border-border-hover hover:shadow-[var(--shadow-md)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
