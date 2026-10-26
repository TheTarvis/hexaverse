import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { HudButton } from '@/components/hud/HudControls'
import { ObjectSearchCard } from './ObjectSearchCard'
import { emptyObjectSearch, type ObjectSearchProps } from './ObjectSearch'
import { objects } from './object-search-study/fixtures'
import styles from './object-search-study/object-search-study.module.css'

const onObjectSelected = fn().mockName('object selected')

type SampleProps = { layout: 'compact' | 'image'; status: NonNullable<ObjectSearchProps['status']> }
function Sample({ layout, status }: SampleProps) {
  const [value, onChange] = useState(emptyObjectSearch)
  const [open, setOpen] = useState(true)
  const [recovered, setRecovered] = useState(false)
  return <div className={`${styles.stage} ${styles.sampleStage}`}>
    {!open && <HudButton onClick={() => setOpen(true)}>Reopen search card</HudButton>}
    <div className={styles.host} hidden={!open}>
    <ObjectSearchCard title={{ search: 'objects', scope: 'Solace' }} items={objects} value={value} onChange={onChange} onSelect={onObjectSelected} layout={layout} status={recovered ? 'ready' : status} onRetry={() => setRecovered(true)} onBack={() => setOpen(false)} backDestination="examples" onClose={() => setOpen(false)} />
  </div></div>
}
const meta = {
  id: 'hud-object-search-card', title: 'Foundations/Cards/Object search', component: Sample, tags: ['catalog'],
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, docs: { description: { component: 'Shared ObjectSearchCard and ObjectSearch with fixture candidates. This isolated specimen reports selection in Storybook Actions; Back/Close dismiss and reopening preserves filters. Use Tasks / Objects / Shared search for complete journeys. No service reads or order commits are owned by the card.' } } },
  args: { layout: 'compact', status: 'ready' },
  render: args => <Sample key={args.status} {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="hud-card"]')!
    await expect(card.querySelectorAll('[data-slot="hud-title"]')).toHaveLength(1)
    await expect(card.querySelector('[data-slot="hud-header"]')).toBeNull()
    const frame = card.getBoundingClientRect()
    await expect(frame.right).toBeLessThanOrEqual(canvasElement.ownerDocument.defaultView!.innerWidth)
    if (args.status !== 'ready') return
    await userEvent.click(canvas.getByRole('button', { name: 'Fleets' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Owned' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Close object search' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reopen search card' }))
    await expect(canvas.getByRole('button', { name: 'Owned' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(canvas.getByRole('group', { name: 'Object type' })).getByRole('button', { name: 'All' }))
  },
  argTypes: { layout: { control: 'radio', options: ['compact', 'image'] }, status: { control: 'radio', options: ['ready', 'loading', 'error'] } },
} satisfies Meta<typeof Sample>
export default meta
type Story = StoryObj<typeof meta>
export const Card: Story = {}
export const Phone: Story = { globals: { viewport: { value: 'phoneFit', isRotated: false } } }
