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
        // Add your custom colors here if needed
      },
    },
  },
  // Add theme CSS variables for Tailwind v4
  theme: {
    "--radius-lg": "0.5rem",
    "--spacing": {
      "1": "0.25rem",
      "1.5": "0.375rem",
      "2": "0.5rem",
      "2.5": "0.625rem",
      "3": "0.75rem",
      "3.5": "0.875rem",
    },
    "--color": {
      "white": "#ffffff",
      "zinc": {
        "300": "rgb(212 212 216)",
        "400": "rgb(161 161 170)",
        "500": "rgb(113 113 122)",
        "600": "rgb(82 82 91)",
        "700": "rgb(63 63 70)",
        "800": "rgb(39 39 42)",
        "900": "rgb(24 24 27)",
        "950": "rgb(9 9 11)"
      },
      "blue": {
        "300": "rgb(147 197 253)",
        "400": "rgb(96 165 250)",
        "500": "rgb(59 130 246)",
        "600": "rgb(37 99 235)",
        "700": "rgb(29 78 216)"
      }
    }
  }
} 