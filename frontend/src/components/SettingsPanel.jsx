import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, ChevronRight, Grid3X3, Gauge, ShieldCheck, Droplets, Microscope } from 'lucide-react'

const PRESETS = [
  { id: 'relaxed',  label: 'Relaxed',  icon: '🟢', sigma: 2.0, checks: 3, desc: 'Flags only obvious debris' },
  { id: 'balanced', label: 'Balanced', icon: '🟡', sigma: 1.5, checks: 2, desc: 'Default sensitivity' },
  { id: 'strict',   label: 'Strict',   icon: '🔴', sigma: 1.0, checks: 1, desc: 'Flags subtle anomalies' },
]

export default function SettingsPanel({ settings, onChange, onAnalyze, disabled, hasFile }) {
  const [mode, setMode] = useState('balanced')
  const update = (key, val) => onChange({ ...settings, [key]: val })

  const applyPreset = (preset) => {
    setMode(preset.id)
    onChange({ ...settings, outlierSigma: preset.sigma, checksToFlag: preset.checks })
  }

  const isCustom = mode === 'custom'
  const activePreset = PRESETS.find(p => p.id === mode)

  return (
    <div className="glass-card p-5 space-y-5" role="region" aria-label="Detection settings">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(34,211,238,0.08))', border: '1px solid rgba(14,165,233,0.15)' }}>
          <Settings size={14} className="text-cyan-400" />
        </div>
        <h3 className="text-sm font-semibold text-white tracking-wide">Detection Settings</h3>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Sensitivity Presets */}
      <div>
        <label className="text-xs text-slate-400 mb-2.5 block font-medium flex items-center gap-1.5">
          <Gauge size={12} className="text-sky-400/60" />
          Sensitivity Preset
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-all duration-300 border
                ${mode === p.id
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                  : 'border-white/[0.06] text-slate-500 hover:border-white/[0.12] hover:text-slate-300 hover:bg-white/[0.02]'
                }`}
              aria-label={`${p.label} preset: ${p.desc}`}
              aria-pressed={mode === p.id}
            >
              <span className="text-sm">{p.icon}</span>
              <span className="block mt-0.5">{p.label}</span>
            </button>
          ))}
        </div>
        {activePreset && (
          <p className="text-[10px] text-slate-500 mt-2 italic pl-1">{activePreset.desc}</p>
        )}
      </div>

      {/* Advanced Toggle */}
      <button
        onClick={() => setMode(isCustom ? 'balanced' : 'custom')}
        className="text-xs text-sky-400/60 hover:text-sky-400 transition-colors flex items-center gap-1.5 group w-full"
        aria-expanded={isCustom}
      >
        <ChevronRight size={12} className={`transition-transform duration-200 ${isCustom ? 'rotate-90' : ''} group-hover:text-sky-400`} />
        Advanced Settings
      </button>

      {/* Advanced Sliders */}
      <motion.div
        initial={false}
        animate={{ height: isCustom ? 'auto' : 0, opacity: isCustom ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden space-y-4"
      >
        {/* Grid Size */}
        <div>
          <label className="flex justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5"><Grid3X3 size={11} className="text-sky-400/50" /> Grid Size</span>
            <span className="text-cyan-400 font-mono text-xs px-2 py-0.5 bg-cyan-500/10 rounded-md border border-cyan-500/15">
              {settings.gridRows}×{settings.gridCols}
            </span>
          </label>
          <input type="range" min={2} max={8} step={1} value={settings.gridRows}
            onChange={(e) => { const v = +e.target.value; update('gridRows', v); update('gridCols', v) }}
            aria-label={`Grid size: ${settings.gridRows} by ${settings.gridCols}`} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>2×2</span><span>8×8</span></div>
        </div>

        {/* Outlier Sensitivity */}
        <div>
          <label className="flex justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5"><ShieldCheck size={11} className="text-sky-400/50" /> Outlier Sensitivity</span>
            <span className="text-cyan-400 font-mono text-xs px-2 py-0.5 bg-cyan-500/10 rounded-md border border-cyan-500/15">
              {settings.outlierSigma.toFixed(1)}σ
            </span>
          </label>
          <input type="range" min={0.5} max={3.0} step={0.1} value={settings.outlierSigma}
            onChange={(e) => { update('outlierSigma', +e.target.value); setMode('custom') }}
            aria-label={`Outlier sensitivity: ${settings.outlierSigma.toFixed(1)} sigma`} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>More sensitive</span><span>More strict</span>
          </div>
        </div>

        {/* Min Checks */}
        <div>
          <label className="flex justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5"><ShieldCheck size={11} className="text-sky-400/50" /> Min Checks to Flag</span>
            <span className="text-cyan-400 font-mono text-xs px-2 py-0.5 bg-cyan-500/10 rounded-md border border-cyan-500/15">
              {settings.checksToFlag}/5
            </span>
          </label>
          <input type="range" min={1} max={5} step={1} value={settings.checksToFlag}
            onChange={(e) => { update('checksToFlag', +e.target.value); setMode('custom') }}
            aria-label={`Minimum checks to flag: ${settings.checksToFlag} of 5`} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>More sensitive</span><span>More strict</span>
          </div>
        </div>
      </motion.div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Dehaze Toggle */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div
          className={`w-11 h-[22px] rounded-full transition-all duration-300 relative
            ${settings.dehaze ? 'bg-sky-500 shadow-[0_0_14px_rgba(14,165,233,0.4)]' : 'bg-slate-700/60'}`}
          onClick={() => update('dehaze', !settings.dehaze)}
          role="switch"
          aria-checked={settings.dehaze}
          aria-label="Toggle dehazing"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update('dehaze', !settings.dehaze) }}}
        >
          <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300
            ${settings.dehaze ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets size={12} className="text-sky-400/50" />
          <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">Dehazing</span>
        </div>
      </label>

      {/* Re-Analyze Button */}
      <button onClick={onAnalyze} disabled={disabled || !hasFile}
        className={`w-full btn-primary text-sm py-3.5 ripple rounded-xl flex items-center justify-center gap-2
          ${(!hasFile || disabled) ? 'opacity-30 pointer-events-none !shadow-none' : ''}`}
        id="analyze-btn"
        aria-label={disabled ? 'Analyzing image' : 'Re-analyze image with current settings'}>
        {disabled ? (
          <><span className="animate-spin-slow">⏳</span> Analyzing...</>
        ) : (
          <><Microscope size={16} /> Re-Analyze</>
        )}
      </button>
    </div>
  )
}
