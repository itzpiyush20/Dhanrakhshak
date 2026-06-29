import { Card, EmptyState } from '@/components/ui'
import { BrainCircuit, AlertCircle, Lightbulb } from 'lucide-react'

interface AIInsightsProps {
  aiSource: 'gemini' | 'rule-based' | null
  aiLoading: boolean
  aiAlerts: string[]
  aiInsights: string[]
}

export function AIInsights({
  aiSource,
  aiLoading,
  aiAlerts,
  aiInsights,
}: AIInsightsProps) {
  return (
    <Card className="border-border-subtle bg-surface-1 shadow-md p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="w-5 h-5 text-brand-400 shrink-0" />
          <h2 className="text-base font-bold text-zinc-200">Wealth Advisory Recommendations</h2>
          {aiSource && (
            <span className={`ml-auto text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full border ${
              aiSource === 'gemini'
                ? 'text-brand-400 border-brand-500/30 bg-brand-500/10'
                : 'text-zinc-500 border-zinc-700 bg-zinc-800/50'
            }`}>
              {aiSource === 'gemini' ? '✦ AI' : 'Rule-based'}
            </span>
          )}
        </div>

        {aiLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {aiAlerts.length > 0 && (
              <div className="mb-4 space-y-2">
                {aiAlerts.map((alert, i) => (
                  <div key={i} className="flex gap-2 p-3 text-xs bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] rounded-xl items-start">
                    <AlertCircle className="w-4 h-4 text-[var(--status-danger-icon)] shrink-0 mt-0.5" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {aiInsights.length > 0 ? aiInsights.map((insight, i) => (
                <div key={i} className="p-3 bg-surface-2/30 border border-border-subtle/20 rounded-xl text-xs text-zinc-300 leading-relaxed italic relative">
                  <span className="text-zinc-600 text-3xl font-serif absolute top-1 right-2 pointer-events-none select-none">"</span>
                  <span>{insight}</span>
                </div>
              )) : (
                <EmptyState
                  icon={<Lightbulb className="w-8 h-8 text-zinc-500" />}
                  title="No advice yet"
                  description="Record income and expenses for the selected month to trigger the wealth advisor."
                />
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

export default AIInsights
