import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import type { TuningProfile, TuningSnapshot } from '@/lib/types/tuning'
import { LocalTuningContext } from './LocalTuningContext'
import { TuningCard } from './TuningCard'
import { TunableHudCard } from './TunableHudCard'
import { HudWorkspace } from '@/components/hud/HudWorkspace'

const meta = {
  id: 'local-tuning', title: 'Foundations/Cards/Local tuning', component: TuningCard, tags: ['catalog'],
  parameters: { layout: 'fullscreen', catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' } },
} satisfies Meta<typeof TuningCard>
export default meta
type Story = StoryObj<typeof meta>

// Served-state fixture only; production obtains these descriptors from Go.
const specimen: TuningSnapshot = {
  fields: [
    { key: 'world.speed', label: 'Game speed', group: 'World', unit: '× real time', default: 1, min: .01, max: 1000 },
    { key: 'hulls.holdCapacity', label: 'Seed hull hold', group: 'Ships', unit: 'tons', default: 200, min: 0, max: 1000000 },
    { key: 'orbits.baseSeconds', label: 'Kepler reference period', group: 'Orbits', unit: 'world-seconds', default: 40, min: .1, max: 100000, regenerate: true },
  ],
  profile: { version: 1, values: { 'world.speed': 1, 'hulls.holdCapacity': 200, 'orbits.baseSeconds': 40 } },
  active: { 'world.speed': 1, 'hulls.holdCapacity': 200, 'orbits.baseSeconds': 40 }, restartPending: false,
}
function Sample({ contextual = false, workspace = false }: { contextual?: boolean; workspace?: boolean }) {
  const [snapshot, setSnapshot] = useState(specimen)
  const accept = async (profile: TuningProfile, live: boolean) => {
    const active = live ? Object.fromEntries(snapshot.fields.map(field => [field.key, field.regenerate ? snapshot.active[field.key] : profile.values[field.key]])) : snapshot.active
    const next = { ...snapshot, profile, active, restartPending: snapshot.fields.some(field => active[field.key] !== profile.values[field.key]) }
    setSnapshot(next); return next
  }
  return <LocalTuningContext.Provider value={{ snapshot, pending: false, apply: profile => accept(profile, true), stage: profile => accept(profile, false), regenerate: async () => snapshot }}>
    <div style={{ height: '100dvh', boxSizing: 'border-box', padding: 18, display: 'flex', maxWidth: 480, margin: '0 auto' }}><>{workspace ? <HudWorkspace corporationId="storybook-local-tuning" panels={[]} /> : contextual ? <TunableHudCard groups={['Ships']} title="Fleet status" style={{ width: '100%' }}><p>Seed hull</p><input aria-label="Fleet note" /></TunableHudCard> : <TuningCard style={{ width: '100%' }} />}</></div>
  </LocalTuningContext.Provider>
}
export const Settings: Story = {
  render: () => <Sample />,
  play: import.meta.env.MODE === 'test' ? async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const speed = canvas.getByRole('spinbutton', { name: 'Game speed' })
    await userEvent.clear(speed); await userEvent.type(speed, '4')
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await expect(canvas.getByText('× real time · Active: 4 · Applies live')).toBeVisible()
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Tuning section' }), 'Orbits')
    await expect(canvas.getByText(/Requires regeneration/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Restore defaults' }))
  } : undefined,
}

export const Contextual: Story = {
 render: () => <Sample contextual />,
 play: import.meta.env.MODE === 'test' ? async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByRole('textbox', {name:'Fleet note'}), 'Borealis')
  await userEvent.click(canvas.getByRole('button', {name:'Tune'}))
  await expect(canvas.getByRole('spinbutton', {name:'Seed hull hold'})).toBeVisible()
  await userEvent.click(canvas.getByRole('button', {name:'Back to card'}))
  await expect(canvas.getByRole('textbox', {name:'Fleet note'})).toHaveValue('Borealis')
 } : undefined,
}

export const SettingsCard: Story = {
 render: () => <Sample workspace />,
 play: import.meta.env.MODE === 'test' ? async ({canvasElement}) => {
  const canvas=within(canvasElement)
  await userEvent.click(canvas.getByRole('button',{name:'Settings'}))
  await userEvent.click(canvas.getByRole('tab',{name:'Tuning'}))
  const apply=canvas.getByRole('button',{name:'Apply'})
  const frame=apply.closest('[data-hud-framing="frame"]')!
  await expect(frame.querySelector('[data-slot="hud-header"]')).toContainElement(canvas.getByRole('tab',{name:'Tuning'}))
  await expect(frame.querySelector('[data-slot="hud-footer"]')).toContainElement(apply)
  await userEvent.selectOptions(canvas.getByRole('combobox',{name:'Tuning section'}),'Ships')
  await expect(canvas.getByRole('spinbutton',{name:'Seed hull hold'})).toBeVisible()
  await userEvent.click(canvas.getByRole('tab',{name:'Account'}))
  await expect(canvas.getByRole('tab',{name:'Account'})).toHaveAttribute('aria-selected','true')
 } : undefined,
}
