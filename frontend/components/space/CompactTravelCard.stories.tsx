import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CompactTravelCard } from './CompactTravelCard'
import type { Fleet } from '@/lib/types/fleet'

const fleet: Fleet = { id: 'fleet-peregrine', corporationId: 'demo', own: true, position: { X: 0, Y: 0, Z: 0 }, worldTime: 1000, systemId: 'solace', roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 60 }, cargoCapacity: 100, freeHold: 40, miningRate: 1 }, state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 1000, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } } }
const meta = {
  title: 'HUD/Travel Card', component: CompactTravelCard,
  parameters: { layout: 'centered' },
  decorators: [Story => <div style={{ width: 340, maxWidth: 'calc(100vw - 32px)', padding: '16px 0', color: '#dce6f0' }}><Story /></div>],
  args: { mode: 'review', fleet, fleets: [fleet], systemId: 'solace', destination: 'Nereid research station', worldTime: 1000, scale: 1,
    quote: { controlPoints: [], departMs: 1000, arriveMs: 181000, deltaV: 24, fuelCostTons: 18, affordable: true, strandingWarning: false },
    onFleet: () => {}, onStart: () => {}, onStop: () => {}, onBack: () => {}, onClose: () => {}, onRetry: () => {},
  },
} satisfies Meta<typeof CompactTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const Affordable: Story = {}
export const InsufficientFuel: Story = { args: { fleet: { ...fleet, roster: { ...fleet.roster!, cargo: { fuel: 4 } } }, quote: { ...meta.args.quote, affordable: false }, blocker: 'Insufficient fuel for this trip.' } }
export const Recalculating: Story = { args: { quote: null, blocker: 'Calculating trip…' } }
export const Blocked: Story = { args: { quote: null, blocker: 'Stop mining before travelling.' } }
export const CommitFailed: Story = { args: { error: 'Fuel cost changed. Request a fresh estimate and try again.' } }
export const Travelling: Story = { args: { mode: 'status', worldTime: 61000, fleet: { ...fleet, state: { ...fleet.state, Mode: 0, Burn: { DepartMs: 1000, ArriveMs: 181000, Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'station', Point: null }, Intercept: { X: 10, Y: 0, Z: 0 }, Curve: [], Length: 10, Accel: 1, InsertionPhase: 0 } } } } }
