import { Card } from '@/components/ui'
import { useAdminQuery } from './useAdminQuery'

interface AiRow {
  email: string
  ai_calls_count: number
  ai_scan_calls_count: number
}

export default function AiUsageTab() {
  const { data, loading, error, reload } = useAdminQuery<AiRow[]>('admin_ai_usage')

  if (loading) return <p className="py-8 text-sm text-zinc-400">Loading…</p>
  if (error) {
    return (
      <div className="py-8">
        <p className="text-sm text-red-400">Could not load AI usage: {error}</p>
        <button onClick={reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
      </div>
    )
  }

  const rows = data ?? []
  const totalInsight = rows.reduce((sum, r) => sum + r.ai_calls_count, 0)
  const totalScan = rows.reduce((sum, r) => sum + r.ai_scan_calls_count, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Insight calls today</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{totalInsight}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Scan calls today</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{totalScan}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Heaviest users</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No AI calls recorded today.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.email} className="flex justify-between text-zinc-300">
                <span>{r.email}</span>
                <span className="text-zinc-500">{r.ai_calls_count} insight · {r.ai_scan_calls_count} scan</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-zinc-500">
        Counts reset daily. Percentages against the daily cap are not shown: the caps are
        constants inside the AI proxy, and duplicating them here would drift from the real
        limit.
      </p>
    </div>
  )
}
