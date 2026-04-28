import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export default function CellDetailModal({ cell, onClose }) {
  if (!cell) return null

  const checks = [
    { key: 'check_a', name: 'Edge Density', val: cell.edge_density, z: cell.z_edge, desc: 'Auto-Canny edge ratio — adapts to cell brightness' },
    { key: 'check_b', name: 'Shape Irregularity', val: cell.shape_score, z: cell.z_shape, desc: 'Adaptive contour analysis — detects unnatural shapes' },
    { key: 'check_c', name: 'Color Anomaly', val: cell.color_ratio, z: cell.z_color, desc: 'LAB color deviation from image baseline' },
    { key: 'check_d', name: 'Texture Entropy', val: cell.texture_score, z: cell.z_texture, desc: 'LBP + Laplacian sharpness — trash disrupts natural texture' },
    { key: 'check_e', name: 'Frequency Anomaly', val: cell.freq_score, z: cell.z_freq, desc: 'Windowed FFT — multi-band spectral analysis' },
    { key: 'check_f', name: 'Object Presence', val: cell.object_score, z: cell.z_object, desc: 'Morphological object detector — contour-based trash identification' },
  ]

  const score = cell.anomaly_score ?? 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Cell ${cell.label} details`}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="glass-card p-6 max-w-md w-full border-sky-500/15"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-mono font-bold"
                style={{
                  background: cell.is_trash ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                  border: `1px solid ${cell.is_trash ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
                  color: cell.is_trash ? '#f87171' : '#34d399',
                }}>
                {cell.label}
              </div>
              <h3 className="text-lg font-semibold text-white">Cell Analysis</h3>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors"
              aria-label="Close modal">
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* Status badge */}
          <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium mb-5
            ${cell.is_trash ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>
            {cell.is_trash ? '⚠ Anomaly Detected' : '✓ Normal'}
            <span className="text-xs opacity-70">
              ({cell.checks_passed}/6 checks flagged)
            </span>
          </div>

          {/* Anomaly Score Bar */}
          <div className="mb-5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium">Anomaly Score</span>
              <span className="font-mono text-white">{(score * 100).toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score * 100}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  score > 0.6 ? 'bg-gradient-to-r from-red-500 to-orange-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' :
                  score > 0.3 ? 'bg-gradient-to-r from-amber-500 to-yellow-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' :
                  'bg-gradient-to-r from-sky-500 to-cyan-500 shadow-[0_0_10px_rgba(14,165,233,0.3)]'
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-2 italic">
              ℹ Anomaly score = weighted z-deviation from image baseline. Not a probability.
            </p>
          </div>

          {/* Checks */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {checks.map((c) => {
              const val = c.val ?? 0
              const z = c.z ?? 0
              return (
                <div key={c.key} className="bg-white/[0.02] rounded-xl p-3.5 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-300 font-medium">{c.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider
                      ${cell[c.key] ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/15'}`}>
                      {cell[c.key] ? 'Outlier' : 'Normal'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">{c.desc}</p>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(val * 100, 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className={`h-full rounded-full ${cell[c.key] ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-sky-500 to-cyan-400'}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
                    <span>raw: {(val * 100).toFixed(1)}%</span>
                    <span>z-score: {z > 0 ? '+' : ''}{z.toFixed(1)}σ</span>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
