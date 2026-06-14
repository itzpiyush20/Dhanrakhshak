import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

export default function CursorFollower() {
  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Position motion values
  const cursorX = useMotionValue(-100)
  const cursorY = useMotionValue(-100)

  // Springs for smooth movement
  const dotSpringConfig = { stiffness: 600, damping: 30, mass: 0.15 }
  const dotX = useSpring(cursorX, dotSpringConfig)
  const dotY = useSpring(cursorY, dotSpringConfig)

  const ringSpringConfig = { stiffness: 120, damping: 20, mass: 0.5 }
  const ringX = useSpring(cursorX, ringSpringConfig)
  const ringY = useSpring(cursorY, ringSpringConfig)

  useEffect(() => {
    // Only activate cursor follower on devices that support hover (fine pointer / desktops)
    const mediaQuery = window.matchMedia('(pointer: fine)')
    if (!mediaQuery.matches) return

    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX)
      cursorY.set(e.clientY)
      if (!isVisible) setIsVisible(true)
    }

    const handleMouseLeave = () => {
      setIsVisible(false)
    }

    const handleMouseEnter = () => {
      setIsVisible(true)
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const isInteractive = 
        target.tagName === 'BUTTON' || 
        target.tagName === 'A' || 
        target.closest('button') || 
        target.closest('a') || 
        target.classList.contains('cursor-pointer') ||
        window.getComputedStyle(target).cursor === 'pointer'

      setIsHovered(!!isInteractive)
    }

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)
    window.addEventListener('mouseover', handleMouseOver)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseenter', handleMouseEnter)
      window.removeEventListener('mouseover', handleMouseOver)
    }
  }, [cursorX, cursorY, isVisible])

  if (!isVisible) return null

  return (
    <>
      {/* Outer Ring */}
      <motion.div
        className="fixed top-0 left-0 w-7 h-7 rounded-full border border-brand-500 pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 hidden md:block"
        style={{
          x: ringX,
          y: ringY,
          scale: isHovered ? 1.4 : 1,
          backgroundColor: isHovered ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0)',
          borderColor: isHovered ? 'var(--brand-400)' : 'var(--brand-500)',
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      />
      {/* Inner Dot */}
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 bg-brand-400 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 hidden md:block"
        style={{
          x: dotX,
          y: dotY,
        }}
      />
    </>
  )
}
