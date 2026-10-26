import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FleetObjectStudy } from './FleetObjectStudy'

const meta = {
  id: 'hud-fleet-object-review', title: 'Tasks/Objects/Fleet card review', component: FleetObjectStudy, tags: ['catalog'],
  parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'objects', question: 'Objects → Object type: Fleets → category → inspect. Accepted model-first fleet card with Cargo / Actions / Ship stats. Tabs support keyboard and horizontal swipe. Actions default; close/reopen retains tab. Friendly/enemy identities are future disclosure fixtures; Unknown is an unanalyzed burn. Commands open a simulated target picker; choosing a target opens its inspector, without committing an action. Further action handoffs remain under review.' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    if (args.startAt === 'objects') await userEvent.click(canvas.getByRole('button', { name: /Peregrine Owned/ }))
    for (const [command, query] of [['Travel', 'Solace'], ['Mine', 'Nereid'], ['Dock', 'Solace'], ['Analyze', 'Nereid']] as const) {
      await userEvent.click(canvas.getByRole('button', { name: command }))
      const search = canvas.getByRole('searchbox', { name: 'Find an object' })
      await userEvent.type(search, query)
      await expect(canvas.getByRole('region', { name: 'Search results' })).toHaveTextContent(query)
      await expect(canvasElement.querySelectorAll('[data-slot="hud-title"]')).toHaveLength(1)
      await expect(canvas.queryByRole('region', { name: 'Choose action target' })).not.toBeInTheDocument()
      await userEvent.click(canvas.getByRole('button', { name: 'Back to fleet' }))
      await userEvent.click(canvas.getByRole('button', { name: command }))
      await expect(canvas.getByRole('searchbox', { name: 'Find an object' })).toHaveValue(query)
      await userEvent.click(canvas.getByRole('button', { name: 'Close object search' }))
      await userEvent.click(canvas.getByRole('button', { name: 'Open objects' }))
      await expect(canvas.getByRole('searchbox', { name: 'Find an object' })).toHaveValue(query)
      await userEvent.click(canvas.getByRole('button', { name: 'Back to fleet' }))
    }
  },
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
