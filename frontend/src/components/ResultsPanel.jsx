import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanSearch, Flame, GitCompare } from 'lucide-react'
import ComparisonSlider from './ComparisonSlider'

const tabs = [
  { id: 'annotated', label: 'Detected', icon: ScanSearch },
  { id: 'heatmap',   label: 'Heatmap',  icon: Flame },
  { id: 'compare',   label: 'Compare',  icon: GitCompare },
]

export default function ResultsPanel({ images }) {
  const [tab, setTab] = useState('annotated')

  if (!images) {
    return (
      <div className="glass-card flex items-center justify-center min-h-[400px]"
        role="region" aria-label="Results area">
        <div className="text-center px-6">
          {/* Animated scanner icon */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-2 rounded-full border border-dashed border-sky-500/20"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <ScanSearch size={28} className="text-sky-400/40" />
            </div>
            {/* Scan wave effect */}
            <motion.div
              animate={{ y: [0, 56, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-2 right-2 h-[2px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(14,165,233,0.4), transparent)',
                top: '12px',
              }}
            />
          </div>
          <p className="text-sm text-slate-400 font-medium mb-2">
            Upload an underwater image to begin analysis
          </p>
          <p className="text-xs text-slate-600 leading-relaxed max-w-[250px] mx-auto">
            Detection starts automatically after upload. Results will appear here with annotated images and heatmaps.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card overflow-hidden" role="region" aria-label="Detection results">
      {/* Tabs */}
      <div className="flex border-b border-white/[0.05]" role="tablist" aria-label="Result views">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`flex-1 py-3.5 text-sm font-medium transition-all duration-300 relative ripple
                flex items-center justify-center gap-2
                ${tab === t.id ? 'text-sky-400 tab-active bg-white/[0.02]' : 'text-slate-500 hover:text-slate-300'}`}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="p-4 relative" role="tabpanel" id={`panel-${tab}`}>
        {/* Corner brackets */}
        <div className="absolute top-6 left-6 w-4 h-4 border-t border-l border-cyan-500/20 rounded-tl-sm z-10" />
        <div className="absolute top-6 right-6 w-4 h-4 border-t border-r border-cyan-500/20 rounded-tr-sm z-10" />
        <div className="absolute bottom-6 left-6 w-4 h-4 border-b border-l border-cyan-500/20 rounded-bl-sm z-10" />
        <div className="absolute bottom-6 right-6 w-4 h-4 border-b border-r border-cyan-500/20 rounded-br-sm z-10" />

        <AnimatePresence mode="wait">
          {tab === 'annotated' && (
            <motion.img key="a" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
              src={images.annotated} alt="Detection results showing flagged grid cells"
              className="w-full rounded-xl" id="result-annotated" />
          )}
          {tab === 'heatmap' && (
            <motion.img key="h" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
              src={images.heatmap} alt="Anomaly heatmap visualization"
              className="w-full rounded-xl" id="result-heatmap" />
          )}
          {tab === 'compare' && (
            <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ComparisonSlider beforeSrc={images.original} afterSrc={images.annotated} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
