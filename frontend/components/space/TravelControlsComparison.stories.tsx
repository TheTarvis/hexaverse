import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { HudButton, HudSelect } from '@/components/hud/HudControls'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { TravelStudy } from './travel-study/TravelStudy'
import styles from './travel-study/travel-study.module.css'

function SelectedTravelCard() {
  const [scenario, setScenario] = useState('affordable')
  const [revision, setRevision] = useState(0)
  return <main className={`dark ${styles.stage} ${styles.journeyStage}`}>
    <header className={styles.intro}><HudHeading level={1}>Travel review</HudHeading><HudText variant="secondary">Paired compact identities and right-aligned facts. Fictional data and simulated orders.</HudText></header>
    <div className={styles.toolbar}><label><HudText variant="label">Scenario</HudText><HudSelect value={scenario} onChange={event => setScenario(event.target.value)}><option value="affordable">Affordable trip</option><option value="shortfall">Insufficient fuel</option><option value="unavailable">Fleet unavailable</option><option value="failure">Command fails</option><option value="long">Long names</option></HudSelect></label><HudButton onClick={() => setRevision(value => value + 1)}>Reset preview</HudButton></div>
    <div className={styles.single}><TravelStudy key={`${scenario}-${revision}`} scenario={scenario} /></div>
  </main>
}

// Keep this title/export stable: Travis uses the existing URL to review selected A.
const meta = { id: 'hud-travel-controls-round-01', title: 'Tasks/Travel/Review', tags: ['catalog'], component: SelectedTravelCard, parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'travel', primary: true }, layout: 'fullscreen' } } satisfies Meta<typeof SelectedTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const CompactHeaders: Story = {
  name: 'Journey',
  play: async ({ canvasElement }) => {
    const close = within(canvasElement).getByRole('button', { name: 'Close travel card' })
    const card = close.closest('[data-slot="hud-card"]')!
    const bounds = close.getBoundingClientRect()
    const frame = card.getBoundingClientRect()
    await expect(bounds.width).toBe(28)
    await expect(bounds.height).toBe(28)
    await expect(bounds.top - frame.top).toBeCloseTo(-10, 0)
    await expect(frame.right - bounds.right).toBeCloseTo(-10, 0)
    const target = close.querySelector('span[aria-hidden="true"]')!.getBoundingClientRect()
    await expect(target.width).toBe(44)
    await expect(target.height).toBe(44)
  },
}
