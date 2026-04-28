import { useEffect, useRef } from 'react'

/**
 * CursorLight — A subtle radial glow that follows the mouse cursor,
 * simulating an underwater dive torch effect.
 */
export default function CursorLight() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e) => {
      el.style.setProperty('--cx', `${e.clientX}px`)
      el.style.setProperty('--cy', `${e.clientY}px`)
      el.style.opacity = '1'
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  return <div ref={ref} className="cursor-light" aria-hidden="true" />
}
