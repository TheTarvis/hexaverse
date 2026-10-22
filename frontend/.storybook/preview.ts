import type { Preview } from '@storybook/nextjs-vite'
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
    controls: { expanded: true },
    a11y: { test: 'error' },
  },
}

export default preview
