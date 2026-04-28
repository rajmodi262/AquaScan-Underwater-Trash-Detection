import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Waves } from 'lucide-react'

const PHASES = [
  { text: 'Uploading image...', sub: 'Preparing for analysis' },
  { text: 'Running detection pipeline...', sub: 'Edge · Shape · Color · Texture · Frequency' },
  { text: 'Building visualizations...', sub: 'Generating heatmap and annotations' },
]

export default function LoadingOverlay() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800)
    const t2 = setTimeout(() => setPhase(2), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const current = PHASES[phase]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center
                 bg-[#020617]/90 backdrop-blur-2xl rounded-2xl"
      role="progressbar"
      aria-label="Analyzing image"
      aria-valuenow={phase + 1}
      aria-valuemin={1}
      aria-valuemax={3}
    >
      {/* Water wave loader */}
      <div className="relative mb-8">
        <div className="water-wave-loader" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Waves size={24} className="text-cyan-400/60 relative z-10" />
        </div>
      </div>

      {/* Sonar rings */}
      <div className="relative w-24 h-24 mb-6">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-sky-400/20"
            animate={{ scale: [1, 2.8], opacity: [0.4, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-8 h-8 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
              boxShadow: '0 0 30px rgba(14,165,233,0.5), 0 0 60px rgba(14,165,233,0.2)',
            }}
          />
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-2 mb-5">
        {PHASES.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              i <= phase
                ? 'bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.6)]'
                : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="relative w-52 h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-5">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-400"
          animate={{ width: `${((phase + 1) / PHASES.length) * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <motion.p
        key={current.text}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-sky-300 font-medium tracking-wide text-sm"
      >
        {current.text}
      </motion.p>
      <motion.p
        key={current.sub}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="text-xs text-slate-500 mt-2"
      >
        {current.sub}
      </motion.p>
    </motion.div>
  )
}
