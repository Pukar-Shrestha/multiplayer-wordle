/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        wordle: {
          green:  '#538d4e',
          orange: '#f5793a',
          gray:   '#3a3a3c',
          dark:   '#121213',
          surface: '#1a1a1b',
          border: '#3a3a3c',
          'border-filled': '#565758',
          text:   '#ffffff',
          'text-muted': '#818384',
        },
      },
      fontFamily: {
        wordle: ['"Clear Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      animation: {
        'flip-in':   'flipIn  0.25s ease-in  forwards',
        'flip-out':  'flipOut 0.25s ease-out forwards',
        'bounce-in': 'bounceIn 0.1s ease-in-out',
        shake:       'shake 0.5s ease-in-out',
        pop:         'pop 0.1s ease-in-out',
        'fade-in':   'fadeIn 0.3s ease-in-out',
        'slide-up':  'slideUp 0.3s ease-out',
      },
      keyframes: {
        flipIn: {
          '0%':   { transform: 'rotateX(0deg)' },
          '100%': { transform: 'rotateX(-90deg)' },
        },
        flipOut: {
          '0%':   { transform: 'rotateX(-90deg)' },
          '100%': { transform: 'rotateX(0deg)' },
        },
        bounceIn: {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%':               { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%':      { transform: 'translateX(4px)' },
        },
        pop: {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
