// ============================================
// InstallPrompt — captures the browser's PWA
// install prompt and surfaces our own banner.
// The native browser-menu path ("Add to Home
// Screen") is easy to miss, especially for
// less tech-savvy users — an explicit button
// converts far better.
// ============================================

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import Button from '@/components/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'dhanrakshak_install_prompt_dismissed'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  const handleDismiss = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true')
    } catch (e) {}
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border-default bg-surface-1 p-4 shadow-[var(--shadow-lg)] sm:left-auto sm:right-4">
      <Download className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100">Install Dhanrakshak</p>
        <p className="text-xs text-zinc-400">Add it to your home screen for quick, app-like access.</p>
      </div>
      <Button size="sm" onClick={handleInstall}>
        Install
      </Button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-surface-2 hover:text-zinc-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
