/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        '--btn-background': 'hsl(var(--btn-background))',
        '--btn-background-hover': 'hsl(var(--btn-background-hover))',
        '--btn-foreground': 'hsl(var(--btn-foreground))',
        '--btn-border': 'hsl(var(--btn-border))',
      },
      spacing: {
        '--spacing': 'var(--spacing)',
      },
      borderRadius: {
        '--radius-lg': 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
} 