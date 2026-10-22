import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MiningPlacementStudy } from './MiningPlacementStudy'

const meta = {
  id: 'hud-mining-review', title: 'Tasks/Mining/Review', tags: ['catalog'],
  component: MiningPlacementStudy,
  parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'mining', primary: true, question: 'One card: select Fleet → Object → Mine, or Object → Fleet → Mine; then setup → Start mining → status. Close and reopen to retain state. Temporary model and simulated acceptance; no server completion or extraction animation yet.' } },
  args: { situation: 'ready', overflow: false, entry: 'fleet' },
  argTypes: {
    situation: { control: 'select', options: ['ready', 'blocked', 'failure', 'pending', 'accepted', 'running'], description: 'Start a fresh journey or inspect a seeded setup/status state. Changing this resets the prototype.' },
    overflow: { control: 'boolean' },
    entry: { control: 'radio', options: ['fleet', 'resource'], description: 'Begin at the fleet list or object list, then select the other before mining. Changing entry resets the prototype.' },
  },
} satisfies Meta<typeof MiningPlacementStudy>

export default meta
type Story = StoryObj<typeof meta>

// Preserve the reviewed URL as the primary, now sequential flow.
export const Placement: Story = { name: 'Fleet → Object → Mine' }
export const ResourceEntry: Story = { name: 'Object → Fleet → Mine', args: { entry: 'resource' }, parameters: { catalog: { primary: false } } }
export const Mobile: Story = { globals: { viewport: { value: 'phoneFit', isRotated: false } }, parameters: { catalog: { primary: false } } }
