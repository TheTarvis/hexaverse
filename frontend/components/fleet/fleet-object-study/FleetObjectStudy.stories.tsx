import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FleetObjectStudy } from './FleetObjectStudy'

const meta = {
  id: 'hud-fleet-object-review', title: 'Tasks/Objects/Fleet card review', component: FleetObjectStudy, tags: ['catalog'],
  parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'objects', question: 'Objects → Object type: Fleets → category → inspect. Accepted model-first fleet card with Cargo / Actions / Ship stats. Tabs support keyboard and horizontal swipe. Actions default; close/reopen retains tab. Friendly/enemy identities are future disclosure fixtures; Unknown is an unanalyzed burn. Commands open a simulated target picker; choosing a target opens its inspector, without committing an action. Further action handoffs remain under review.' } },
  args: { startAt: 'objects' },
  argTypes: {
    startAt: { control: 'radio', options: ['objects', 'owned-fleet'], description: 'Review entry point; changing it starts a fresh example.' },
  },
} satisfies Meta<typeof FleetObjectStudy>
export default meta
type Story = StoryObj<typeof meta>
export const Browse: Story = {}
export const ModelFirst: Story = { args: { startAt: 'owned-fleet' } }
export const Mobile: Story = { globals: { viewport: { value: 'phoneFit', isRotated: false } } }
