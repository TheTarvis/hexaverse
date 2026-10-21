import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardShell } from './HudCardShell'
import { HudActionBand } from './HudActionBand'
import { HudBackButton, HudSelect } from './HudControls'
import { HudHeading, HudText, HudValue } from './HudTypography'
import { HudProgress } from './HudProgress'
import styles from './hud-progress.stories.module.css'

function TravelProgressStudy() {
  const [value, setValue] = useState(2)
  const [notice, setNotice] = useState('')
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}>
      <HudHeading level={1}>Travel progress</HudHeading>
      <HudText variant="secondary">Selected luminous rail. Inspect empty, early, mid-trip and arrived states. Fictional data.</HudText>
    </header>
    <div className={styles.controls}>
      <label><HudText variant="label">Trip completion</HudText><HudSelect aria-label="Trip completion" value={value} onChange={event => setValue(Number(event.target.value))}>{[0, 2, 25, 65, 100].map(percent => <option key={percent} value={percent}>{percent}%</option>)}</HudSelect></label>
    </div>
    <article className={styles.example} aria-label="Luminous rail">
      <HudCardShell title="Fleet status" lighting="none" className={styles.card} contentClassName={styles.layout} footer={<HudActionBand label="Travel actions" actions={[
        { id: 'stop', label: 'Stop travel', tone: 'danger', disabled: value === 100, onClick: () => setNotice('Stop preview only. No live fleet order was changed.') },
      ]} />}>
        <div className={styles.body}>
          <HudBackButton destination="trip" onClick={() => setNotice('Visual study only. Open the travel preview for the complete journey.')} />
          <HudHeading size="compact">Osprey 2</HudHeading>
          <HudText variant="secondary">{value === 100 ? 'Arrived' : 'Travelling'} · Nereid research station</HudText>
          <div className={styles.meter}>
            <HudProgress label="Travel progress" value={value} />
            <div className={styles.figures}><HudValue>{value}%</HudValue><HudText variant="secondary">{value === 100 ? 'Arrived' : <><HudValue>{Math.round(180 * (1 - value / 100))}s</HudValue> remaining</>}</HudText></div>
          </div>
        </div>

      </HudCardShell>
    </article>
    <HudText variant="caption" role="status" className={styles.notice}>{notice || 'Shared determinate progress used by the travel preview and production travel card. Fixture controls do not change live orders.'}</HudText>
  </main>
}

const meta = { title: 'HUD/Travel Progress', component: TravelProgressStudy, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TravelProgressStudy>
export default meta
type Story = StoryObj<typeof meta>
// Preserve the comparison URL used during review.
export const Comparison: Story = { name: 'Luminous rail' }
