import { useEffect, useState } from 'react';

const CursorFish = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30" className="text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" style={{ transform: 'rotate(-45deg)' }}>
    <path d="M11 20C11 20 8 18 5 18C2 18 1 20 1 20C1 20 2 17 2 14C2 11 1 8 1 8C1 8 2 10 5 10C8 10 11 8 11 8C11 8 15 8 19 11C21 12.5 23 13.5 24 14C23 14.5 21 15.5 19 17C15 20 11 20 11 20ZM17 13C16.4477 13 16 13.4477 16 14C16 14.5523 16.4477 15 17 15C17.5523 15 18 14.5523 18 14C18 13.4477 17.5523 13 17 13Z" />
  </svg>
);

const CursorJellyfish = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" className="text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.8)]" style={{ transform: 'rotate(-45deg)' }}>
    <path d="M12 2C6.48 2 2 6.48 2 12H22C22 6.48 17.52 2 12 2ZM5 13C5 15 6 17 6 19C6 21 4 22 4 22C4 22 8 22 9 19C10 16 9 14 9 14M12 13C12 15 13 18 13 20C13 22 11 23 11 23C11 23 15 23 16 20C17 17 16 14 16 14M19 13C19 15 18 17 18 19C18 21 20 22 20 22C20 22 16 22 15 19C14 16 15 14 15 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M12 2C6.48 2 2 6.48 2 12H22C22 6.48 17.52 2 12 2Z" fill="currentColor" opacity="0.6"/>
  </svg>
);

const CursorStarfish = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" className="text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]" style={{ transform: 'rotate(-45deg)' }}>
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
);

const icons = [CursorFish, CursorJellyfish, CursorStarfish];

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [clicked, setClicked] = useState(false);
  const [iconIndex, setIconIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      const target = e.target;
      if (
        target.tagName.toLowerCase() === 'button' ||
        target.tagName.toLowerCase() === 'a' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('cursor-pointer') ||
        window.getComputedStyle(target).cursor === 'pointer'
      ) {
        setHovering(true);
      } else {
        setHovering(false);
      }
    };

    const handleMouseDown = () => {
      setClicked(true);
      setIconIndex((prev) => (prev + 1) % icons.length);
    };
    
    const handleMouseUp = () => {
      setClicked(false);
    };

    // Inject global CSS to hide the default cursor everywhere
    document.documentElement.style.cursor = 'none';
    const style = document.createElement('style');
    style.id = 'custom-cursor-style';
    style.innerHTML = `
      * { cursor: none !important; }
      body { cursor: none !important; }
    `;
    document.head.appendChild(style);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      const injectedStyle = document.getElementById('custom-cursor-style');
      if (injectedStyle) {
        document.head.removeChild(injectedStyle);
      }
      document.documentElement.style.cursor = 'auto';
    };
  }, []);

  const Icon = icons[iconIndex];

  return (
    <div
      className="fixed pointer-events-none z-[9999] flex items-center justify-center transition-transform duration-75"
      style={{
        left: position.x,
        top: position.y,
        // Small offset to align the tip of the icon with the actual mouse coordinate
        transform: `translate(-2px, -2px) scale(${clicked ? 0.8 : hovering ? 1.3 : 1})`,
        transformOrigin: 'top left'
      }}
    >
      <div className="relative">
        <Icon />
        {hovering && (
          <div className="absolute inset-0 rounded-full animate-ping opacity-40 bg-white" style={{ width: '100%', height: '100%' }} />
        )}
      </div>
    </div>
  );
}
