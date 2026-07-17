// ============================================
// InsurancePremiumCard — upcoming/overdue insurance
// premiums. Renders nothing when nothing is due.
// ============================================

import { useEffect, useState, useCallback } from 'react'
import { Card, Button } from '@/components/ui'
import { useToast } from '@/context'
import { formatCurrency, formatDate } from '@/utils'
import { getInsurancePolicies, markPremiumPaid } from '@/services/insurance'
import { ShieldCheck } from 'lucide-react'

interface Policy {
  id: string
  policy_name: string
  policy_type: string
  premium_amount: number
  frequency: string
  next_due_date: string
}

interface InsurancePremiumCardProps {
  /** Called after a premium is successfully marked paid. */
  onPaid?: () => void
}

export default function InsurancePremiumCard({ onPaid }: InsurancePremiumCardProps) {
  const { showToast } = useToast()
  const [duePolicies, setDuePolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)

  const fetchDue = useCallback(async () => {
    const { data } = await getInsurancePolicies()
    const today = new Date()
    const sevenDaysOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    const due = (data || []).filter((p) => new Date(p.next_due_date) <= sevenDaysOut)
    setDuePolicies(due)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDue()
  }, [fetchDue])

  const handleMarkPaid = async (id: string) => {
    setPayingId(id)
    const { error } = await markPremiumPaid(id)
    await fetchDue()
    setPayingId(null)

    if (error) {
      showToast(error.message || 'Could not mark premium as paid. Please try again.', 'error')
      return
    }

    onPaid?.()
  }

  if (loading || duePolicies.length === 0) return null

  const today = new Date().toISOString().split('T')[0]

  return (
    <Card className="shadow-md">
      <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-brand-400" />
        Premium Due
      </h2>
      <div className="space-y-2">
        {duePolicies.map((p) => {
          const isOverdue = p.next_due_date < today
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/50 border border-border-subtle/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">
                  {p.policy_type === 'life' ? '🧬' : '🏥'} {p.policy_name} — {formatCurrency(Number(p.premium_amount))}
                </p>
                <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-[var(--status-danger-text)]' : 'text-[var(--status-warning-text)]'}`}>
                  {isOverdue ? 'Overdue since ' : 'Due '}
                  {formatDate(p.next_due_date)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={payingId === p.id}
                onClick={() => handleMarkPaid(p.id)}
                className="shrink-0"
              >
                Mark paid
              </Button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
