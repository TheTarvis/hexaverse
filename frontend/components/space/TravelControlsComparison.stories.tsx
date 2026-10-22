import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { TravelStudy } from './travel-study/TravelStudy'
import styles from './travel-study/travel-study.module.css'

function SelectedTravelCard({ scenario, revision, arrivalRevision, statusRevision }: { scenario: string; revision: number; arrivalRevision: number; statusRevision: number }) {
  return <main className={`dark ${styles.stage} ${styles.journeyStage}`}>
    <div className={styles.single}><TravelStudy key={`${scenario}-${revision}`} scenario={scenario} arrivalRevision={arrivalRevision} statusRevision={statusRevision} /></div>
  </main>
}

// Keep this title/export stable: Travis uses the existing URL to review selected A.
const meta = { id: 'hud-travel-controls-round-01', title: 'Tasks/Travel/Review', tags: ['catalog'], component: SelectedTravelCard,
  args: { scenario: 'affordable', revision: 0, arrivalRevision: 0, statusRevision: 0 },
  argTypes: {
    scenario: { control: 'select', options: ['affordable', 'shortfall', 'unavailable', 'failure', 'long'] },
    revision: { name: 'Reset journey', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to restart the fixture journey.' },
    arrivalRevision: { name: 'Simulate arrival', control: { type: 'number', min: 0, step: 1 }, description: 'Increment after starting travel to complete the simulated journey.' },
    statusRevision: { name: 'Open fleet status', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to return to an existing simulated journey.' },
  }, parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'travel', primary: true }, layout: 'fullscreen' } } satisfies Meta<typeof SelectedTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const CompactHeaders: Story = {
  name: 'Journey',
  play: async ({ canvasElement }) => {
    const close = within(canvasElement).getByRole('button', { name: 'Close travel card' })
    const card = close.closest('[data-slot="hud-card"]')!
    const bounds = close.getBoundingClientRect()
    const frame = card.getBoundingClientRect()
    await expect(bounds.width).toBe(44)
    await expect(bounds.height).toBe(44)
    await expect(bounds.top - frame.top).toBeGreaterThan(0)
    await expect(frame.right - bounds.right).toBeGreaterThan(0)
    const target = close.querySelector('span[aria-hidden="true"]')!.getBoundingClientRect()
    await expect(target.width).toBe(44)
    await expect(target.height).toBe(44)
  },
}
