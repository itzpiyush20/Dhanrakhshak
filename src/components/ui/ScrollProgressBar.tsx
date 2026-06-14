// ScrollProgressBar — thin brand gradient bar that fills as the page scrolls

import { useScrollProgress } from '@/hooks'

export default function ScrollProgressBar() {
  const progress = useScrollProgress()

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 9999,
        background: 'var(--surface-2)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'linear-gradient(90deg, var(--brand-500), var(--brand-400))',
          transition: 'width 0.1s linear',
          borderRadius: '0 99px 99px 0',
        }}
      />
    </div>
  )
}
