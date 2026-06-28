/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1a2235',
          900: '#0f172a',
        }
      }
    },
  },
  plugins: [],
};
