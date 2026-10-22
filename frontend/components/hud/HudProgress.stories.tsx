import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardShell } from './HudCardShell'
import { HudSelect } from './HudControls'
import { HudHeading, HudText, HudValue } from './HudTypography'
import { HudProgress } from './HudProgress'
import styles from './hud-progress.stories.module.css'

function TravelProgressStudy() {
  const [value, setValue] = useState(2)
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}>
      <HudHeading level={1}>Progress</HudHeading>
      <HudText variant="secondary">Shared determinate rail. Inspect zero, early, middle and complete values; completion is supplied by the caller.</HudText>
    </header>
    <div className={styles.controls}>
      <label><HudText variant="label">Trip completion</HudText><HudSelect aria-label="Trip completion" value={value} onChange={event => setValue(Number(event.target.value))}>{[0, 2, 25, 65, 100].map(percent => <option key={percent} value={percent}>{percent}%</option>)}</HudSelect></label>
    </div>
    <article className={styles.example} aria-label="Luminous rail">
      <HudCardShell title="Progress" className={styles.card}>
        <HudProgress label="Example progress" value={value} />
        <div className={styles.figures}><HudValue>{value}%</HudValue><HudText variant="secondary">{value === 100 ? 'Complete' : 'Caller-supplied completion'}</HudText></div>
      </HudCardShell>
    </article>

  </main>
}

const meta = { id: 'hud-travel-progress', title: 'Foundations/Progress', tags: ['catalog'], component: TravelProgressStudy, parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen' } } satisfies Meta<typeof TravelProgressStudy>
export default meta
type Story = StoryObj<typeof meta>
// Preserve the comparison URL used during review.
export const Comparison: Story = { name: 'Determinate states' }
