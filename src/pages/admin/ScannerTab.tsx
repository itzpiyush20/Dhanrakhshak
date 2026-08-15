import { Card } from '@/components/ui'
import { useAdminQuery } from './useAdminQuery'
import { scanSuccessRate } from './adminMetrics'
import AdminBarChart from './AdminBarChart'

interface ScannerRow {
  day: string
  manual_scans: number
  scheduled_scans: number
  succeeded: number
  partial: number
  failed: number
  emails_processed: number
  transactions_found: number
}

interface FailureRow {
  scanned_at: string
  email: string
  error_message: string | null
  scan_mode: string | null
}

interface GateRow {
  gate: string
  rejections: number
}

export default function ScannerTab() {
  const stats = useAdminQuery<ScannerRow[]>('admin_scanner_stats', { days: 30 })
  const failures = useAdminQuery<FailureRow[]>('admin_scan_failures', { lim: 20 })
  const gates = useAdminQuery<GateRow[]>('admin_rejection_gates', { days: 30 })

  if (stats.loading) return <p className="py-8 text-sm text-zinc-400">Loading…</p>
  if (stats.error) {
    return (
      <div className="py-8">
        <p className="text-sm text-red-400">Could not load scanner stats: {stats.error}</p>
        <button onClick={stats.reload} className="mt-2 text-sm text-brand-400 underline">Retry</button>
      </div>
    )
  }

  const rows = stats.data ?? []
  const totals = rows.reduce(
    (acc, r) => ({
      succeeded: acc.succeeded + r.succeeded,
      partial: acc.partial + r.partial,
      failed: acc.failed + r.failed,
      manual: acc.manual + r.manual_scans,
      scheduled: acc.scheduled + r.scheduled_scans,
      emails: acc.emails + r.emails_processed,
      found: acc.found + r.transactions_found,
    }),
    { succeeded: 0, partial: 0, failed: 0, manual: 0, scheduled: 0, emails: 0, found: 0 }
  )

  const rate = scanSuccessRate(totals)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Success rate</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{rate === null ? '—' : `${rate}%`}</p>
          <p className="mt-1 text-xs text-zinc-500">partial counts as success</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Failed scans</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{totals.failed}</p>
          <p className="mt-1 text-xs text-zinc-500">last 30 days</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Manual / auto</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{totals.manual} / {totals.scheduled}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Txns found</p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{totals.found}</p>
          <p className="mt-1 text-xs text-zinc-500">from {totals.emails} emails</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Scans per day (30 days)</h2>
        <AdminBarChart
          data={rows.map((r) => ({ label: r.day, value: r.manual_scans + r.scheduled_scans }))}
          emptyMessage="No scans yet."
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Rejections by gate (30 days)</h2>
        {gates.loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (gates.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">No rejections recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {gates.data!.map((g) => (
              <li key={g.gate} className="flex justify-between text-zinc-300">
                <span>{g.gate}</span>
                <span className="text-zinc-500">{g.rejections}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent failures</h2>
        {failures.loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (failures.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">No failed scans. Good.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {failures.data!.map((f, i) => (
              <li key={i} className="border-b border-border-subtle/50 pb-2">
                <p className="text-zinc-300">{f.email} · {f.scan_mode ?? 'unknown'}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(f.scanned_at).toLocaleString('en-IN')} — {f.error_message ?? 'no message'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
