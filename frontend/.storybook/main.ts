import type { StorybookConfig } from '@storybook/nextjs-vite'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../public', { from: '../../docs', to: '/project-docs' }],
  // Storybook copies staticDirs; Vite must not race a second public/ copy.
  viteFinal: async config => ({
    ...config,
    ...(process.env.PHONE_PREVIEW_STORYBOOK === 'true' ? { base: '/storybook/' } : {}),
    build: { ...config.build, copyPublicDir: false },
  }),
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
}

export default config
