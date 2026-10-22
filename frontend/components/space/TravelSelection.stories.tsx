import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { TravelStudy } from './travel-study/TravelStudy'
import { conceptNames, conceptDescriptions, type Concept } from './travel-study/fixtures'
import styles from './travel-study/travel-study.module.css'

function SelectionConcepts({ active, entry, revision }: { active: Concept; entry: 'destination' | 'fleet' | 'objective'; revision: number }) {
  return <main className={`dark ${styles.stage}`}>
    <div className={styles.comparison}>{(['A', 'B', 'C'] as const).map(concept => <article key={concept} className={styles.variant} data-active={active === concept} aria-label={`Concept ${concept}`}><header className={styles.optionHeading}><HudHeading size="compact">{concept} · {conceptNames[concept]}</HudHeading><HudText variant="secondary">{conceptDescriptions[concept]}</HudText></header><TravelStudy key={`${entry}-${revision}`} concept={concept} startSelecting objective={entry === 'objective'} initialKind={entry === 'destination' ? 'destination' : 'fleet'} /></article>)}</div>
  </main>
}
const meta = { id: 'hud-travel-selection', title: 'Tasks/Travel/Selection comparison', tags: ['catalog'], component: SelectionConcepts,
  args: { active: 'A', entry: 'destination', revision: 0 },
  argTypes: {
    active: { name: 'Concept (narrow viewport)', control: 'inline-radio', options: ['A', 'B', 'C'], description: 'Desktop compares all three concepts; narrow previews show this selection.' },
    entry: { name: 'Entry context', control: 'select', options: ['destination', 'fleet', 'objective'] },
    revision: { name: 'Reset concepts', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to restart the chooser fixtures.' },
  }, parameters: { catalog: { purpose: 'task', status: 'comparison', record: 'docs/hud.md', task: 'travel', question: 'Which fleet and destination chooser supports finding and returning to this trip?' }, layout: 'fullscreen' } } satisfies Meta<typeof SelectionConcepts>
export default meta
type Story = StoryObj<typeof meta>
export const Concepts: Story = {}
