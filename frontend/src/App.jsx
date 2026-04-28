import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ToastProvider } from './components/ToastContext'
import Landing from './pages/Landing'
import CustomCursor from './components/CustomCursor'

const Dashboard = lazy(() => import('./pages/Dashboard'))

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #020a18 0%, #0a1628 40%, #060a14 100%)' }}>
      <div className="text-center">
        <div className="water-wave-loader mx-auto mb-6" />
        <p className="text-sm text-slate-500 font-medium tracking-wide">Loading AquaScan...</p>
      </div>
    </div>
  )
}

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3, ease: 'easeIn' } },
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <Landing />
          </motion.div>
        } />
        <Route path="/scan" element={
          <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <Dashboard />
          </motion.div>
        } />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <CustomCursor />
        <Suspense fallback={<LoadingFallback />}>
          <AnimatedRoutes />
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  )
}
