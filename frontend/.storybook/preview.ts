import type { Preview } from '@storybook/nextjs-vite'
import { MINIMAL_VIEWPORTS } from 'storybook/viewport'
import { withCatalog } from './catalog'
import { redirectRetiredStory } from './story-links'
import '../app/globals.css'
import '../components/hud/hud-type.css'

redirectRetiredStory()

const preview: Preview = {
  decorators: [withCatalog],
  parameters: {
    options: { storySort: { order: ['Foundations', ['Typography', 'Controls', 'Cards', 'Workspace', 'Icons', 'Object thumbnails', 'Progress', 'Forms', 'Graphics'], 'Tasks', ['Objects', 'Travel', 'Fleet status'], 'Graphics', 'Audio'] } },
    layout: 'fullscreen',
    viewport: { options: { ...MINIMAL_VIEWPORTS, phoneFit: {
      name: 'Phone · fit canvas', type: 'mobile',
      styles: { width: '414px', height: '100%' },
    } } },
    controls: { expanded: true },
    a11y: { test: 'error' },
  },
}

export default preview
