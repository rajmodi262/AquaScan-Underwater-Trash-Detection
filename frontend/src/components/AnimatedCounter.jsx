import { useState, useEffect, useRef } from 'react'

/**
 * AnimatedCounter — Counts up from 0 to `end` when the element
 * scrolls into view. Supports suffix text (e.g. "M+", "%").
 */
export default function AnimatedCounter({ end, suffix = '', duration = 2000, decimals = 0 }) {
  const [value, setValue] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) setStarted(true)
      },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return
    const startTime = performance.now()
    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(eased * end)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [started, end, duration])

  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value)

  return (
    <span ref={ref} className="animated-counter">
      {display}{suffix}
    </span>
  )
}
