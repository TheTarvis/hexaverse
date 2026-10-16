import type { StorybookConfig } from '@storybook/nextjs-vite'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../public'],
  // Storybook copies staticDirs; Vite must not race a second public/ copy.
  viteFinal: async config => ({ ...config, build: { ...config.build, copyPublicDir: false } }),
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
}

export default config
