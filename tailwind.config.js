/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Final system ────────────────────────────────────────────────────
        // Bright slate canvas (#F8FAFC → #E2E8F0), pewter #5C7E8F actions,
        // and the #334155 → #0F172A slate gradient as the signature accent
        // (frames, bars, the scrolled header). Text on the slate scale for
        // production-grade contrast.
        navy: {
          DEFAULT: '#5C7E8F',
          deep:    '#46697A',
          soft:    '#6E8FA0',
          // Legacy aliases kept so existing classes continue to work.
          dark:    '#334155',
          mid:     '#4A6B7C',
          light:   '#E2E8F0',
        },
        // Gold is back as the warm contrast voice: date kickers, ratings,
        // accent bars, and small moments of celebration.
        gold: {
          DEFAULT: '#E3B23C',
          dark:    '#B8892D',
          soft:    '#FBF3DF',
          light:   '#FDF8EC',
        },
        paper: '#FFFFFF',
        cloud: '#F8FAFC',
        surface: { soft: '#F1F5F9', muted: '#E2E8F0', border: 'rgba(51,65,85,0.14)' },
        ink: { DEFAULT: '#0F172A', muted: '#475569', subtle: '#94A3B8' },
      },
      fontFamily: { sans: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      borderRadius: { pill: '999px' },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.07)',
        modal: '0 24px 64px rgba(15,23,42,.20)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: { 'fade-up': 'fadeUp .25s ease both' },
    },
  },
  plugins: [],
};
