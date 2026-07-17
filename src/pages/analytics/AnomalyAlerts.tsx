import { Card, Badge } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { CATEGORIES } from '@/constants'
import { CategoryIcon } from './CategoryIcon'
import { Flame } from 'lucide-react'

interface AnomalyItem {
  category: string
  thisMonth: number
  baseline: number
  spike: number
}

interface AnomalyAlertsProps {
  anomalies: AnomalyItem[]
}

export function AnomalyAlerts({ anomalies }: AnomalyAlertsProps) {
  if (anomalies.length === 0) return null

  return (
    <Card className="border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-[var(--status-warning-icon)] animate-pulse shrink-0" />
        <h2 className="text-base font-bold text-[var(--status-warning-text)]">Spending Anomaly Alerts</h2>
        <Badge variant="warning" className="ml-auto text-xs">AI Detected</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {anomalies.map((anomaly, i) => {
          const cat = CATEGORIES[anomaly.category as keyof typeof CATEGORIES] || CATEGORIES.other
          return (
            <div key={i} className="rounded-xl bg-[var(--status-warning-subtle)] border border-[var(--status-warning-border)] p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-sm font-bold text-[var(--status-warning-text)] flex items-center gap-1.5 truncate">
                  <CategoryIcon name={anomaly.category} className="w-4 h-4 text-[var(--status-warning-icon)] shrink-0" />
                  {cat.label}
                </span>
                <Badge variant="warning" className="shrink-0">+{anomaly.spike.toFixed(0)}%</Badge>
              </div>
              <p className="text-xs text-zinc-300">
                <span className="font-semibold text-white">{formatCurrency(anomaly.thisMonth)}</span> this month vs{' '}
                <span className="text-[var(--status-warning-text)] font-semibold">{formatCurrency(anomaly.baseline)}</span> baseline
              </p>
              <p className="text-xs text-[var(--status-warning-text)] mt-1 font-mono">
                {formatCurrency(anomaly.thisMonth - anomaly.baseline)} above average
              </p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default AnomalyAlerts
