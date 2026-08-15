import { useState } from 'react'
import { Card, Input } from '@/components/ui'
import { useAdminQuery } from './useAdminQuery'

interface UserRow {
  id: string
  email: string
  subscription_status: string | null
  subscription_plan_type: string | null
  subscription_expires_at: string | null
  created_at: string
  last_signin_at: string | null
  scans_30d: number
  total_count: number
}

const PAGE_SIZE = 25

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN')
}

export default function UsersTab() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { data, loading, error, reload } = useAdminQuery<UserRow[]>('admin_user_list', {
    search,
    lim: PAGE_SIZE,
    off: page * PAGE_SIZE,
  })

  const total = data?.[0]?.total_count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0) }}
        placeholder="Search by email"
      />

      {loading && <p className="py-8 text-sm text-zinc-400">Loading…</p>}

      {error && (
        <div className="py-8">
          <p className="text-sm text-red-400">Could not load users: {error}</p>
          <button onClick={reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
        </div>
      )}

      {!loading && !error && (data?.length ?? 0) === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {search ? 'No accounts match that search.' : 'No accounts yet.'}
        </p>
      )}

      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Scans 30d</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle/50">
                  <td className="px-4 py-3 text-zinc-200">{u.email}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.subscription_status ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.subscription_plan_type ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(u.subscription_expires_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(u.last_signin_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.scans_30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page + 1} of {pages} · {total} accounts</span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
