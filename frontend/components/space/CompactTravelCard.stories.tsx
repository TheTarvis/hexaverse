import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { CompactTravelCard } from './CompactTravelCard'
import type { Fleet } from '@/lib/types/fleet'

const fleet: Fleet = { id: 'fleet-peregrine', name: 'Peregrine', corporationId: 'demo', own: true, position: { X: 0, Y: 0, Z: 0 }, worldTime: 1000, systemId: 'solace', roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 60 }, cargoCapacity: 100, freeHold: 40, miningRate: 1 }, state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 1000, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } } }
const meta = {
  id: 'hud-travel-card', title: 'Tasks/Travel/States', tags: ['catalog'], component: CompactTravelCard,
  parameters: { catalog: { purpose: 'task', status: 'reference', record: 'docs/hud.md', task: 'travel' }, layout: 'centered' },
  decorators: [Story => <div style={{ width: 340, maxWidth: 'calc(100vw - 32px)', padding: '16px 0', color: '#dce6f0' }}><Story /></div>],
  args: { fleet, fleets: [fleet], systemId: 'solace', destination: 'Nereid research station', destinationKind: 'station', worldTime: 1000, scale: 1,
    quote: { controlPoints: [], departMs: 1000, arriveMs: 181000, deltaV: 24, fuelCostTons: 18, affordable: true, strandingWarning: false },
    onFleet: () => {}, onStart: () => {}, onBack: () => {}, onClose: () => {}, onRetry: () => {},
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="hud-card"]')!
    const band = card.querySelector<HTMLElement>('[data-slot="hud-footer"] > [data-slot="hud-action-band"]')!
    await expect(band).not.toBeNull()
    const frame = card.getBoundingClientRect()
    const actions = band.getBoundingClientRect()
    const inset = parseFloat(getComputedStyle(card).getPropertyValue('--hud-frame-width'))
    await expect(actions.left - frame.left).toBeCloseTo(inset, 0)
    await expect(frame.right - actions.right).toBeCloseTo(inset, 0)
    await expect(frame.bottom - actions.bottom).toBeCloseTo(inset, 0)
    const content = card.querySelector<HTMLElement>('[data-slot="hud-content"]')!
    content.scrollTop = content.scrollHeight
    await expect(band.getBoundingClientRect().top).toBeCloseTo(actions.top, 0)
    content.scrollTop = 0
  },
} satisfies Meta<typeof CompactTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const Affordable: Story = {}
export const InsufficientFuel: Story = { args: { fleet: { ...fleet, roster: { ...fleet.roster!, cargo: { fuel: 4 } } }, quote: { ...meta.args.quote, affordable: false }, blocker: 'Insufficient fuel for this trip.' } }
export const Recalculating: Story = { args: { quote: null, blocker: 'Calculating trip…' } }
export const Blocked: Story = { args: { quote: null, blocker: 'Stop mining before travelling.' } }
export const CommitFailed: Story = { args: { error: 'Fuel cost changed. Request a fresh estimate and try again.' } }
