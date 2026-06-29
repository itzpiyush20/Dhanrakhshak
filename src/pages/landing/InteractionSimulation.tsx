import { useState, useEffect } from 'react'
import { cn } from '@/utils'

export function InteractionSimulation() {
  const [step, setStep] = useState(0)
  const [budgetAmount, setBudgetAmount] = useState(4000)

  useEffect(() => {
    let active = true
    const run = () => {
      if (!active) return
      setStep(0)
      setBudgetAmount(4000)
      setTimeout(() => {
        if (active) setStep(1)
      }, 1000)
      setTimeout(() => {
        if (active) setStep(2)
      }, 3500)
      setTimeout(() => {
        if (active) setStep(3)
      }, 6000)
      setTimeout(() => {
        if (active) {
          setStep(4)
          setBudgetAmount(4250)
        }
      }, 8500)
      setTimeout(() => {
        if (active) run()
      }, 12500)
    }
    run()
    return () => {
      active = false
    }
  }, [])

  const totalBudget = 5000
  const budgetPercent = (budgetAmount / totalBudget) * 100

  return (
    <div className="relative w-full max-w-[480px] sb-card-light p-6 flex flex-col gap-5 overflow-hidden select-none">
      <style>{`
        @keyframes laser-sweep { 0%{top:0%;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{top:100%;opacity:0} }
        .laser-glow { position:absolute;left:0;right:0;height:2px;background:var(--sb-primary);opacity:0;z-index:10; }
        .laser-glow-active { animation:laser-sweep 2.2s ease-in-out infinite; }
        @keyframes pulse-border { 0%{border-color:var(--border-subtle)} 100%{border-color:var(--sb-primary)} }
        .pulse-emerald { animation:pulse-border 1.5s infinite alternate; }
        @keyframes insert-flash { 0%{background-color:var(--sb-primary-soft, transparent)} 100%{background-color:transparent} }
        .animate-insert { animation:insert-flash 1.5s ease-out; }
      `}</style>

      <div className="flex items-center justify-between border-b border-sb-hairline pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-sb-ink-secondary">Live Parser Engine</span>
        </div>
        <span className="text-[10px] font-mono text-sb-ink-muted bg-sb-canvas px-2 py-0.5 rounded border border-sb-hairline">
          {step === 0 ? 'READY' : step === 1 ? 'ALERT_IN' : step === 2 ? 'PARSING' : step === 3 ? 'DB_COMMIT' : 'SYNCED'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">1 · Incoming Bank Alert</span>
        <div className="relative min-h-[76px] bg-sb-canvas rounded-xl border border-sb-hairline p-3 overflow-hidden flex flex-col justify-center">
          {step === 2 && <div className="laser-glow laser-glow-active" />}
          {step === 0 ? (
            <div className="text-center text-xs text-sb-ink-muted font-mono italic">Waiting for transaction alert…</div>
          ) : (
            <div className={cn('flex gap-3 items-start transition-all duration-700', step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2', step === 2 && 'pulse-emerald')}>
              <div className="h-8 w-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 text-brand-400 font-mono text-sm font-bold">₹</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-sb-ink">SMS · ICICI Bank</span>
                  <span className="text-[10px] text-sb-ink-muted">Just now</span>
                </div>
                <p className="text-xs text-sb-ink-secondary leading-normal font-mono">UPI debit INR 250.00 at Starbucks. Ref: 290812.</p>
              </div>
            </div>
          )}
          {step >= 3 && (
            <div className="absolute right-2 bottom-2 bg-brand-500/10 text-brand-400 border border-brand-500/25 px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 animate-scale-up">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Parsed Locally ✔
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">2 · Device-Only Log</span>
        <div className="border border-sb-hairline rounded-xl overflow-hidden bg-sb-canvas">
          <div className="grid grid-cols-4 bg-sb-canvas border-b border-sb-hairline px-3 py-2 text-[10px] font-semibold text-sb-ink-muted tracking-widest uppercase">
            <div>Date</div><div className="col-span-2">Merchant</div><div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-sb-hairline min-h-[90px]">
            {step >= 3 && (
              <div className="grid grid-cols-4 px-3 py-2 text-xs items-center bg-brand-500/10 animate-insert">
                <div className="text-sb-ink-muted font-mono text-[10px]">Today</div>
                <div className="col-span-2">
                  <div className="font-semibold text-sb-ink">Starbucks</div>
                  <div className="text-[10px] text-brand-400">Food & Dining</div>
                </div>
                <div className="text-right font-bold text-sb-ink font-mono text-xs">-₹250</div>
              </div>
            )}
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-sb-ink-muted font-mono text-[10px]">Yest.</div>
              <div className="col-span-2"><div className="font-medium text-sb-ink">Netflix</div><div className="text-[10px] text-sb-ink-muted">Subscription</div></div>
              <div className="text-right text-sb-ink font-mono text-xs">-₹649</div>
            </div>
            <div className="grid grid-cols-4 px-3 py-2 text-xs items-center">
              <div className="text-sb-ink-muted font-mono text-[10px]">Jun 4</div>
              <div className="col-span-2"><div className="font-medium text-sb-ink">Zomato</div><div className="text-[10px] text-sb-ink-muted">Food & Dining</div></div>
              <div className="text-right text-sb-ink font-mono text-xs">-₹320</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-sb-ink-muted uppercase">3 · Budget Update</span>
        <div className="border border-sb-hairline rounded-xl p-4 bg-sb-canvas flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">🍔</span>
              <span className="text-xs font-semibold text-sb-ink">Food & Dining</span>
            </div>
            <span className="text-xs font-semibold text-sb-ink font-mono">₹{budgetAmount.toLocaleString('en-IN')} <span className="text-sb-ink-muted font-normal">/ ₹{totalBudget.toLocaleString('en-IN')}</span></span>
          </div>
          <div className="h-2 w-full bg-sb-hairline rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-out" style={{ width: `${budgetPercent}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-sb-ink-muted">
            <span>{budgetPercent.toFixed(0)}% used</span>
            {step === 4
              ? <span className="text-brand-400 animate-pulse font-mono">+₹250 added just now</span>
              : <span>₹{(totalBudget - budgetAmount).toLocaleString('en-IN')} remaining</span>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
