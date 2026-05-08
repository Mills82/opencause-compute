import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1324',
        slate: '#141f37',
        line: '#25314d',
        accent: '#43c4a6'
      }
    }
  },
  plugins: []
} satisfies Config;
