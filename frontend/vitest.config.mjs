import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    reporters: [['default', { summary: false }]],
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:9010',
    },
    css: false, // Disable CSS processing for speed (not needed for most tests)
    testTimeout: 10000,
    hookTimeout: 10000,
    exclude: [
      // Default vitest excludes
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Custom excludes
      '**/.next/**',
      '**/.next-e2e/**',
      // Playwright E2E suite — collected by `playwright test`, not Vitest
      '**/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        '*.config.*',
        '**/*.stories.tsx',
        '**/catalyst/**',
        'vitest.setup.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  define: {
    global: 'globalThis',
  },
})