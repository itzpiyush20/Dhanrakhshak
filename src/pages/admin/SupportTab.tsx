// ============================================
// SupportTab — the support inbox.
//
// Reads through admin_support_ticket_list / admin_support_ticket_summary, both
// SECURITY DEFINER and both opening with an is_admin() guard, same as every
// other admin RPC. The only write is marking a ticket handled, which migration
// 031 permits directly via an admin-only RLS policy — it touches no protected
// column and carries no privilege, so it needs no serverless endpoint.
//
// Deliberately separate from FeedbackTab: feedback carries a 1-5 rating that
// feeds an average, tickets do not.
// ============================================

import { useState } from 'react'
import { Card } from '@/components/ui'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAdminQuery } from './useAdminQuery'

interface SummaryRow {
  total: number
  unhandled: number
  last_7d: number
}

interface TicketRow {
  id: string
  name: string
  email: string
  subject: string
  message: string
  created_at: string
  handled_at: string | null
  total_count: number
}

const PAGE_SIZE = 20

export default function SupportTab() {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const [openOnly, setOpenOnly] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const summary = useAdminQuery<SummaryRow[]>('admin_support_ticket_summary')
  const list = useAdminQuery<TicketRow[]>('admin_support_ticket_list', {
    lim: PAGE_SIZE,
    off: page * PAGE_SIZE,
  })

  const s = summary.data?.[0]
  const allRows = list.data ?? []
  const total = allRows[0]?.total_count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  // Filtering is client-side over the current page. The RPC already sorts open
  // tickets first, so this is a focus aid rather than a search.
  const rows = openOnly ? allRows.filter((t) => t.handled_at === null) : allRows

  const listReload = list.reload

  const setHandled = async (t: TicketRow, handled: boolean) => {
    setBusyId(t.id)
    setActionError(null)
    const { error } = await supabase
      .from('support_tickets')
      .update(
        handled
          ? { handled_at: new Date().toISOString(), handled_by: user?.id ?? null }
          : { handled_at: null, handled_by: null }
      )
      .eq('id', t.id)

    setBusyId(null)
    if (error) {
      setActionError(`Could not update that ticket: ${error.message}`)
      return
    }
    listReload()
  }

  return (
    <div className="space-y-6">
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Open tickets</p>
            <p
              className={
                s.unhandled > 0
                  ? 'mt-2 text-2xl font-bold text-brand-400'
                  : 'mt-2 text-2xl font-bold text-zinc-100'
              }
            >
              {s.unhandled}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total received</p>
            <p className="mt-2 text-2xl font-bold text-zinc-100">{s.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Last 7 days</p>
            <p className="mt-2 text-2xl font-bold text-zinc-100">{s.last_7d}</p>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2">
        {([false, true] as const).map((only) => (
          <button
            key={only ? 'open' : 'all'}
            onClick={() => setOpenOnly(only)}
            className={
              openOnly === only
                ? 'rounded-full bg-brand-500/20 px-3 py-1 text-xs font-medium text-brand-300'
                : 'rounded-full px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
            }
          >
            {only ? 'Open only' : 'All'}
          </button>
        ))}
      </div>

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {list.loading && <p className="py-8 text-sm text-zinc-400">Loading…</p>}

      {list.error && (
        <div className="py-8">
          <p className="text-sm text-red-400">Could not load support tickets: {list.error}</p>
          <p className="mt-1 text-xs text-zinc-500">
            If this says the function does not exist, run supabase/031_support_tickets.sql.
          </p>
          <button onClick={list.reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
        </div>
      )}

      {!list.loading && !list.error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {openOnly && allRows.length > 0
            ? 'Every ticket on this page has been handled.'
            : 'No support tickets yet.'}
        </p>
      )}

      {rows.map((t) => {
        const handled = t.handled_at !== null
        return (
          <Card key={t.id} className={handled ? 'p-4 opacity-60' : 'p-4 border-l-2 border-l-brand-500'}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={handled ? 'text-sm text-zinc-400' : 'text-sm font-medium text-zinc-100'}>
                  {t.subject}
                </p>
                <p className="text-xs text-zinc-500">
                  {t.name} ·{' '}
                  <a href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(t.subject)}`} className="underline">
                    {t.email}
                  </a>{' '}
                  · {new Date(t.created_at).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <p
              className={
                handled
                  ? 'mt-3 whitespace-pre-wrap text-sm text-zinc-400'
                  : 'mt-3 whitespace-pre-wrap text-sm text-zinc-300'
              }
            >
              {t.message}
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-500">
                {handled && t.handled_at !== null
                  ? `Handled ${new Date(t.handled_at).toLocaleDateString('en-IN')}`
                  : 'Needs a reply'}
              </span>
              <button
                onClick={() => setHandled(t, !handled)}
                disabled={busyId === t.id}
                className="text-xs text-brand-400 underline disabled:opacity-40"
              >
                {busyId === t.id ? 'Saving…' : handled ? 'Reopen' : 'Mark handled'}
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
