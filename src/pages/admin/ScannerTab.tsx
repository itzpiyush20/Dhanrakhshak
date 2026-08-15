import { useState } from 'react'
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

interface GateSenderRow {
  sender_domain: string
  rejections: number
  last_seen: string
}

// Fragments that mark a sending domain as "probably real money mail". A gate
// rejecting these is throwing away receipts the user wanted; a gate rejecting
// newsletters and shopping blasts is doing its job. This is a display hint
// only — it colours the row so the distinction is visible at a glance, it does
// not change what the scanner does.
const FINANCIAL_DOMAIN_HINTS = [
  'bank', 'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'idfc', 'indusind', 'yesbank',
  'rbl', 'canara', 'pnb', 'bob', 'federal', 'aubank', 'bandhan',
  'paytm', 'phonepe', 'gpay', 'googlepay', 'amazonpay', 'upi', 'cred',
  'razorpay', 'payu', 'billdesk', 'cashfree', 'visa', 'mastercard', 'amex',
  'americanexpress', 'onecard', 'slice', 'jupiter', 'fi.money', 'niyo',
]

function looksFinancial(domain: string): boolean {
  const lower = domain.toLowerCase()
  return FINANCIAL_DOMAIN_HINTS.some((hint) => lower.includes(hint))
}

// Rendered only while a gate is selected. Keeping it in its own component means
// useAdminQuery is mounted with a real gate every time it runs — no conditional
// hook, and no need for the hook to support "don't fetch yet".
function GateSenders({ gate }: { gate: string }) {
  const senders = useAdminQuery<GateSenderRow[]>('admin_gate_senders', {
    target_gate: gate,
    days: 30,
    lim: 20,
  })

  if (senders.loading) {
    return <p className="px-3 py-2 text-xs text-zinc-500">Loading senders…</p>
  }

  if (senders.error) {
    return (
      <div className="px-3 py-2">
        <p className="text-xs text-red-400">Could not load senders: {senders.error}</p>
        <button onClick={senders.reload} className="mt-1 text-xs text-brand-400 underline">
          Retry
        </button>
      </div>
    )
  }

  const rows = senders.data ?? []
  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-zinc-500">No senders recorded for this gate.</p>
  }

  const flagged = rows.filter((r) => looksFinancial(r.sender_domain)).length

  return (
    <div className="px-3 py-2">
      <p className="mb-2 text-xs text-zinc-500">
        {flagged === 0
          ? 'Top senders this gate rejected. None look like a bank or payment provider.'
          : `Top senders this gate rejected. ${flagged} look${flagged === 1 ? 's' : ''} like a bank or payment provider — check these.`}
      </p>
      <table className="w-full text-left text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 font-normal">Sender domain</th>
            <th className="py-1 text-right font-normal">Rejected</th>
            <th className="py-1 text-right font-normal">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const financial = looksFinancial(r.sender_domain)
            return (
              <tr key={r.sender_domain} className="border-t border-border-subtle/40">
                <td className={`py-1 ${financial ? 'font-medium text-amber-400' : 'text-zinc-300'}`}>
                  {r.sender_domain}
                  {financial && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">
                      bank / payments
                    </span>
                  )}
                </td>
                <td className="py-1 text-right text-zinc-400">{r.rejections}</td>
                <td className="py-1 text-right text-zinc-500">
                  {new Date(r.last_seen).toLocaleDateString('en-IN')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-600">
        Domains only — subject lines are never shown here.
      </p>
    </div>
  )
}

export default function ScannerTab() {
  const [openGate, setOpenGate] = useState<string | null>(null)
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
          <>
            <p className="mb-2 text-xs text-zinc-500">
              Select a gate to see which domains it is rejecting.
            </p>
            <ul className="space-y-1 text-sm">
              {gates.data!.map((g) => {
                const open = openGate === g.gate
                return (
                  <li key={g.gate}>
                    <button
                      type="button"
                      onClick={() => setOpenGate(open ? null : g.gate)}
                      aria-expanded={open}
                      className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left transition-colors hover:bg-zinc-800/60 ${
                        open ? 'bg-zinc-800/60 text-zinc-100' : 'text-zinc-300'
                      }`}
                    >
                      <span>
                        <span className="mr-2 inline-block w-3 text-zinc-500">{open ? '▾' : '▸'}</span>
                        {g.gate}
                      </span>
                      <span className="text-zinc-500">{g.rejections}</span>
                    </button>
                    {open && (
                      <div className="mt-1 rounded border border-border-subtle/60 bg-zinc-900/40">
                        <GateSenders gate={g.gate} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
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
