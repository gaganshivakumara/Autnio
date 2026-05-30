/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false, // preserve existing CSS resets and design tokens
  },
  theme: {
    extend: {
      rotate: {
        '60': '60deg',
        '70': '70deg',
      },
      brightness: {
        '130': '1.3',
        '135': '1.35',
        '140': '1.4',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      transitionDuration: {
        '2000': '2000ms',
        '4000': '4000ms',
      },
    },
  },
  plugins: [],
};
