import { Card } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { Check } from 'lucide-react'

interface AdherenceDiagnosticProps {
  healthScore: number
  totalIncome: number
  totalDebit: number
}

export function AdherenceDiagnostic({ healthScore, totalIncome, totalDebit }: AdherenceDiagnosticProps) {
  const scoreColor =
    healthScore >= 80 ? 'text-[var(--status-positive-text)]' :
    healthScore >= 55 ? 'text-[var(--status-warning-text)]' :
    'text-[var(--status-danger-text)]'

  const scoreBg =
    healthScore >= 80 ? 'border-[var(--status-positive-border)] bg-[var(--status-positive-subtle)]' :
    healthScore >= 55 ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)]' :
    'border-[var(--status-danger-border)] bg-[var(--status-danger-subtle)]'

  return (
    <Card className={`border md:col-span-1 flex flex-col items-center justify-center p-6 text-center shadow-lg ${scoreBg}`}>
      <div className="relative flex items-center justify-center h-28 w-28 rounded-full border-4 border-dashed border-zinc-700/60 mb-4 bg-surface-1/40">
        <span className={`text-4xl font-extrabold tracking-tight ${scoreColor}`}>
          {healthScore}
        </span>
        <span className="absolute bottom-1 text-[9px] uppercase tracking-wider font-bold text-zinc-500">
          Health Index
        </span>
      </div>
      
      <h2 className="text-md font-bold text-zinc-200">Adherence Diagnostic</h2>
      <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider mt-1.5 border border-zinc-800 rounded-full px-3.5 py-0.5 flex items-center gap-1.5 justify-center">
        <Check className="w-3 h-3 text-[var(--status-positive-text)]" /> Platform Verified
      </p>

      <div className="w-full mt-6 space-y-2 text-xs">
        <div className="flex justify-between border-b border-border-subtle/30 pb-2">
          <span className="text-zinc-500">Income Credits</span>
          <span className="font-semibold text-zinc-200">{formatCurrency(totalIncome)}</span>
        </div>
        <div className="flex justify-between border-b border-border-subtle/30 pb-2">
          <span className="text-zinc-500">Total Spent</span>
          <span className="font-semibold text-zinc-200">{formatCurrency(totalDebit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Adherence Status</span>
          <span className={`font-bold ${scoreColor}`}>
            {healthScore >= 80 ? 'Excellent Balance' : healthScore >= 55 ? 'Needs Adjustment' : 'Highly Imbalanced'}
          </span>
        </div>
      </div>
    </Card>
  )
}

export default AdherenceDiagnostic
