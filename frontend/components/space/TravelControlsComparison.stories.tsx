import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/catalyst/button'
import { Select } from '@/components/catalyst/select'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { TravelStudy } from './travel-study/TravelStudy'
import styles from './travel-study/travel-study.module.css'

function SelectedTravelCard() {
  const [scenario, setScenario] = useState('affordable')
  const [revision, setRevision] = useState(0)
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}><HudHeading level={1}>Travel review · selected A</HudHeading><HudText variant="secondary">Paired compact identities and right-aligned facts. Fictional data and simulated orders.</HudText></header>
    <div className={styles.toolbar}><label><HudText variant="label">Scenario</HudText><Select value={scenario} onChange={event => setScenario(event.target.value)}><option value="affordable">Affordable trip</option><option value="shortfall">Insufficient fuel</option><option value="unavailable">Fleet unavailable</option><option value="failure">Command fails</option><option value="long">Long names</option></Select></label><Button outline onClick={() => setRevision(value => value + 1)}>Reset preview</Button></div>
    <div className={styles.single}><TravelStudy key={`${scenario}-${revision}`} scenario={scenario} /></div>
  </main>
}

// Keep this title/export stable: Travis uses the existing URL to review selected A.
const meta = { title: 'HUD/Travel Controls/Round 01', component: SelectedTravelCard, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof SelectedTravelCard>
export default meta
type Story = StoryObj<typeof meta>
export const CompactHeaders: Story = {}
