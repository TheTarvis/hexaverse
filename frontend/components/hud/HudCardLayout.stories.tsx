import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardBack, HudCardShell } from './HudCardShell'
import { HudActionBand, type HudBandAction } from './HudActionBand'
import { HudSelect } from './HudControls'
import { HudFacts } from './HudFacts'
import { HudHeading, HudText, HudValue } from './HudTypography'
import styles from './hud-card-layout.stories.module.css'

type ActionState = 'ready' | 'disabled' | 'pending'
type LayoutArgs = {
  height: 'fixed' | 'natural'
  content: 'short' | 'overflow'
  actionState: ActionState
  labels: 'normal' | 'long'
  actionCount: 2 | 3
}

/** Standalone foundation review. No game settings or travel services are changed. */
function LayoutSample({ overflowing, natural, count, actionState, longLabels }: { overflowing: boolean; natural: boolean; count: 2 | 3; actionState: ActionState; longLabels: boolean }) {
  const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState('Standard')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const apply = () => {
    if (saving || actionState !== 'ready') return
    setSaving(true); setNotice('Applying changes in this preview…')
    timer.current = setTimeout(() => { setSaving(false); setNotice(`${detail} detail applied in this preview.`); timer.current = null }, 800)
  }
  const cancel: HudBandAction = { id: 'cancel', label: longLabels ? 'Discard changes' : 'Cancel', onClick: () => { setDetail('Standard'); setNotice('Changes discarded in this preview.') } }
  const primary: HudBandAction = { id: 'apply', label: longLabels ? 'Apply display preferences' : 'Apply changes', onClick: apply, disabled: actionState === 'disabled', pending: saving || actionState === 'pending', pendingLabel: 'Applying…' }
  const reset: HudBandAction = { id: 'reset', label: longLabels ? 'Restore defaults' : 'Reset', onClick: () => { setDetail('Standard'); setNotice('Defaults restored in this preview.') } }
  return <article className={styles.sample} aria-label={`${count} action layout`}>
    <HudCardShell title="Settings" className={`${styles.card} ${natural ? styles.natural : ''}`} onClose={() => setNotice('Card dismissed in this preview. Draft retained.')} closeLabel="Close settings" footer={<HudActionBand actions={count === 2 ? [cancel, primary] : [cancel, primary, reset]} label={`${count} card actions`} />}>
      <HudCardBack destination="settings" onClick={() => setNotice('Back requested in this preview. Draft retained.')} />
      <section className={styles.body} aria-label="Scrollable card content" tabIndex={0} data-layout="body">
        <label className={styles.field}><HudText variant="label">Detail level</HudText><HudSelect aria-label="Detail level" value={detail} onChange={event => setDetail(event.target.value)}><option>Low</option><option>Standard</option><option>High</option></HudSelect></label>
        <HudFacts items={[{ label: 'Labels', value: 'Selected objects' }, { label: 'Map scale', value: <HudValue>100%</HudValue> }]} />
        {actionState === 'disabled' && <HudText variant="secondary">Apply is unavailable in this state example. Cancel and Reset remain usable.</HudText>}
        {notice && <HudText variant="caption" role="status">{notice}</HudText>}
        {overflowing && Array.from({ length: 12 }, (_, index) => <section key={index} className={styles.group}><HudHeading variant="section" level={4}>Display group {index + 1}</HudHeading><HudText>Supporting settings and explanations can extend beyond the visible area. Only this content region scrolls.</HudText><HudFacts items={[{ label: 'Quality', value: detail }, { label: 'Visibility', value: 'Automatic' }]} /></section>)}
      </section>
    </HudCardShell>
  </article>
}

function CardLayoutStudy({ height, content, actionState, labels, actionCount }: LayoutArgs) {
  return <main className={`dark ${styles.stage}`}>
    <div className={styles.examples}>{([2, 3] as const).map(count => <div key={count} className={styles.example} data-active={actionCount === count}><LayoutSample count={count} overflowing={content === 'overflow'} natural={height === 'natural'} actionState={actionState} longLabels={labels === 'long'} /></div>)}</div>
  </main>
}

const meta = {
  id: 'hud-card-layout', title: 'Foundations/Cards/Stationary actions', tags: ['catalog'], component: CardLayoutStudy,
  args: { height: 'fixed', content: 'short', actionState: 'ready', labels: 'normal', actionCount: 2 },
  argTypes: {
    height: { name: 'Card height', control: 'inline-radio', options: ['fixed', 'natural'] },
    content: { name: 'Content', control: 'inline-radio', options: ['short', 'overflow'] },
    actionState: { name: 'Action state', control: 'select', options: ['ready', 'disabled', 'pending'] },
    labels: { name: 'Labels', control: 'inline-radio', options: ['normal', 'long'] },
    actionCount: { name: 'Phone action count', control: 'inline-radio', options: [2, 3] },
  },
  parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen', docs: { description: { component: 'Isolated shared card with stationary header and footer. Change scenarios in Storybook Controls; only card content appears in the canvas. Desktop compares two/three actions; phone shows the selected action count within the viewport. Uses the real shell, not full game workspace navigation. All callbacks are simulated.' } } },
} satisfies Meta<typeof CardLayoutStudy>
export default meta
type Story = StoryObj<typeof meta>
export const StationaryActions: Story = {}
