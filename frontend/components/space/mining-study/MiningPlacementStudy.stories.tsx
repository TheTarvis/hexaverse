import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MiningPlacementStudy } from './MiningPlacementStudy'

const meta = {
  id: 'hud-mining-review', title: 'Tasks/Mining/Review', tags: ['catalog'],
  component: MiningPlacementStudy,
  parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'mining', primary: true, question: 'One card: select Fleet → Object → Mine, or Object → Fleet → Mine; then one fleet/mining review → Start mining → status. Close and reopen to retain state. Temporary model and simulated acceptance; no server completion or extraction animation yet.' } },
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
async function selectAndReview({ canvasElement, args }: { canvasElement: HTMLElement; args: { entry: 'fleet' | 'resource' } }) {
  const canvas = within(canvasElement)
  await expect(canvas.queryByRole('group', { name: 'Secondary presets' })).not.toBeInTheDocument()
  const fleet = () => canvas.getByRole('button', { name: /Peregrine 3 generalist ships/ })
  const object = () => canvas.getByRole('button', { name: /Nereid outer belt Metals/ })
  if (args.entry === 'fleet') {
    await userEvent.click(fleet())
    await userEvent.click(canvas.getByRole('button', { name: 'Choose object' }))
    await userEvent.click(object())
  } else {
    await userEvent.click(object())
    await userEvent.click(canvas.getByRole('button', { name: 'Choose fleet' }))
    await userEvent.click(fleet())
  }
  await expect(canvas.queryByRole('button', { name: 'Mine here' })).not.toBeInTheDocument()
  await expect(canvas.getByRole('heading', { name: 'Attached · ready' })).toBeVisible()
  await expect(canvasElement.querySelectorAll('[data-slot="hud-section"] > [data-slot="model-preview"]')).toHaveLength(1)
  await expect(canvas.getByRole('spinbutton', { name: 'Quantity in tonnes' })).toHaveValue(80)
  await expect(canvas.getByRole('button', { name: 'Start mining' })).toBeEnabled()
  const quantity = canvas.getByRole('spinbutton', { name: 'Quantity in tonnes' })
  await userEvent.clear(quantity)
  await userEvent.type(quantity, '40')
  await userEvent.click(canvas.getByRole('button', { name: 'Close mining card' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Open Peregrine' }))
  await expect(canvas.getByRole('spinbutton', { name: 'Quantity in tonnes' })).toHaveValue(40)
  await userEvent.click(canvas.getByRole('button', { name: 'Set maximum mining quantity' }))
}
export const Placement: Story = { name: 'Object → Fleet → Mine', play: selectAndReview }
export const ResourceEntry: Story = { name: 'Fleet → Object → Mine', play: selectAndReview, args: { entry: 'resource' }, parameters: { catalog: { primary: false } } }
export const Mobile: Story = { play: selectAndReview, globals: { viewport: { value: 'phoneFit', isRotated: false } }, parameters: { catalog: { primary: false } } }
