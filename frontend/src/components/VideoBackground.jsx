import { useRef, useEffect, useState } from 'react'

/**
 * VideoBackground — Full-screen looping underwater video background
 * with gradient overlays for text readability and cinematic depth.
 * Replaces Three.js OceanScene on the landing page for better
 * performance and photorealistic visuals.
 */
export default function VideoBackground() {
  const videoRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = 0.75 // Slow-mo for cinematic feel
    const handleLoaded = () => setLoaded(true)
    v.addEventListener('canplaythrough', handleLoaded)
    return () => v.removeEventListener('canplaythrough', handleLoaded)
  }, [])

  return (
    <div className="video-bg" aria-hidden="true">
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className={`video-bg__video ${loaded ? 'video-bg__video--loaded' : ''}`}
      >
        <source src="/videos/underwater-hero.mp4" type="video/mp4" />
      </video>

      {/* Top vignette — darkens the top for navbar readability */}
      <div className="video-bg__overlay video-bg__overlay--top" />

      {/* Center radial glow — subtle light focus on hero text */}
      <div className="video-bg__overlay video-bg__overlay--center" />

      {/* Bottom fade — darkens bottom for scroll transition */}
      <div className="video-bg__overlay video-bg__overlay--bottom" />

      {/* Overall color grade — adds deep ocean blue tint */}
      <div className="video-bg__overlay video-bg__overlay--grade" />
    </div>
  )
}
