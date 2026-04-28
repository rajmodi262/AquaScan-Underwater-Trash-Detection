import { motion } from 'framer-motion'
import { AlertTriangle, Grid3X3, Activity, Zap, Target } from 'lucide-react'

export default function StatsCards({ summary }) {
  if (!summary) return null

  const stats = [
    {
      label: 'Debris Density',
      value: `${summary.trash_density_pct}%`,
      color: summary.trash_density_pct > 30 ? 'text-red-400' : summary.trash_density_pct > 10 ? 'text-amber-400' : 'text-emerald-400',
      iconColor: summary.trash_density_pct > 30 ? 'text-red-400/60' : 'text-emerald-400/60',
      icon: AlertTriangle,
      bar: summary.trash_density_pct,
      barColor: summary.trash_density_pct > 30 ? 'from-red-500 to-orange-500' : summary.trash_density_pct > 10 ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-teal-500',
      borderGlow: summary.trash_density_pct > 30 ? 'hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]',
    },
    {
      label: 'Cells Flagged',
      value: `${summary.trash_cells} / ${summary.total_cells}`,
      color: 'text-sky-400',
      iconColor: 'text-sky-400/60',
      icon: Grid3X3,
      bar: summary.total_cells > 0 ? (summary.trash_cells / summary.total_cells) * 100 : 0,
      barColor: 'from-sky-500 to-blue-500',
      borderGlow: 'hover:border-sky-500/30 hover:shadow-[0_0_20px_rgba(14,165,233,0.1)]',
    },
    {
      label: 'Avg Anomaly',
      value: `${(summary.avg_anomaly_score * 100).toFixed(1)}%`,
      color: 'text-cyan-400',
      iconColor: 'text-cyan-400/60',
      icon: Activity,
      bar: summary.avg_anomaly_score * 100,
      barColor: 'from-cyan-500 to-teal-500',
      borderGlow: 'hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]',
    },
    {
      label: 'Processing',
      value: `${summary.processing_time_ms}ms`,
      color: 'text-purple-400',
      iconColor: 'text-purple-400/60',
      icon: Zap,
      bar: Math.min(summary.processing_time_ms / 50, 100),
      barColor: 'from-purple-500 to-violet-500',
      borderGlow: 'hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]',
    },
    {
      label: 'Objects Found',
      value: `${summary.objects_detected ?? 0}`,
      color: 'text-teal-400',
      iconColor: 'text-teal-400/60',
      icon: Target,
      bar: Math.min((summary.objects_detected ?? 0) * 10, 100),
      barColor: 'from-teal-500 to-emerald-500',
      borderGlow: 'hover:border-teal-500/30 hover:shadow-[0_0_20px_rgba(20,184,166,0.1)]',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" role="region" aria-label="Analysis statistics">
      {stats.map((s, i) => {
        const Icon = s.icon
        return (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 + 0.2, duration: 0.5, ease: 'easeOut' }}
            className={`glass-card p-4 transition-all duration-500 ${s.borderGlow}`}
            role="status"
            aria-label={`${s.label}: ${s.value}`}
          >
            <div className="flex items-center justify-between mb-2">
              <Icon size={14} className={s.iconColor} />
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
                {s.label}
              </span>
            </div>
            <div className={`text-xl font-bold ${s.color} mb-2.5`}>{s.value}</div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${s.bar}%` }}
                transition={{ duration: 0.8, delay: i * 0.08 + 0.4, ease: 'easeOut' }}
                className={`h-full rounded-full bg-gradient-to-r ${s.barColor} opacity-70`}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
