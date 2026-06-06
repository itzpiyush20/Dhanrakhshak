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
        <div className="bg-brand-500/10 border border-brand-500/25 text-brand-400 h-16 w-16 flex items-center justify-center rounded-2xl mx-auto mb-4 text-3xl select-none shadow-sm shadow-brand-500/5">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-300">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-zinc-500 font-medium leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
