import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Image, FileType } from 'lucide-react'

export default function DropZone({ onFile, disabled }) {
  const [drag, setDrag] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState(null)

  const handleFile = useCallback((f) => {
    if (!f || disabled) return
    setPreview(URL.createObjectURL(f))
    setFileName(f.name)
    onFile(f)
  }, [onFile, disabled])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer?.files?.[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }, [handleFile])

  const onInput = useCallback((e) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  return (
    <div className="relative">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !disabled && document.getElementById('file-input')?.click()}
        className={`
          relative rounded-2xl transition-all duration-500 cursor-pointer
          flex flex-col items-center justify-center text-center min-h-[200px] p-6
          ${drag
            ? 'animated-border-active bg-sky-500/10 scale-[1.02] shadow-[0_0_40px_rgba(14,165,233,0.25)]'
            : 'animated-border hover:bg-white/[0.02]'}
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
        id="drop-zone"
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="relative rounded-xl overflow-hidden mb-3 border border-white/10">
                <img src={preview} alt="Preview" className="max-h-[130px] object-contain" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <FileType size={12} className="text-cyan-400" />
                <span className="truncate max-w-[150px]">{fileName}</span>
              </div>
              <p className="text-[10px] text-cyan-400/60 mt-1">Click to change</p>
            </motion.div>
          ) : (
            <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center">
              {/* Upload icon with ripple */}
              <div className="relative mb-4">
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0, 0.15] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full bg-cyan-400/20"
                  style={{ margin: '-12px' }}
                />
                <motion.div
                  animate={{ scale: [1, 1.6, 1], opacity: [0.08, 0, 0.08] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute inset-0 rounded-full bg-cyan-400/10"
                  style={{ margin: '-24px' }}
                />
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(34,211,238,0.08))', border: '1px solid rgba(14,165,233,0.2)' }}>
                  <Upload size={22} className="text-cyan-400" />
                </div>
              </div>
              <p className="text-sm text-slate-300 mb-1 font-medium">
                Drag & Drop or <span className="text-cyan-400">Click to Upload</span>
              </p>
              <p className="text-[10px] text-slate-600 mb-3">Supported: JPG · PNG · WebP</p>
              <div className="px-4 py-1.5 rounded-lg text-xs font-medium text-cyan-300"
                style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(34,211,238,0.06))', border: '1px solid rgba(14,165,233,0.2)' }}>
                <Image size={12} className="inline mr-1.5" />
                Browse Files
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onInput} />
    </div>
  )
}
