/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Add your custom colors here if needed
      },
    },
  },
  plugins: [
    // Add a plugin to support the CSS variable features from Tailwind v4
    function({ addBase }) {
      addBase({
        ':root': {
          '--radius-lg': '0.5rem',
          '--spacing-1': '0.25rem',
          '--spacing-1.5': '0.375rem',
          '--spacing-2': '0.5rem',
          '--spacing-2.5': '0.625rem',
          '--spacing-3': '0.75rem',
          '--spacing-3.5': '0.875rem',
          '--color-white': '#ffffff',
          '--color-zinc-300': 'rgb(212 212 216)',
          '--color-zinc-400': 'rgb(161 161 170)',
          '--color-zinc-500': 'rgb(113 113 122)',
          '--color-zinc-600': 'rgb(82 82 91)',
          '--color-zinc-700': 'rgb(63 63 70)',
          '--color-zinc-800': 'rgb(39 39 42)',
          '--color-zinc-900': 'rgb(24 24 27)',
          '--color-zinc-950': 'rgb(9 9 11)',
          '--color-blue-300': 'rgb(147 197 253)',
          '--color-blue-400': 'rgb(96 165 250)',
          '--color-blue-500': 'rgb(59 130 246)',
          '--color-blue-600': 'rgb(37 99 235)',
          '--color-blue-700': 'rgb(29 78 216)',
        }
      });
    }
  ],
}

export default config 