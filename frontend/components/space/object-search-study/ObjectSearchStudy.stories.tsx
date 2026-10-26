import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ObjectSearchStudy } from './ObjectSearchStudy'

const meta = {
  id: 'hud-object-search', title: 'Tasks/Objects/Shared search', component: ObjectSearchStudy, tags: ['catalog'],
  parameters: { catalog: { purpose: 'task', status: 'comparison', record: 'docs/hud.md', task: 'objects', question: 'Compact single-column rows or image-led grid? Browse and choose action targets with one shared search.' } },
  args: { entry: 'browse', layout: 'compact', scenario: 'ready' },
  argTypes: {
    entry: { control: 'radio', options: ['browse', 'travel', 'mine', 'fleet'], description: 'Resets the journey at this entry point.' },
    layout: { control: 'radio', options: ['compact', 'image'], description: 'Compare slim single-column rows against image-led grid tiles, using the same shared search and fixtures.' },
    scenario: { control: 'select', options: ['ready', 'loading', 'error', 'empty', 'long', 'many'], description: 'Fixture read state/content. Error Retry recovers to ready; loading stays pending.' },
  },
} satisfies Meta<typeof ObjectSearchStudy>
export default meta
type Story = StoryObj<typeof meta>

export const Browse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Fleets' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Owned' }))
    await userEvent.click(canvas.getByRole('button', { name: /Peregrine Owned/ }))
    await expect(canvas.getByRole('heading', { name: 'Peregrine', level: 3 })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to objects' }))
    await expect(canvas.getByRole('button', { name: 'Owned' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Close object search' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reopen card' }))
    await expect(canvas.getByRole('button', { name: 'Owned' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Bodies' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Moons' }))
    await expect(canvas.getByRole('button', { name: /Nereid moon Moon/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Resources' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Water' }))
    await expect(canvas.getByRole('button', { name: /Nereid moon Moon/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Bodies' }))
    await expect(canvas.getByRole('button', { name: 'Moons' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(canvas.getByRole('group', { name: 'Object type' })).getByRole('button', { name: 'All' }))
  },
}
export const ImageGrid: Story = { args: { layout: 'image' } }
export const TravelJourney: Story = {
  args: { entry: 'travel' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Find an object' }), 'solace')
    await userEvent.click(canvas.getByRole('button', { name: /Solace Station Owned/ }))
    await expect(canvas.getByRole('button', { name: 'Start travel' })).toBeVisible()
    await expect(canvas.queryByText(/Simulated acceptance/)).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Change fleet' }))
    await expect(canvas.getByRole('searchbox')).toHaveValue('')
    await expect(canvas.queryByRole('button', { name: /Wayfarer Friendly/ })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /Kestrel Owned/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Change destination' }))
    await expect(canvas.getByRole('searchbox')).toHaveValue('solace')
    await userEvent.click(canvas.getByRole('button', { name: /Solace Station Owned/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Start travel' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Simulated acceptance')
    await userEvent.click(canvas.getByRole('button', { name: 'Back to travel review' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Change fleet' }))
    await userEvent.click(canvas.getByRole('button', { name: /Peregrine Owned/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Change destination' }))
    await userEvent.clear(canvas.getByRole('searchbox'))
  },
}
export const MiningTargets: Story = {
  args: { entry: 'mine' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /Solace Station Owned/ })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('group', { name: 'Secondary presets' })).not.toBeInTheDocument()
    await userEvent.type(canvas.getByRole('searchbox'), 'metals')
    await userEvent.click(canvas.getByRole('button', { name: /Nereid outer belt Metals/ }))
    await expect(canvas.getByText('Target selected. No mining order has been issued.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to mining targets' }))
    await expect(canvas.getByRole('searchbox')).toHaveValue('metals')
    await userEvent.clear(canvas.getByRole('searchbox'))
  },
}
export const CommandFleet: Story = { args: { entry: 'fleet' } }
export const Phone: Story = { globals: { viewport: { value: 'phoneFit', isRotated: false } } }
export const ReadFailure: Story = {
  args: { scenario: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(canvas.getByRole('button', { name: /Peregrine Owned/ })).toBeVisible()
  },
}
