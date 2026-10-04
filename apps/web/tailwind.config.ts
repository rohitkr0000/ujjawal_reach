import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      colors: {
        ujjwalBlue: '#1e3a8a',
        ujjwalDark: '#0f172a',
        saffron: '#ea580c',
        saffronLight: '#ffedd5',
        saffronAccent: '#f97316',
      },
    },
  },
  plugins: [],
};

export default config;
