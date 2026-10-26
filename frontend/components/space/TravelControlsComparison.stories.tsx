/// <reference types="vite/client" />
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { TravelStudy } from './travel-study/TravelStudy'
import styles from './travel-study/travel-study.module.css'

function SelectedTravelCard({ entry, scenario, revision, arrivalRevision, statusRevision }: { entry: 'fleet' | 'destination'; scenario: string; revision: number; arrivalRevision: number; statusRevision: number }) {
  return <main className={`dark ${styles.stage} ${styles.journeyStage}`}>
    <div className={styles.single}><TravelStudy key={`${entry}-${scenario}-${revision}`} entry={entry} scenario={scenario} arrivalRevision={arrivalRevision} statusRevision={statusRevision} /></div>
  </main>
}

// Keep this title/export stable: Travis uses the existing URL to review selected A.
const meta = { id: 'hud-travel-controls-round-01', title: 'Tasks/Travel/Review', tags: ['catalog'], component: SelectedTravelCard,
  // Exercise journeys in Vitest; opening Storybook never drives the player's choices.
  play: import.meta.env.MODE === 'test' ? async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('group', { name: 'Secondary presets' })).not.toBeInTheDocument()
    const fleetName = args.scenario === 'shortfall' ? 'Kestrel' : args.scenario === 'unavailable' ? 'Prospector' : 'Peregrine'
    const chooseFleet = async () => {
      await userEvent.type(canvas.getByRole('searchbox', { name: 'Find an object' }), fleetName)
      await userEvent.click(canvas.getByRole('button', { name: new RegExp(`${fleetName} Solace`) }))
    }
    const chooseDestination = async () => {
      await userEvent.type(canvas.getByRole('searchbox', { name: 'Find an object' }), 'Nereid research')
      await userEvent.click(canvas.getByRole('button', { name: /Nereid research station Solace/ }))
    }
    await expect(canvas.queryByTestId('travel-start')).not.toBeInTheDocument()
    if (args.entry === 'fleet') { await chooseFleet(); await chooseDestination() }
    else { await chooseDestination(); await chooseFleet() }
    await expect(canvas.getByRole('button', { name: 'Change fleet' })).toHaveTextContent(fleetName)
    await expect(canvas.getByRole('button', { name: 'Change destination' })).toHaveTextContent('Nereid research station')
    await userEvent.click(canvas.getByRole('button', { name: 'Change destination' }))
    await expect(canvas.getByRole('searchbox', { name: 'Find an object' })).toHaveValue('Nereid research')
    await userEvent.click(canvas.getByRole('button', { name: 'Close object search' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reopen card' }))
    await expect(canvas.getByRole('searchbox', { name: 'Find an object' })).toHaveValue('Nereid research')
    await userEvent.click(canvas.getByRole('button', { name: 'Back to trip' }))
    if (args.scenario === 'affordable') await waitFor(() => expect(canvas.getByRole('button', { name: 'Start travel' })).toBeEnabled())
    const close = within(canvasElement).getByRole('button', { name: 'Close travel card' })
    const card = close.closest('[data-slot="hud-card"]')!
    const bounds = close.getBoundingClientRect()
    const frame = card.getBoundingClientRect()
    await expect(bounds.width).toBe(44)
    await expect(bounds.height).toBe(44)
    await expect(bounds.top - frame.top).toBeGreaterThan(0)
    await expect(frame.right - bounds.right).toBeGreaterThan(0)
    // Verify returning from review to the initial search.
    await userEvent.click(canvas.getByRole('button', { name: args.entry === 'fleet' ? 'Back to fleets' : 'Back to destinations' }))
    await userEvent.clear(canvas.getByRole('searchbox', { name: 'Find an object' }))
  } : undefined,
  args: { entry: 'fleet', scenario: 'affordable', revision: 0, arrivalRevision: 0, statusRevision: 0 },
  argTypes: {
    entry: { control: 'radio', options: ['fleet', 'destination'], description: 'Begin with shared fleet search or destination search, then choose the other before reviewing travel.' },
    scenario: { control: 'select', options: ['affordable', 'shortfall', 'unavailable', 'failure', 'long'] },
    revision: { name: 'Reset journey', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to restart the fixture journey.' },
    arrivalRevision: { name: 'Simulate arrival', control: { type: 'number', min: 0, step: 1 }, description: 'Increment after starting travel to complete the simulated journey.' },
    statusRevision: { name: 'Open fleet status', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to return to an existing simulated journey.' },
  }, parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'travel', primary: true }, layout: 'fullscreen' } } satisfies Meta<typeof SelectedTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const CompactHeaders: Story = {
  name: 'Journey',
}

export const DestinationFirst: Story = { args: { entry: 'destination' }, parameters: { catalog: { primary: false } } }
