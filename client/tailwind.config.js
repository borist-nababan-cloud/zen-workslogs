/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zen: {
          matcha: '#889D35',
          moss: '#6E8027',
          sand: '#D2C0A7',
          linen: '#F8F5F1',
          charcoal: '#3C3C32',
        },
        primary: {
          50: '#f5f7ec',
          100: '#e8edd4',
          200: '#d2ddad',
          300: '#b4c67c',
          400: '#98b051',
          500: '#889D35',
          600: '#6E8027',
          700: '#56641f',
          800: '#45501c',
          900: '#3b441b',
        },
      },
    },
  },
  plugins: [],
};
