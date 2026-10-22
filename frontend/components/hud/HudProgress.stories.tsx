import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardShell } from './HudCardShell'
import { HudHeading, HudText, HudValue } from './HudTypography'
import { HudProgress } from './HudProgress'
import styles from './hud-progress.stories.module.css'

function TravelProgressStudy({ value }: { value: number }) {
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}>
      <HudHeading level={1}>Progress</HudHeading>
      <HudText variant="secondary">Shared determinate rail. Inspect zero, early, middle and complete values; completion is supplied by the caller.</HudText>
    </header>
    <article className={styles.example} aria-label="Luminous rail">
      <HudCardShell title="Progress" className={styles.card}>
        <HudProgress label="Example progress" value={value} />
        <div className={styles.figures}><HudValue>{value}%</HudValue><HudText variant="secondary">{value === 100 ? 'Complete' : 'Caller-supplied completion'}</HudText></div>
      </HudCardShell>
    </article>

  </main>
}

const meta = { id: 'hud-travel-progress', title: 'Foundations/Progress', tags: ['catalog'], component: TravelProgressStudy, args: { value: 2 }, argTypes: { value: { name: 'Completion (%)', control: { type: 'range', min: 0, max: 100, step: 1 } } }, parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen' } } satisfies Meta<typeof TravelProgressStudy>
export default meta
type Story = StoryObj<typeof meta>
// Preserve the comparison URL used during review.
export const Comparison: Story = { name: 'Determinate states' }
