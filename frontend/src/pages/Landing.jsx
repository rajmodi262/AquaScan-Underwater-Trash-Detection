import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import {
  Waves, ScanSearch, BarChart3, Upload, Zap, Grid3X3, Target,
  ShieldCheck, ArrowRight, Play, ChevronDown, Droplets, Fish,
  Anchor, Globe, AlertTriangle
} from 'lucide-react'
import VideoBackground from '../components/VideoBackground'
import CursorLight from '../components/CursorLight'
import AnimatedCounter from '../components/AnimatedCounter'

/* ── Feature cards data ──────────────────────────────── */
const features = [
  {
    icon: Upload,
    title: 'Smart Upload',
    desc: 'Drag & drop underwater images or choose built-in samples. Supports JPEG, PNG, and WebP formats.',
    color: 'from-sky-500 to-cyan-400',
    step: '01',
  },
  {
    icon: ScanSearch,
    title: 'Multi-Pass Analysis',
    desc: 'Grid-based detection with edge, shape, color, texture & frequency anomaly scanning.',
    color: 'from-cyan-500 to-teal-400',
    step: '02',
  },
  {
    icon: BarChart3,
    title: 'Visual Insights',
    desc: 'Interactive heatmaps, z-score breakdowns, comparison sliders & exportable reports.',
    color: 'from-teal-500 to-emerald-400',
    step: '03',
  },
]

/* ── Impact stats ────────────────────────────────────── */
const impactStats = [
  { icon: Globe, value: 71, suffix: '%', label: 'of Earth is Ocean', color: '#0ea5e9' },
  { icon: AlertTriangle, value: 8, suffix: 'M+', label: 'Tons Plastic / Year', color: '#f59e0b' },
  { icon: Fish, value: 700, suffix: '+', label: 'Species Affected', color: '#ef4444' },
  { icon: Droplets, value: 80, suffix: '%', label: 'Ocean Pollution from Land', color: '#22d3ee' },
]

/* ── Tech stats ──────────────────────────────────────── */
const techStats = [
  { icon: ShieldCheck, value: '6', label: 'Detection Checks', color: 'text-sky-400' },
  { icon: Zap, value: 'Adaptive', label: 'Z-Score Scoring', color: 'text-cyan-400' },
  { icon: Grid3X3, value: 'Multi-Scale', label: 'Grid Analysis', color: 'text-teal-400' },
  { icon: Target, value: 'Object', label: 'Detection', color: 'text-purple-400' },
]

/* ── Animation variants ──────────────────────────────── */
const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
}
const fadeUp = {
  hidden: { y: 50, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] } },
}
const scaleIn = {
  hidden: { scale: 0.85, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.7, ease: 'easeOut' } },
}

export default function Landing() {
  const nav = useNavigate()
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll()

  // Parallax transforms
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -120])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.92])

  return (
    <div className="landing-root">
      {/* ── Video Background ──────────────────────────── */}
      <VideoBackground />
      <CursorLight />

      {/* ── Navigation ────────────────────────────────── */}
      <motion.nav
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="landing-nav"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="landing-nav__brand">
          <span className="landing-nav__title">
            AQUA<span className="landing-nav__accent">SCAN</span>
          </span>
        </div>
        <button onClick={() => nav('/scan')} className="btn-ghost text-sm ripple landing-nav__cta"
          aria-label="Launch the scanner application">
          Launch App <ArrowRight size={14} />
        </button>
      </motion.nav>

      {/* ═══════════════════════════════════════════════════
          SECTION 1 — HERO (Full viewport, parallax)
      ═══════════════════════════════════════════════════ */}
      <section ref={heroRef} className="landing-hero" role="banner">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
          className="landing-hero__content"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="landing-hero__badge"
          >
            <span className="landing-hero__badge-dot" />
            Computer Vision Powered • Marine Intelligence
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="landing-hero__title"
          >
            <span className="landing-hero__title-line">Explore.</span>
            <span className="landing-hero__title-line landing-hero__title-line--delay1">Detect.</span>
            <span className="landing-hero__title-line landing-hero__title-line--delay2">Protect.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
            className="landing-hero__subtitle"
          >
            AI-powered underwater debris detection using adaptive grid analysis,
            anomaly scoring, and intelligent visual reports.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 1.1, type: 'spring', stiffness: 200 }}
            className="landing-hero__actions"
          >
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(14,165,233,0.5)' }}
              whileTap={{ scale: 0.96 }}
              onClick={() => nav('/scan')}
              className="btn-primary landing-hero__btn-launch"
              id="launch-scanner-btn"
              aria-label="Launch the underwater debris scanner"
            >
              <ScanSearch size={20} />
              Launch Scanner
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => nav('/scan')}
              className="btn-secondary landing-hero__btn-demo"
              id="explore-demo-btn"
              aria-label="Explore a demo scan"
            >
              <Play size={18} />
              Explore Demo
            </motion.button>
          </motion.div>

          {/* Tech Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.8 }}
            className="landing-hero__stats"
          >
            {techStats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 + i * 0.1 }}
                className="landing-hero__stat"
              >
                <s.icon size={18} className={`${s.color} landing-hero__stat-icon`} />
                <div className="landing-hero__stat-value">{s.value}</div>
                <div className="landing-hero__stat-label">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="landing-hero__scroll-hint"
        >
          <span>Dive Deeper</span>
          <div className="landing-hero__scroll-arrow">
            <ChevronDown size={20} />
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
          SECTION 2 — THE PROBLEM (Impact Stats)
      ═══════════════════════════════════════════════════ */}
      <section className="landing-impact" aria-label="Ocean pollution statistics">
        <div className="landing-impact__inner">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="landing-impact__header"
          >
            <h2 className="landing-impact__title">
              The Ocean Needs <span className="gradient-text">Our Help</span>
            </h2>
            <p className="landing-impact__desc">
              Every year, millions of tons of plastic enter our oceans — threatening marine life,
              ecosystems, and human health. AquaScan uses computer vision to fight back.
            </p>
          </motion.div>

          <motion.div
            className="landing-impact__grid"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {impactStats.map((s) => (
              <motion.div
                key={s.label}
                variants={fadeUp}
                className="landing-impact__card"
              >
                <div className="landing-impact__card-icon" style={{ color: s.color }}>
                  <s.icon size={28} />
                </div>
                <div className="landing-impact__card-value" style={{ color: s.color }}>
                  <AnimatedCounter end={s.value} suffix={s.suffix} duration={2200} />
                </div>
                <div className="landing-impact__card-label">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          SECTION 3 — HOW IT WORKS (Features)
      ═══════════════════════════════════════════════════ */}
      <section className="landing-features" aria-label="How it works">
        <div className="landing-features__inner">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="landing-features__header"
          >
            <h2 className="landing-features__title">How It Works</h2>
            <p className="landing-features__desc">
              Three simple steps to detect underwater debris with computer vision intelligence.
            </p>
          </motion.div>

          <motion.div
            className="landing-features__grid"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                className="landing-feature-card"
              >
                <div className="landing-feature-card__step">{f.step}</div>
                <div className={`landing-feature-card__icon bg-gradient-to-br ${f.color}`}>
                  <f.icon size={24} className="text-white" />
                </div>
                <h3 className="landing-feature-card__title">{f.title}</h3>
                <p className="landing-feature-card__desc">{f.desc}</p>
                <div className="landing-feature-card__link">
                  <span>Learn more</span>
                  <ArrowRight size={14} />
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Big CTA */}
          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="landing-features__cta"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => nav('/scan')}
              className="btn-primary landing-features__cta-btn"
            >
              <Anchor size={20} />
              Start Scanning Now
              <ArrowRight size={18} />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <Waves size={16} />
            <span>AquaScan AI</span>
          </div>
          <p className="landing-footer__copy">
            Powered by OpenCV Computer Vision • Adaptive Z-Score Detection
          </p>
        </div>
      </footer>
    </div>
  )
}
