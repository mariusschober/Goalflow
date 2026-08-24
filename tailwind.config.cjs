module.exports = {
  content: ['./index.html', './*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './services/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], heading: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], handwriting: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: { goalflow: { background: '#F7F8FA', text: '#111827', secondary: '#667085', border: '#E4E7EC', primary: '#4F46E5' } },
      animation: { fadeIn: 'fadeIn .2s ease-out', slideIn: 'slideIn .2s ease-out', scaleIn: 'scaleIn .15s ease-out', breathe: 'breathe 6s ease-in-out infinite' },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideIn: { from: { transform: 'translateX(12px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        scaleIn: { from: { transform: 'scale(.98)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        breathe: { '0%,100%': { opacity: '.5' }, '50%': { opacity: '1' } }
      }
    }
  },
  plugins: []
};
