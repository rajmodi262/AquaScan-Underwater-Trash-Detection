import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Waves, ScanSearch, Upload, Image, BarChart3, Clock, Settings, Info,
  ArrowLeft, Wifi, WifiOff, Download, RotateCcw, Camera, ChevronDown
} from 'lucide-react'
import DropZone from '../components/DropZone'
import SettingsPanel from '../components/SettingsPanel'
import ResultsPanel from '../components/ResultsPanel'
import StatsCards from '../components/StatsCards'
import LoadingOverlay from '../components/LoadingOverlay'
import ScannerOverlay from '../components/ScannerOverlay'
import CellDetailModal from '../components/CellDetailModal'
import OceanBackground from '../components/OceanBackground'
import { useToast } from '../components/ToastContext'
import { detectTrash, fetchSamples, fetchSampleImage, checkHealth, exportResults } from '../utils/api'

const DEFAULT_SETTINGS = {
  gridRows: 4, gridCols: 4,
  outlierSigma: 1.5, checksToFlag: 2, dehaze: true,
}

const SIDEBAR_ITEMS = [
  { id: 'scan', icon: ScanSearch, label: 'Scan' },
  { id: 'upload', icon: Upload, label: 'Upload' },
  { id: 'samples', icon: Image, label: 'Samples' },
  { id: 'results', icon: BarChart3, label: 'Results' },
  { id: 'history', icon: Clock, label: 'History' },
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'about', icon: Info, label: 'About' },
]

export default function Dashboard() {
  const nav = useNavigate()
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [samples, setSamples] = useState([])
  const [selectedCell, setSelectedCell] = useState(null)
  const [backendStatus, setBackendStatus] = useState('checking')
  const [exporting, setExporting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [previewSrc, setPreviewSrc] = useState(null)
  const [activeNav, setActiveNav] = useState('scan')
  const [mobilePanel, setMobilePanel] = useState(false)
  const analyzeTimer = useRef(null)

  // Health check on mount
  useEffect(() => {
    checkHealth().then((data) => {
      const status = data.status === 'ok' ? 'ok' : 'error'
      setBackendStatus(status)
      if (status === 'error') toast.show('Backend is offline — start the server', 'warning')
    })
    const interval = setInterval(() => {
      checkHealth().then((data) => {
        setBackendStatus(data.status === 'ok' ? 'ok' : 'error')
      })
    }, 30000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSamples().then((d) => setSamples(d.samples || [])).catch(() => {})
  }, [])

  const handleFile = useCallback((f) => {
    setFile(f); setResults(null); setError(null)
  }, [])

  // Auto-analyze on file change
  useEffect(() => {
    if (!file || loading) return
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current)
    analyzeTimer.current = setTimeout(() => {
      runAnalysis(file, settings)
    }, 500)
    return () => { if (analyzeTimer.current) clearTimeout(analyzeTimer.current) }
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  const runAnalysis = useCallback(async (targetFile, targetSettings) => {
    if (!targetFile) return
    setLoading(true); setError(null); setScanning(true)
    const reader = new FileReader()
    reader.onload = (e) => setPreviewSrc(e.target.result)
    reader.readAsDataURL(targetFile)
    try {
      const res = await detectTrash(targetFile, targetSettings)
      setResults(res)
      toast.show('Analysis complete', 'success')
    } catch (e) {
      setError(e.message || 'Analysis failed')
      toast.show(e.message || 'Analysis failed', 'error')
    }
    finally { setLoading(false); setScanning(false) }
  }, [toast])

  const reAnalyze = useCallback(() => {
    runAnalysis(file, settings)
  }, [file, settings, runAnalysis])

  const handleSample = useCallback(async (name) => {
    try {
      const d = await fetchSampleImage(name)
      const res = await fetch(d.data)
      const blob = await res.blob()
      handleFile(new File([blob], name, { type: blob.type }))
      toast.show(`Loaded sample: ${name}`, 'info')
    } catch {
      setError('Failed to load sample')
      toast.show('Failed to load sample', 'error')
    }
  }, [handleFile, toast])

  const handleExport = useCallback(async () => {
    if (!file || exporting) return
    setExporting(true)
    try {
      await exportResults(file, settings)
      toast.show('Report exported successfully', 'success')
    } catch (e) {
      setError(e.message || 'Export failed')
      toast.show(e.message || 'Export failed', 'error')
    }
    finally { setExporting(false) }
  }, [file, settings, exporting, toast])

  const reset = () => {
    setFile(null); setResults(null); setError(null); setSettings(DEFAULT_SETTINGS)
    const inp = document.getElementById('file-input')
    if (inp) inp.value = ''
  }

  return (
    <div className="min-h-screen relative">
      {/* CSS Ocean Background */}
      <OceanBackground />

      {/* Backend offline banner */}
      <AnimatePresence>
        {backendStatus === 'error' && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 text-white text-sm text-center py-2.5 px-4"
            style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.85), rgba(220,38,38,0.9))', backdropFilter: 'blur(8px)' }}
            role="alert"
          >
            <WifiOff size={14} className="inline mr-2" />
            Backend offline — Start the server with <code className="bg-black/20 px-2 py-0.5 rounded mx-1 font-mono text-xs">cd backend && python main.py</code>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ LAYOUT: Sidebar + Content ═══════════ */}
      <div className="relative z-10 flex min-h-screen">

        {/* ── LEFT SIDEBAR (Desktop) ── */}
        <motion.aside
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="hidden md:flex flex-col items-center w-[72px] py-5 px-2 fixed left-0 top-0 bottom-0 z-40"
          style={{ marginTop: backendStatus === 'error' ? '40px' : 0 }}
        >
          <div className="glass-sidebar h-full w-full flex flex-col items-center py-5 gap-2">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 cursor-pointer hover:scale-105 transition-transform"
              style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,211,238,0.1))', border: '1px solid rgba(14,165,233,0.25)' }}
              onClick={() => nav('/')}>
              <Waves size={18} className="text-cyan-400" />
            </div>

            <div className="h-px w-8 bg-white/[0.06] mb-2" />

            {/* Nav items */}
            <nav className="flex flex-col gap-1.5 flex-1" aria-label="Dashboard navigation">
              {SIDEBAR_ITEMS.slice(0, 5).map(item => {
                const Icon = item.icon
                return (
                  <button key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    className={`sidebar-item group ${activeNav === item.id ? 'active' : ''}`}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Icon size={18} />
                    {/* Tooltip */}
                    <span className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs text-white whitespace-nowrap
                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </nav>

            {/* Bottom nav */}
            <div className="h-px w-8 bg-white/[0.06] mb-2" />
            {SIDEBAR_ITEMS.slice(5).map(item => {
              const Icon = item.icon
              return (
                <button key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`sidebar-item group ${activeNav === item.id ? 'active' : ''}`}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon size={18} />
                  <span className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs text-white whitespace-nowrap
                    opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.aside>

        {/* ── MAIN CONTENT (with sidebar offset) ── */}
        <div className="flex-1 md:ml-[72px]" style={{ marginTop: backendStatus === 'error' ? '40px' : 0 }}>

          {/* ── TOP BAR ── */}
          <motion.header
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="sticky top-0 z-40 px-4 md:px-6 py-3"
            style={{ top: backendStatus === 'error' ? '40px' : 0 }}
          >
            <div className="max-w-7xl mx-auto glass-strong flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button onClick={() => nav('/')}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                  aria-label="Back to landing page">
                  <ArrowLeft size={16} />
                </button>
                <div className="h-5 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <Waves size={16} className="text-cyan-400 md:hidden" />
                  <span className="font-bold text-white text-sm tracking-wide">
                    Aqua<span className="text-cyan-400">Scan</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md border border-sky-500/20 text-sky-400/60 font-mono hidden sm:inline">
                    DASHBOARD
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Connection status */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                  aria-label={`Backend status: ${backendStatus}`}>
                  {backendStatus === 'ok'
                    ? <Wifi size={12} className="text-emerald-400" />
                    : backendStatus === 'error'
                    ? <WifiOff size={12} className="text-red-400" />
                    : <Wifi size={12} className="text-amber-400 animate-pulse" />}
                  <span className="text-[10px] text-slate-500 hidden sm:inline font-medium">
                    {backendStatus === 'ok' ? 'Connected' : backendStatus === 'error' ? 'Offline' : 'Checking...'}
                  </span>
                </div>

                {results && (
                  <>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={handleExport}
                      disabled={exporting}
                      className="btn-ghost text-xs ripple flex items-center gap-1.5 py-1.5 px-3"
                      aria-label="Export results as ZIP"
                      id="export-btn"
                    >
                      <Download size={12} />
                      <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={reset}
                      className="btn-ghost text-xs ripple flex items-center gap-1.5 py-1.5 px-3"
                      id="reset-btn"
                      aria-label="Start new scan"
                    >
                      <RotateCcw size={12} />
                      <span className="hidden sm:inline">New Scan</span>
                    </motion.button>
                  </>
                )}

                {/* Mobile panel toggle */}
                <button
                  onClick={() => setMobilePanel(!mobilePanel)}
                  className="md:hidden btn-ghost p-1.5"
                  aria-label="Toggle control panel"
                >
                  <ChevronDown size={16} className={`transition-transform ${mobilePanel ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          </motion.header>

          {/* ── MAIN LAYOUT ── */}
          <main className="max-w-7xl mx-auto px-4 md:px-6 py-4" role="main">

            {/* Mobile collapsible panel */}
            <AnimatePresence>
              {mobilePanel && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="md:hidden overflow-hidden mb-4 space-y-4"
                >
                  <div className="glass-card p-1">
                    <DropZone onFile={handleFile} disabled={loading} />
                  </div>
                  {samples.length > 0 && (
                    <SampleGrid samples={samples} onSelect={handleSample} disabled={loading} />
                  )}
                  <SettingsPanel settings={settings} onChange={setSettings}
                    onAnalyze={reAnalyze} disabled={loading} hasFile={!!file} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid lg:grid-cols-[280px_1fr] gap-5">

              {/* ── LEFT CONTROL PANEL (Desktop) ── */}
              <motion.div
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="space-y-4 hidden md:block"
              >
                {/* Upload */}
                <div className="glass-card glow-pulse p-1.5">
                  <DropZone onFile={handleFile} disabled={loading} />
                </div>

                {/* Sample Images */}
                {samples.length > 0 && (
                  <SampleGrid samples={samples} onSelect={handleSample} disabled={loading} />
                )}

                {/* Settings */}
                <SettingsPanel settings={settings} onChange={setSettings}
                  onAnalyze={reAnalyze} disabled={loading} hasFile={!!file} />
              </motion.div>

              {/* ── MAIN RESULTS PANEL ── */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.25 }}
                className="relative min-h-[400px]"
              >
                <ScannerOverlay active={scanning} imageSrc={previewSrc} />
                <AnimatePresence>{loading && !scanning && <LoadingOverlay />}</AnimatePresence>
                <ResultsPanel images={results?.images} />

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-4 p-4 glass-card border-red-500/20 text-red-400 text-sm flex items-center gap-2"
                      role="alert">
                      <WifiOff size={14} />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Cell Grid */}
                {results && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }} className="mt-5 glass-card p-5">
                    <h3 className="text-xs font-semibold text-sky-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <BarChart3 size={12} />
                      Cell Analysis — Click for details
                    </h3>
                    <div className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${Math.round(Math.sqrt(results.cells.length))}, 1fr)` }}>
                      {results.cells.map((c) => (
                        <button key={c.label} onClick={() => setSelectedCell(c)}
                          className={`p-2.5 rounded-xl text-xs font-mono transition-all duration-300
                            hover:scale-105 ripple cursor-pointer border
                            ${c.is_trash
                              ? 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:border-red-500/30'
                              : 'bg-emerald-500/8 border-emerald-500/12 text-emerald-400/80 hover:bg-emerald-500/12 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-500/20'
                            }`}
                          aria-label={`Cell ${c.label}: ${c.is_trash ? 'Anomaly detected' : 'Normal'}, score ${(c.anomaly_score * 100).toFixed(0)}%`}
                          tabIndex={0}>
                          <div className="text-[10px] opacity-50">{c.label}</div>
                          <div className="font-bold text-sm">{(c.anomaly_score * 100).toFixed(0)}%</div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Detected Objects */}
                {results?.objects?.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }} className="mt-5 glass-card p-5">
                    <h3 className="text-xs font-semibold text-sky-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Camera size={12} />
                      Detected Objects — {results.objects.length} found
                    </h3>
                    <div className="space-y-2">
                      {results.objects.map((obj, i) => {
                        const catColors = {
                          bottle: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
                          bag: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25',
                          can: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
                          debris: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
                        }
                        const catIcons = { bottle: '🍶', bag: '🛍️', can: '🥫', debris: '🗑️' }
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]
                            hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${catColors[obj.category] || 'bg-slate-500/15 text-slate-300 border-slate-500/25'}`}>
                              {catIcons[obj.category] || '❓'} {obj.category}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {Math.round(obj.confidence * 100)}% match
                            </span>
                            <span className="text-xs text-slate-600 ml-auto font-mono">
                              {obj.area.toLocaleString()}px²
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}

                {/* Stats Cards */}
                {results && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-5"
                  >
                    <StatsCards summary={results.summary} />
                  </motion.div>
                )}
              </motion.div>
            </div>
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-3"
        aria-label="Mobile navigation">
        <div className="glass-strong flex items-center justify-around py-2 rounded-2xl">
          {SIDEBAR_ITEMS.slice(0, 5).map(item => {
            const Icon = item.icon
            return (
              <button key={item.id}
                onClick={() => { setActiveNav(item.id); setMobilePanel(item.id === 'upload' || item.id === 'samples' || item.id === 'settings') }}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all
                  ${activeNav === item.id ? 'text-cyan-400' : 'text-slate-500'}`}
                aria-label={item.label}
              >
                <Icon size={18} />
                <span className="text-[9px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Cell Detail Modal */}
      <CellDetailModal cell={selectedCell} onClose={() => setSelectedCell(null)} />
    </div>
  )
}

/* ── Sample Images Grid (extracted for reuse) ── */
function SampleGrid({ samples, onSelect, disabled }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-semibold text-sky-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Camera size={12} />
        Sample Images
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {samples.slice(0, 6).map((s) => (
          <button key={s} onClick={() => onSelect(s)} disabled={disabled}
            className="group aspect-square rounded-xl bg-white/[0.03] border border-white/[0.06]
                       hover:border-sky-500/40 hover:bg-sky-500/5 transition-all duration-300
                       flex flex-col items-center justify-center p-1.5
                       hover:scale-105 hover:shadow-[0_0_15px_rgba(14,165,233,0.1)] ripple overflow-hidden"
            aria-label={`Load sample ${s}`}>
            <Image size={16} className="text-slate-600 group-hover:text-sky-400 transition-colors mb-1" />
            <span className="text-[9px] text-slate-500 group-hover:text-sky-400 transition-colors truncate w-full text-center leading-tight">
              {s.replace(/\.(jpg|jpeg|png|webp)$/i, '')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
