import { useState, useEffect } from 'react'

interface ScrambleTextProps {
  value: string
  trigger: boolean
}

export function ScrambleText({ value, trigger }: ScrambleTextProps) {
  const [display, setDisplay] = useState('———')
  const chars = '!<>-_\\/[]{}—=+*^?#abcdefghijklmnopqrstuvwxyz0123456789'

  useEffect(() => {
    if (!trigger) return
    let iteration = 0
    const maxIterations = value.length * 3
    const interval = setInterval(() => {
      setDisplay(
        value
          .split('')
          .map((char, idx) => {
            if (idx < iteration / 3) return char
            if (char === ' ') return ' '
            return chars[Math.floor(Math.random() * chars.length)]
          })
          .join('')
      )
      iteration++
      if (iteration > maxIterations) {
        clearInterval(interval)
        setDisplay(value)
      }
    }, 35)
    return () => clearInterval(interval)
  }, [trigger, value])

  return <span className="font-mono">{display}</span>
}
