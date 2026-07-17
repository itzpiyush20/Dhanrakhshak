// ScrollProgressBar — thin brand gradient bar that fills as the page scrolls

import { useScrollProgress } from '@/hooks'

export default function ScrollProgressBar() {
  const progress = useScrollProgress()

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 z-toast pointer-events-none"
      style={{ background: 'var(--surface-2)' }}
    >
      <div
        style={{
          height: '100%',
          width: '100%',
          transform: `scaleX(${progress})`,
          transformOrigin: 'left',
          background: 'linear-gradient(90deg, var(--brand-500), var(--brand-400))',
          transition: 'transform 0.1s linear',
          borderRadius: '0 99px 99px 0',
        }}
      />
    </div>
  )
}
