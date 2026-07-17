import { Card } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { Sliders, CheckCircle2, AlertCircle } from 'lucide-react'

interface ScenarioSimulatorProps {
  simSalary: number
  setSimSalary: (val: number) => void
  simWants: number
  setSimWants: (val: number) => void
  totalIncome: number
  wantsSpent: number
  needsSpent: number
}

export function ScenarioSimulator({
  simSalary,
  setSimSalary,
  simWants,
  setSimWants,
  totalIncome,
  wantsSpent,
  needsSpent,
}: ScenarioSimulatorProps) {
  const simulatedSavings = Math.max(0, simSalary - needsSpent - simWants)
  const simSavingsPct = simSalary > 0 ? Math.round((simulatedSavings / simSalary) * 100) : 0

  return (
    <Card className="border-border-subtle bg-surface-1 shadow-md flex flex-col justify-between p-5 h-full">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="w-5 h-5 text-brand-400 shrink-0" />
          <h2 className="text-base font-bold text-zinc-200">Budget Scenario Simulator</h2>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          Slide your income or discretionary wants to simulate your monthly savings targets.
        </p>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400 font-semibold">Simulated Monthly Income</span>
              <span className="font-bold text-brand-300">{formatCurrency(simSalary)}</span>
            </div>
            <input
              type="range"
              min={Math.max(10000, totalIncome - 50000)}
              max={totalIncome + 100000 || 200000}
              step={5000}
              value={simSalary}
              onChange={(e) => setSimSalary(Number(e.target.value))}
              className="w-full accent-brand-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400 font-semibold">Simulated Leisure / Wants Outflow</span>
              <span className="font-bold text-[var(--status-warning-text)]">{formatCurrency(simWants)}</span>
            </div>
            <input
              type="range"
              min={1000}
              max={Math.max(10000, wantsSpent + 30000)}
              step={1000}
              value={simWants}
              onChange={(e) => setSimWants(Number(e.target.value))}
              className="w-full accent-brand-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 border border-brand-500/20 bg-brand-500/5 rounded-2xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-semibold">Simulated Monthly Savings</span>
          <span className="font-extrabold text-[var(--status-positive-text)] text-sm">
            {formatCurrency(simulatedSavings)} ({simSavingsPct}%)
          </span>
        </div>
        <div className="text-xs text-zinc-500 leading-relaxed flex items-start gap-1.5">
          {simSavingsPct >= 20 ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-positive-text)] shrink-0 mt-0.5" />
              <span>Adheres fully to the 20% compounding baseline. At this rate, your emergency reserve is secure.</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-[var(--status-danger-text)] shrink-0 mt-0.5" />
              <span>Below the 20% savings baseline. Try reducing wants or finding tax deductions to buffer savings.</span>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

export default ScenarioSimulator
