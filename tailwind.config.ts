import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        jsb: {
          navy: '#1a1f2e',
          'navy-light': '#242b3d',
          'navy-lighter': '#2d3548',
          pink: '#e91e8d',
          'pink-hover': '#d11a7f',
          blue: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
}

export default config
