/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    'postcss-functions': {
      functions: {
        // Add a spacing function to handle --spacing() like in Tailwind v4
        'spacing': (value) => {
          return `var(--spacing-${value})`;
        },
        // Allow CSS variables to be used in property values
        'theme': (value) => {
          return `var(--${value})`;
        }
      }
    },
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
