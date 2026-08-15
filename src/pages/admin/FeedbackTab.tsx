import { useState } from 'react'
import { Card } from '@/components/ui'
import { useAdminQuery } from './useAdminQuery'

interface SummaryRow {
  total: number
  average_rating: number
  bug: number
  feature_request: number
  ui_ux: number
  other: number
}

interface FeedbackRow {
  id: string
  email: string
  rating: number
  category: string
  message: string
  created_at: string
  total_count: number
}

const PAGE_SIZE = 20

export default function FeedbackTab() {
  const [page, setPage] = useState(0)
  const summary = useAdminQuery<SummaryRow[]>('admin_feedback_summary')
  const list = useAdminQuery<FeedbackRow[]>('admin_feedback_list', {
    lim: PAGE_SIZE,
    off: page * PAGE_SIZE,
  })

  const s = summary.data?.[0]
  const rows = list.data ?? []
  const total = rows[0]?.total_count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Average rating</p>
            <p className="mt-2 text-2xl font-bold text-zinc-100">
              {s.total === 0 ? '—' : `${s.average_rating} / 5`}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total feedback</p>
            <p className="mt-2 text-2xl font-bold text-zinc-100">{s.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Breakdown</p>
            <p className="mt-2 text-sm text-zinc-300">
              {s.bug} bugs · {s.feature_request} features · {s.ui_ux} UI · {s.other} other
            </p>
          </Card>
        </div>
      )}

      {list.loading && <p className="py-8 text-sm text-zinc-400">Loading…</p>}

      {list.error && (
        <div className="py-8">
          <p className="text-sm text-red-400">Could not load feedback: {list.error}</p>
          <button onClick={list.reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
        </div>
      )}

      {!list.loading && !list.error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">No feedback submitted yet.</p>
      )}

      {rows.map((f) => (
        <Card key={f.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">{f.email}</p>
              <p className="text-xs text-zinc-500">
                {f.category} · {new Date(f.created_at).toLocaleDateString('en-IN')}
              </p>
            </div>
            <span className="shrink-0 text-sm text-zinc-400">{f.rating}/5</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{f.message}</p>
        </Card>
      ))}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">
            Previous
          </button>
          <span>Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  )
}
