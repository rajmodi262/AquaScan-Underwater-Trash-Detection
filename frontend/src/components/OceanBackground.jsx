import { useMemo, useEffect, useRef } from 'react'

const FishIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" className="opacity-40 text-sky-300 drop-shadow-md">
    <path d="M11 20C11 20 8 18 5 18C2 18 1 20 1 20C1 20 2 17 2 14C2 11 1 8 1 8C1 8 2 10 5 10C8 10 11 8 11 8C11 8 15 8 19 11C21 12.5 23 13.5 24 14C23 14.5 21 15.5 19 17C15 20 11 20 11 20ZM17 13C16.4477 13 16 13.4477 16 14C16 14.5523 16.4477 15 17 15C17.5523 15 18 14.5523 18 14C18 13.4477 17.5523 13 17 13Z" />
  </svg>
);

const JellyfishIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" className="opacity-30 text-teal-200 drop-shadow-md">
    <path d="M12 2C6.48 2 2 6.48 2 12H22C22 6.48 17.52 2 12 2ZM5 13C5 15 6 17 6 19C6 21 4 22 4 22C4 22 8 22 9 19C10 16 9 14 9 14M12 13C12 15 13 18 13 20C13 22 11 23 11 23C11 23 15 23 16 20C17 17 16 14 16 14M19 13C19 15 18 17 18 19C18 21 20 22 20 22C20 22 16 22 15 19C14 16 15 14 15 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M12 2C6.48 2 2 6.48 2 12H22C22 6.48 17.52 2 12 2Z" fill="currentColor" opacity="0.6"/>
  </svg>
);

/**
 * OceanBackground — Lightweight CSS-only animated ocean background for the Dashboard.
 * Includes interactive marine life that follows and reacts to the cursor.
 */
export default function OceanBackground() {
  const bubbles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      size: 4 + Math.random() * 12,
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 10,
      opacity: 0.08 + Math.random() * 0.15,
    })), [])

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 2 + Math.random() * 3,
      duration: 10 + Math.random() * 15,
      delay: Math.random() * 10,
    })), [])

  const speciesList = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i,
    type: Math.random() > 0.7 ? 'jellyfish' : 'fish',
  })), [])

  const fishRefs = useRef([]);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Initialize physical properties for species
    const physicsData = speciesList.map(s => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: 0,
      vy: 0,
      offsetX: (Math.random() - 0.5) * 400,
      offsetY: (Math.random() - 0.5) * 400,
      wanderAngle: Math.random() * Math.PI * 2,
      scale: 0.4 + Math.random() * 0.6,
      type: s.type
    }));

    let animationFrameId;

    const update = () => {
      physicsData.forEach((entity, i) => {
        const dx = mouseX - entity.x;
        const dy = mouseY - entity.y;
        const distanceToMouse = Math.sqrt(dx * dx + dy * dy);

        if (entity.type === 'fish') {
          // Fish follow cursor loosely (schooling behavior)
          const targetX = mouseX + entity.offsetX;
          const targetY = mouseY + entity.offsetY;
          
          const tdx = targetX - entity.x;
          const tdy = targetY - entity.y;
          const tDist = Math.sqrt(tdx * tdx + tdy * tdy);

          const maxSpeed = 2.5 * entity.scale;
          const maxForce = 0.05;

          let desiredVx = 0;
          let desiredVy = 0;

          if (tDist > 0) {
            desiredVx = (tdx / tDist) * maxSpeed;
            desiredVy = (tdy / tDist) * maxSpeed;
          }

          let steerX = desiredVx - entity.vx;
          let steerY = desiredVy - entity.vy;

          entity.vx += steerX * maxForce;
          entity.vy += steerY * maxForce;

          // Wandering behavior for organic movement
          entity.wanderAngle += (Math.random() - 0.5) * 0.5;
          entity.vx += Math.cos(entity.wanderAngle) * 0.1;
          entity.vy += Math.sin(entity.wanderAngle) * 0.1;

          // Avoid cursor slightly if too close
          if (distanceToMouse < 100) {
              entity.vx -= (dx / distanceToMouse) * 1.5;
              entity.vy -= (dy / distanceToMouse) * 1.5;
          }

          entity.x += entity.vx;
          entity.y += entity.vy;

          let angle = Math.atan2(entity.vy, entity.vx) * (180 / Math.PI);
          // Flip Y to keep fish upright
          const scaleY = entity.vx < 0 ? -entity.scale : entity.scale;

          if (fishRefs.current[i]) {
            fishRefs.current[i].style.transform = `translate(${entity.x}px, ${entity.y}px) rotate(${angle}deg) scale(${entity.scale}, ${scaleY})`;
          }
        } else {
          // Jellyfish logic: slowly float up, pushed away vigorously by cursor
          entity.y -= 0.3 * entity.scale;
          
          // Wrap around screen
          if (entity.y < -50) {
              entity.y = window.innerHeight + 50;
              entity.x = Math.random() * window.innerWidth;
          }
          
          // Flee cursor
          if (distanceToMouse < 200 && distanceToMouse > 0) {
              entity.x -= (dx / distanceToMouse) * 3;
              entity.y -= (dy / distanceToMouse) * 3;
          }
          
          // Gentle wiggle
          entity.x += Math.sin(Date.now() * 0.001 + i) * 0.3;

          // Slight rotation based on horizontal movement
          const angle = Math.sin(Date.now() * 0.002 + i) * 10 - (dx / Math.max(distanceToMouse, 1)) * (distanceToMouse < 200 ? 20 : 0);

          if (fishRefs.current[i]) {
            fishRefs.current[i].style.transform = `translate(${entity.x}px, ${entity.y}px) rotate(${angle}deg) scale(${entity.scale})`;
          }
        }
      });
      animationFrameId = requestAnimationFrame(update);
    };

    update();
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [speciesList]);

  return (
    <div className="ocean-bg overflow-hidden" aria-hidden="true">
      {/* Interactive Species */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {speciesList.map((species, i) => (
          <div
            key={`species-${species.id}`}
            ref={el => fishRefs.current[i] = el}
            className="absolute top-0 left-0"
            style={{ 
              width: '32px', 
              height: '32px', 
              willChange: 'transform',
              transformOrigin: 'center center'
            }}
          >
            {species.type === 'fish' ? <FishIcon /> : <JellyfishIcon />}
          </div>
        ))}
      </div>

      {/* Light rays */}
      <div className="light-ray" style={{ left: '10%', animationDelay: '0s', width: '100px', opacity: 0.06 }} />
      <div className="light-ray" style={{ left: '30%', animationDelay: '-3s', width: '140px', opacity: 0.04 }} />
      <div className="light-ray" style={{ left: '55%', animationDelay: '-5s', width: '90px', opacity: 0.05 }} />
      <div className="light-ray" style={{ left: '75%', animationDelay: '-2s', width: '110px', opacity: 0.07 }} />
      <div className="light-ray" style={{ left: '90%', animationDelay: '-7s', width: '80px', opacity: 0.03 }} />

      {/* Bubbles */}
      {bubbles.map(b => (
        <div key={b.id} className="bubble" style={{
          left: b.left,
          width: b.size,
          height: b.size,
          opacity: b.opacity,
          animation: `bubbleRise ${b.duration}s ease-in ${b.delay}s infinite`,
        }} />
      ))}

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          left: p.left,
          top: p.top,
          width: p.size,
          height: p.size,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
        }} />
      ))}

      {/* Coral silhouettes — left */}
      <svg className="coral-silhouette" style={{ left: 0, width: '200px', height: '120px' }} viewBox="0 0 200 120">
        <path d="M0 120 Q20 80 30 90 Q40 60 50 75 Q60 40 70 65 Q80 50 90 70 Q95 30 105 60 Q110 55 120 80 Q130 70 140 90 Q150 60 160 85 L200 120Z"
          fill="currentColor" className="text-sky-900" />
      </svg>

      {/* Coral silhouettes — right */}
      <svg className="coral-silhouette" style={{ right: 0, width: '180px', height: '100px' }} viewBox="0 0 180 100">
        <path d="M0 100 Q10 70 25 80 Q35 50 45 70 Q55 35 65 60 Q75 45 85 65 Q95 30 110 55 Q120 50 135 75 Q145 60 155 80 L180 100Z"
          fill="currentColor" className="text-sky-900" />
      </svg>

      {/* Gradient overlay for content readability */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 30%, transparent 0%, rgba(2,6,23,0.4) 70%, rgba(2,6,23,0.7) 100%)',
      }} />
    </div>
  )
}
