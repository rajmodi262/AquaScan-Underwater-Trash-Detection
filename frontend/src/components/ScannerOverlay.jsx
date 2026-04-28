import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * ScannerOverlay — A cinematic scanning animation that plays during image analysis.
 *
 * Phase 1 (0-7s): Horizontal glowing line sweeps top → bottom
 * Phase 2 (7-14s): Vertical glowing line sweeps left → right
 *
 * Props:
 *  - active: boolean — whether the scanner is running
 *  - imageSrc: string — base64 image to scan over
 *  - onComplete: () => void — called when scan finishes (if results not back yet)
 */
export default function ScannerOverlay({ active, imageSrc, onComplete }) {
  const [phase, setPhase] = useState(0) // 0=idle, 1=horizontal, 2=vertical, 3=done
  const [progress, setProgress] = useState(0)
  const [scanLine, setScanLine] = useState(0)
  const [statusText, setStatusText] = useState('')
  const rafRef = useRef(null)
  const startRef = useRef(0)

  useEffect(() => {
    if (!active) {
      setPhase(0)
      setProgress(0)
      setScanLine(0)
      return
    }

    setPhase(1)
    startRef.current = performance.now()

    const PHASE1_DURATION = 7000 // 7 seconds
    const PHASE2_DURATION = 7000 // 7 seconds
    const TOTAL = PHASE1_DURATION + PHASE2_DURATION

    const statusMessages = [
      'Initializing detection engine...',
      'Preprocessing image...',
      'Applying white balance correction...',
      'Running edge detection...',
      'Analyzing color anomalies...',
      'Computing texture patterns...',
      'Running YOLO object detection...',
      'Classifying detected objects...',
      'Scanning grid cells...',
      'Computing anomaly scores...',
      'Running multi-scale analysis...',
      'Generating heatmap...',
      'Finalizing results...',
    ]

    const animate = (now) => {
      const elapsed = now - startRef.current
      const totalProgress = Math.min(elapsed / TOTAL, 1)
      setProgress(totalProgress)

      // Status text
      const msgIndex = Math.min(
        Math.floor(totalProgress * statusMessages.length),
        statusMessages.length - 1
      )
      setStatusText(statusMessages[msgIndex])

      if (elapsed < PHASE1_DURATION) {
        // Phase 1: horizontal scan
        setPhase(1)
        setScanLine((elapsed / PHASE1_DURATION) * 100)
      } else if (elapsed < TOTAL) {
        // Phase 2: vertical scan
        setPhase(2)
        setScanLine(((elapsed - PHASE1_DURATION) / PHASE2_DURATION) * 100)
      } else {
        setPhase(3)
        onComplete?.()
        return
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active, onComplete])

  if (!active) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ background: 'rgba(2, 6, 18, 0.92)', backdropFilter: 'blur(8px)' }}
      >
        {/* Scanner container */}
        <div className="relative w-[85vw] max-w-[900px] aspect-video rounded-2xl overflow-hidden border border-cyan-500/20 shadow-[0_0_60px_rgba(0,200,255,0.15)]">
          {/* Background image */}
          {imageSrc && (
            <img
              src={imageSrc}
              alt="Scanning..."
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.6) saturate(0.8)' }}
            />
          )}

          {/* Grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `
              linear-gradient(rgba(0,200,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,200,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '10% 10%',
          }} />

          {/* Horizontal scan line (Phase 1) */}
          {phase === 1 && (
            <>
              {/* Main scan line */}
              <div
                className="absolute left-0 right-0 h-[3px] pointer-events-none"
                style={{
                  top: `${scanLine}%`,
                  background: 'linear-gradient(90deg, transparent 0%, #00e5ff 20%, #00fff5 50%, #00e5ff 80%, transparent 100%)',
                  boxShadow: '0 0 30px 10px rgba(0, 229, 255, 0.4), 0 0 60px 20px rgba(0, 229, 255, 0.15)',
                  transition: 'top 50ms linear',
                }}
              />
              {/* Trailing glow */}
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: `${Math.max(0, scanLine - 15)}%`,
                  height: `${Math.min(15, scanLine)}%`,
                  background: 'linear-gradient(to bottom, transparent, rgba(0, 229, 255, 0.08))',
                }}
              />
              {/* Scanned region tint */}
              <div
                className="absolute left-0 right-0 top-0 pointer-events-none"
                style={{
                  height: `${scanLine}%`,
                  background: 'rgba(0, 229, 255, 0.04)',
                  borderBottom: '1px solid rgba(0, 229, 255, 0.1)',
                }}
              />
            </>
          )}

          {/* Vertical scan line (Phase 2) */}
          {phase === 2 && (
            <>
              {/* Scanned region from Phase 1 */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'rgba(0, 229, 255, 0.04)' }}
              />
              {/* Main scan line */}
              <div
                className="absolute top-0 bottom-0 w-[3px] pointer-events-none"
                style={{
                  left: `${scanLine}%`,
                  background: 'linear-gradient(180deg, transparent 0%, #00ff88 20%, #00ffcc 50%, #00ff88 80%, transparent 100%)',
                  boxShadow: '0 0 30px 10px rgba(0, 255, 136, 0.4), 0 0 60px 20px rgba(0, 255, 136, 0.15)',
                  transition: 'left 50ms linear',
                }}
              />
              {/* Trailing glow */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${Math.max(0, scanLine - 15)}%`,
                  width: `${Math.min(15, scanLine)}%`,
                  background: 'linear-gradient(to right, transparent, rgba(0, 255, 136, 0.08))',
                }}
              />
              {/* Scanned column region */}
              <div
                className="absolute top-0 bottom-0 left-0 pointer-events-none"
                style={{
                  width: `${scanLine}%`,
                  background: 'rgba(0, 255, 136, 0.03)',
                  borderRight: '1px solid rgba(0, 255, 136, 0.1)',
                }}
              />
            </>
          )}

          {/* Corner brackets */}
          <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-cyan-400/60" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-400/60" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-400/60" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-cyan-400/60" />

          {/* Phase indicator */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wider"
              style={{
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(0,229,255,0.3)',
                color: phase === 1 ? '#00e5ff' : '#00ff88',
                boxShadow: `0 0 15px ${phase === 1 ? 'rgba(0,229,255,0.2)' : 'rgba(0,255,136,0.2)'}`,
              }}>
              {phase === 1 ? '◈ HORIZONTAL SCAN' : phase === 2 ? '◈ VERTICAL SCAN' : '◈ ANALYZING...'}
            </div>
          </div>
        </div>

        {/* Status bar below scanner */}
        <div className="absolute bottom-[12vh] left-1/2 -translate-x-1/2 w-[85vw] max-w-[900px]">
          {/* Progress bar */}
          <div className="h-1 rounded-full overflow-hidden mb-3"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                background: 'linear-gradient(90deg, #00e5ff, #00ff88)',
                boxShadow: '0 0 10px rgba(0,229,255,0.5)',
              }}
            />
          </div>

          {/* Status text */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: phase === 1 ? '#00e5ff' : '#00ff88' }} />
              <span className="text-xs font-mono text-slate-400">
                {statusText}
              </span>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {Math.round(progress * 100)}%
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="absolute top-[8vh] left-1/2 -translate-x-1/2 text-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-2xl font-bold tracking-wider"
              style={{
                background: 'linear-gradient(135deg, #00e5ff, #00ff88)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
              AQUASCAN DETECTION
            </h2>
            <p className="text-xs text-slate-500 mt-1 tracking-widest">
              YOLO + CLASSICAL CV MULTI-PASS ANALYSIS
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
