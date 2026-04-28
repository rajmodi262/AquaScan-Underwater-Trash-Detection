import { useState, useCallback, useRef } from 'react'

export default function ComparisonSlider({ beforeSrc, afterSrc, beforeLabel = 'Original', afterLabel = 'Detected' }) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef(null)
  const dragging = useRef(false)

  const updatePos = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    setPos((x / rect.width) * 100)
  }, [])

  const onPointerDown = useCallback((e) => {
    dragging.current = true
    updatePos(e.clientX)
    const onMove = (ev) => { if (dragging.current) updatePos(ev.clientX) }
    const onUp = () => { dragging.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [updatePos])

  if (!beforeSrc || !afterSrc) return null

  return (
    <div className="comparison-container" ref={containerRef} onPointerDown={onPointerDown}>
      {/* After (full) */}
      <img src={afterSrc} alt={afterLabel} className="w-full" draggable={false} />

      {/* Before (clipped) */}
      <div className="comparison-overlay" style={{ width: `${pos}%` }}>
        <img src={beforeSrc} alt={beforeLabel} style={{ width: containerRef.current?.offsetWidth || '100%' }} draggable={false} />
      </div>

      {/* Handle */}
      <div className="comparison-handle" style={{ left: `${pos}%` }} />

      {/* Labels */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs text-slate-300 backdrop-blur-md font-medium"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {beforeLabel}
      </div>
      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs text-slate-300 backdrop-blur-md font-medium"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {afterLabel}
      </div>
    </div>
  )
}
