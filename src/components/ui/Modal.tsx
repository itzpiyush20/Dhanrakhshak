import { useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils'
import Button from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Anchors the modal to the bottom of the viewport on mobile (a bottom sheet), centered on larger screens. */
  sheet?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  sheet = false,
}: ModalProps) {

  // Escape key and scroll lock
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn(
          "fixed inset-0 z-modal flex justify-center overflow-hidden",
          sheet ? "items-end sm:items-start p-0 sm:p-4 sm:pt-10" : "items-start p-4 pt-10"
        )}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { type: 'spring', damping: 25, stiffness: 350 }
            }}
            exit={{
              opacity: 0,
              y: 20,
              transition: { duration: 0.2 }
            }}
            className={cn(
              "relative w-full max-w-lg bg-surface-1 border border-border-subtle shadow-2xl flex flex-col max-h-[75svh] overflow-hidden",
              sheet ? "rounded-t-3xl sm:rounded-2xl max-h-[92svh] sm:max-h-[75svh]" : "rounded-2xl",
              className
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-bold text-text-primary">{title}</h3>
              <Button
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 !p-0 rounded-lg flex items-center justify-center text-zinc-400 hover:text-text-primary hover:bg-surface-2"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1 text-sm text-text-secondary leading-relaxed">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-0/50 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
