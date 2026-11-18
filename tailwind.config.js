/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#090B16',
        panel: '#10132A',
        panel2: '#161A36',
        line: '#262B52',
        ink: '#E6E8F5',
        dim: '#9AA0C3',
        violet: { DEFAULT: '#9B6BFF', soft: '#7C4DFF' },
        volt: { DEFAULT: '#3DA9FF', soft: '#2A7BFF' },
        ok: '#3DDC97',
        warn: '#FFB547',
        bad: '#FF5C7A',
        ember: { DEFAULT: '#FF2D55', deep: '#B5122F', glow: '#FF6B81' },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        // 2010-era UI face (Segoe UI / Helvetica Neue), available offline on most systems
        display: ['"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(155,107,255,.35), 0 0 24px -6px rgba(155,107,255,.45)',
        volt: '0 0 0 1px rgba(61,169,255,.35), 0 0 24px -6px rgba(61,169,255,.45)',
        ember: '0 0 0 1px rgba(255,45,85,.55), 0 0 36px -4px rgba(255,45,85,.65)',
      },
      keyframes: {
        fadein: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        neon: {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(61,169,255,.45), 0 0 26px -4px rgba(61,169,255,.55), 0 0 60px -20px rgba(155,107,255,.7)' },
          '50%': { boxShadow: '0 0 0 1px rgba(61,169,255,.8), 0 0 44px 0 rgba(61,169,255,.7), 0 0 90px -10px rgba(155,107,255,.85)' },
        },
        flicker: { '0%, 18%, 22%, 25%, 53%, 57%, 100%': { opacity: '1' }, '20%, 24%, 55%': { opacity: '.55' } },
        nudge: { '0%, 100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(12px)' } },
        nudgeY: { '0%, 100%': { transform: 'translateY(0) rotate(90deg)' }, '50%': { transform: 'translateY(10px) rotate(90deg)' } },
      },
      animation: { neon: 'neon 2.4s ease-in-out infinite', flicker: 'flicker 6s linear infinite', fadein: 'fadein .25s ease-out', nudge: 'nudge 1.1s ease-in-out infinite', nudgeY: 'nudgeY 1.1s ease-in-out infinite' },
    },
  },
  plugins: [],
};
