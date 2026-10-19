import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AmbientAudition } from './AmbientAudition'
import { AmbientMusicReferences } from './AmbientMusicReferences'
import { LocalMusicAudition } from './LocalMusicAudition'

const meta = {
  title: 'Audio/Ambience',
  component: AmbientAudition,
  decorators: [Story => <div className="dark" style={{ colorScheme: 'dark' }}><Story /></div>],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AmbientAudition>

export default meta
type Story = StoryObj<typeof meta>

export const Round01: Story = { name: 'Round 01 — broad directions' }
export const Round02: Story = {
  name: 'Round 02 — music & ambience references',
  render: () => <AmbientMusicReferences />,
}
export const Round03: Story = {
  name: 'Round 03 — downloadable shortlist',
  render: () => <LocalMusicAudition />,
}
