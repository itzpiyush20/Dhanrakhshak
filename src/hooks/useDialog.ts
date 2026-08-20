// ============================================
// useDialog — modal focus management
//
// Both dialogs in this app were missing most of what makes one usable by
// keyboard. The shared <Modal> handled Escape and scroll lock but never moved
// focus, so a keyboard user opening it stayed on the page behind and tabbed
// through the content underneath. AuthModal announced role="dialog"
// aria-modal="true" — a promise that focus is confined — while doing nothing
// to confine it, and did not close on Escape at all.
//
// One hook so both behave the same and a third dialog inherits it for free.
// ============================================

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Traps focus inside a dialog while it is open, closes it on Escape, locks
 * background scrolling, and restores focus to whatever was focused before.
 *
 * Attach the returned ref to the dialog panel (not the backdrop), and give
 * that element `tabIndex={-1}` so it can hold focus when it contains no
 * focusable children.
 */
export function useDialog<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<T | null>(null)

  // Callers pass inline arrow functions, so `onClose` is a new value on every
  // render. Depending on it directly would re-run the effect constantly and
  // yank focus back to the first field while the user is typing.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    const container = containerRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const getFocusable = (): HTMLElement[] =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
        // offsetParent is null for display:none subtrees, which must not be
        // reachable by Tab.
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')

    // Move focus in, so the first Tab lands inside the dialog rather than on
    // the page behind it.
    const initial = getFocusable()[0] ?? container
    initial?.focus?.()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const items = getFocusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = !!container && container.contains(active)

      if (e.shiftKey) {
        if (active === first || !inside) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !inside) {
        e.preventDefault()
        first.focus()
      }
    }

    // Capture phase: get the key before a child's own handler can stop it.
    document.addEventListener('keydown', handleKeyDown, true)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      // Return the user to where they were, not to the top of the document.
      previouslyFocused?.focus?.()
    }
  }, [isOpen])

  return containerRef
}
