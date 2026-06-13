// ============================================
// EmptyState — Friendly zero-data view
// ============================================

import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="bg-surface-2 border border-border-default h-16 w-16 flex items-center justify-center rounded-2xl mx-auto mb-4 text-3xl select-none">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-zinc-400 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
