import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  define: { global: 'globalThis' },
  plugins: [storybookTest({ configDir: path.join(directory, '.storybook'), tags: { include: ['catalog'] } })],
  test: {
    name: 'storybook',
    fileParallelism: false,
    maxWorkers: 2,
    exclude: ['**/node_modules/**', 'components/audio/**'],
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [
        { browser: 'chromium', name: 'desktop', viewport: { width: 1440, height: 960 } },
        { browser: 'chromium', name: 'phone', viewport: { width: 390, height: 844 } },
      ],
    },
    setupFiles: ['.storybook/vitest.setup.ts'],
    testTimeout: 20000,
  },
})
