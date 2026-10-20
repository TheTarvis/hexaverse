import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/catalyst/button'
import { Select } from '@/components/catalyst/select'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { TravelStudy } from './travel-study/TravelStudy'
import { conceptNames, conceptDescriptions, type Concept } from './travel-study/fixtures'
import styles from './travel-study/travel-study.module.css'

function SelectionConcepts() {
  const [active, setActive] = useState<Concept>('A')
  const [entry, setEntry] = useState('destination')
  const [revision, setRevision] = useState(0)
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}><HudHeading level={1}>Fleet & destination selection</HudHeading><HudText variant="secondary">Context starts in Solace. Expand scope or search known systems. Compare with 240 fleets and 1,200 destinations.</HudText></header>
    <div className={styles.toolbar}><label><HudText variant="label">Entry context</HudText><Select value={entry} onChange={event => setEntry(event.target.value)}><option value="destination">Change destination from travel review</option><option value="fleet">Change fleet from travel review</option><option value="objective">Delivery objective → choose fleet</option></Select></label><Button outline onClick={() => setRevision(value => value + 1)}>Reset concepts</Button></div>
    <div className={styles.tabs} aria-label="Selector concept">{(['A', 'B', 'C'] as const).map(concept => <Button key={concept} outline aria-pressed={active === concept} onClick={() => setActive(concept)}>{concept} · {conceptNames[concept]}</Button>)}</div>
    <div className={styles.comparison}>{(['A', 'B', 'C'] as const).map(concept => <article key={concept} className={styles.variant} data-active={active === concept} aria-label={`Concept ${concept}`}><header className={styles.optionHeading}><HudHeading size="compact">{concept} · {conceptNames[concept]}</HudHeading><HudText variant="secondary">{conceptDescriptions[concept]}</HudText></header><TravelStudy key={`${entry}-${revision}`} concept={concept} startSelecting objective={entry === 'objective'} initialKind={entry === 'destination' ? 'destination' : 'fleet'} /></article>)}</div>
  </main>
}
const meta = { title: 'HUD/Travel Selection', component: SelectionConcepts, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof SelectionConcepts>
export default meta
type Story = StoryObj<typeof meta>
export const Concepts: Story = {}
