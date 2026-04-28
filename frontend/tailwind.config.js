/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50:  '#e0f2fe',
          100: '#b3e0ff',
          200: '#80ccff',
          300: '#4db8ff',
          400: '#22d3ee',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#061826',
          900: '#020617',
          950: '#010310',
        },
        aqua:    '#22d3ee',
        neon:    '#0ea5e9',
        teal:    '#14b8a6',
        coral:   '#fb7185',
        purple:  '#8b5cf6',
        surface: {
          50:  'rgba(255,255,255,0.03)',
          100: 'rgba(255,255,255,0.05)',
          200: 'rgba(255,255,255,0.08)',
          300: 'rgba(255,255,255,0.12)',
        },
      },
      fontFamily: {
        sans:  ['Outfit', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'float-slow':    'float 8s ease-in-out infinite',
        'float':         'float 6s ease-in-out infinite',
        'float-fast':    'float 4s ease-in-out infinite',
        'glow':          'glow 2s ease-in-out infinite alternate',
        'glow-slow':     'glow 4s ease-in-out infinite alternate',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bubble-rise':   'bubbleRise 8s ease-in infinite',
        'fish-swim':     'fishSwim 20s linear infinite',
        'jelly-float':   'jellyFloat 12s ease-in-out infinite',
        'ray-sway':      'raySway 8s ease-in-out infinite',
        'scan-pulse':    'scanPulse 2s ease-in-out infinite',
        'border-glow':   'borderGlow 3s ease-in-out infinite alternate',
        'shimmer':       'shimmer 6s ease-in-out infinite',
        'wave-ripple':   'waveRipple 3s ease-in-out infinite',
        'spin-slow':     'spin 8s linear infinite',
        'slide-up':      'slideUp 0.5s ease-out',
        'slide-in-right':'slideInRight 0.3s ease-out',
        'fade-in':       'fadeIn 0.5s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(14,165,233,0.2), 0 0 20px rgba(14,165,233,0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(14,165,233,0.4), 0 0 60px rgba(14,165,233,0.2)' },
        },
        bubbleRise: {
          '0%': { transform: 'translateY(100vh) scale(0)', opacity: '0' },
          '10%': { opacity: '0.6' },
          '100%': { transform: 'translateY(-10vh) scale(1)', opacity: '0' },
        },
        fishSwim: {
          '0%': { transform: 'translateX(-100px) scaleX(1)' },
          '49%': { transform: 'translateX(calc(100vw + 100px)) scaleX(1)' },
          '50%': { transform: 'translateX(calc(100vw + 100px)) scaleX(-1)' },
          '99%': { transform: 'translateX(-100px) scaleX(-1)' },
          '100%': { transform: 'translateX(-100px) scaleX(1)' },
        },
        jellyFloat: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-30px) rotate(3deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-2deg)' },
          '75%': { transform: 'translateY(-40px) rotate(2deg)' },
        },
        raySway: {
          '0%, 100%': { transform: 'rotate(-8deg) scaleY(1)', opacity: '0.06' },
          '50%': { transform: 'rotate(-4deg) scaleY(1.05)', opacity: '0.12' },
        },
        scanPulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        borderGlow: {
          '0%': { borderColor: 'rgba(14,165,233,0.15)' },
          '100%': { borderColor: 'rgba(34,211,238,0.4)' },
        },
        shimmer: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        waveRipple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.5' },
          '50%': { transform: 'scale(1.2)', opacity: '0.2' },
          '100%': { transform: 'scale(0.8)', opacity: '0.5' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      boxShadow: {
        'neon-sm':  '0 0 10px rgba(14,165,233,0.2), 0 0 30px rgba(14,165,233,0.1)',
        'neon':     '0 0 20px rgba(14,165,233,0.3), 0 0 60px rgba(14,165,233,0.15)',
        'neon-lg':  '0 0 30px rgba(14,165,233,0.4), 0 0 80px rgba(14,165,233,0.2)',
        'neon-cyan':'0 0 20px rgba(34,211,238,0.3), 0 0 60px rgba(34,211,238,0.15)',
        'neon-teal':'0 0 20px rgba(20,184,166,0.3), 0 0 60px rgba(20,184,166,0.15)',
        'glass':    '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
