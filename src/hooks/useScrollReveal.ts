// useScrollReveal — IntersectionObserver hook for scroll-triggered animations
// Adds 'data-revealed' attribute when elements enter the viewport.

import { useEffect, useRef } from 'react'

interface UseScrollRevealOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useScrollReveal(
  options: UseScrollRevealOptions = {}
) {
  const { threshold = 0.12, rootMargin = '0px 0px -40px 0px', once = true } = options
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!elements.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0
            setTimeout(() => {
              el.setAttribute('data-revealed', 'true')
            }, delay)
            if (once) observer.unobserve(el)
          }
        })
      },
      { threshold, rootMargin }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return containerRef
}
