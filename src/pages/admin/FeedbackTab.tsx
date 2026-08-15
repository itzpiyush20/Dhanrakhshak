import { useState } from 'react'
import { Card } from '@/components/ui'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/context/AuthContext'
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
  handled_at: string | null
  total_count: number
}

const PAGE_SIZE = 20

export default function FeedbackTab() {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const [unhandledOnly, setUnhandledOnly] = useState(false)
  // Which row is mid-write, so its button can disable itself without freezing
  // the whole list.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const summary = useAdminQuery<SummaryRow[]>('admin_feedback_summary')
  const list = useAdminQuery<FeedbackRow[]>('admin_feedback_list', {
    lim: PAGE_SIZE,
    off: page * PAGE_SIZE,
  })

  const s = summary.data?.[0]
  const allRows = list.data ?? []
  const total = allRows[0]?.total_count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  // Filtering is client-side over the current page. The RPC already sorts
  // unhandled first, so "Unhandled only" is a focus aid, not a search.
  const rows = unhandledOnly ? allRows.filter((f) => f.handled_at === null) : allRows

  const listReload = list.reload

  const setHandled = async (f: FeedbackRow, handled: boolean) => {
    setBusyId(f.id)
    setActionError(null)
    // Migration 028 adds an RLS policy letting admins UPDATE feedback, so this
    // writes directly — no serverless endpoint in between.
    const { error } = await supabase
      .from('feedback')
      .update(
        handled
          ? { handled_at: new Date().toISOString(), handled_by: user?.id ?? null }
          : { handled_at: null, handled_by: null }
      )
      .eq('id', f.id)

    setBusyId(null)
    if (error) {
      setActionError(`Could not update that feedback: ${error.message}`)
      return
    }
    listReload()
  }

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

      <div className="flex items-center gap-2">
        {([false, true] as const).map((only) => (
          <button
            key={only ? 'unhandled' : 'all'}
            onClick={() => setUnhandledOnly(only)}
            className={
              unhandledOnly === only
                ? 'rounded-full bg-brand-500/20 px-3 py-1 text-xs font-medium text-brand-300'
                : 'rounded-full px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
            }
          >
            {only ? 'Unhandled only' : 'All'}
          </button>
        ))}
      </div>

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {list.loading && <p className="py-8 text-sm text-zinc-400">Loading…</p>}

      {list.error && (
        <div className="py-8">
          <p className="text-sm text-red-400">Could not load feedback: {list.error}</p>
          <button onClick={list.reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
        </div>
      )}

      {!list.loading && !list.error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {unhandledOnly && allRows.length > 0
            ? 'Everything on this page has been handled.'
            : 'No feedback submitted yet.'}
        </p>
      )}

      {rows.map((f) => {
        const handled = f.handled_at !== null
        return (
          <Card
            key={f.id}
            className={handled ? 'p-4 opacity-60' : 'p-4 border-l-2 border-l-brand-500'}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={handled ? 'text-sm text-zinc-400' : 'text-sm font-medium text-zinc-100'}>
                  {f.email}
                </p>
                <p className="text-xs text-zinc-500">
                  {f.category} · {new Date(f.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              <span className="shrink-0 text-sm text-zinc-400">{f.rating}/5</span>
            </div>

            <p className={handled ? 'mt-3 whitespace-pre-wrap text-sm text-zinc-400' : 'mt-3 whitespace-pre-wrap text-sm text-zinc-300'}>
              {f.message}
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-500">
                {handled && f.handled_at !== null
                  ? `Handled ${new Date(f.handled_at).toLocaleDateString('en-IN')}`
                  : 'Needs a reply'}
              </span>
              <button
                onClick={() => setHandled(f, !handled)}
                disabled={busyId === f.id}
                className="text-xs text-brand-400 underline disabled:opacity-40"
              >
                {busyId === f.id ? 'Saving…' : handled ? 'Reopen' : 'Mark handled'}
              </button>
            </div>
          </Card>
        )
      })}

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
