import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudCardShell } from './HudCardShell'
import { HudActionBand, type HudBandAction } from './HudActionBand'
import { HudButton, HudSelect } from './HudControls'
import { HudFacts } from './HudFacts'
import { HudHeading, HudText, HudValue } from './HudTypography'
import styles from './hud-card-layout.stories.module.css'

type ActionState = 'ready' | 'disabled' | 'pending'

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
    <header className={styles.sampleTitle}><HudHeading size="compact">{count} actions</HudHeading><HudText variant="secondary">{count === 2 ? 'Equal halves; primary on the right.' : 'Equal outer cells; wider primary in the center.'}</HudText></header>
    <HudCardShell title="Settings" lighting="none" className={`${styles.card} ${natural ? styles.natural : ''}`} contentClassName={styles.layout}>
      <header className={styles.header} data-layout="header"><HudHeading size="compact">Display settings</HudHeading><HudText variant="secondary">Choose the amount of visual detail.</HudText></header>
      <section className={styles.body} aria-label="Scrollable card content" tabIndex={0} data-layout="body">
        <label className={styles.field}><HudText variant="label">Detail level</HudText><HudSelect aria-label="Detail level" value={detail} onChange={event => setDetail(event.target.value)}><option>Low</option><option>Standard</option><option>High</option></HudSelect></label>
        <HudFacts items={[{ label: 'Labels', value: 'Selected objects' }, { label: 'Map scale', value: <HudValue>100%</HudValue> }]} />
        {actionState === 'disabled' && <HudText variant="secondary">Apply is unavailable in this state example. Cancel and Reset remain usable.</HudText>}
        {overflowing && Array.from({ length: 12 }, (_, index) => <section key={index} className={styles.group}><HudHeading variant="section" level={4}>Display group {index + 1}</HudHeading><HudText>Supporting settings and explanations can extend beyond the visible area. Only this content region scrolls.</HudText><HudFacts items={[{ label: 'Quality', value: detail }, { label: 'Visibility', value: 'Automatic' }]} /></section>)}
      </section>
      <HudActionBand actions={count === 2 ? [cancel, primary] : [cancel, primary, reset]} label={`${count} card actions`} />
    </HudCardShell>
    <HudText variant="caption" role="status" className={styles.notice}>{notice || 'Layout study only. No game settings are changed.'}</HudText>
  </article>
}

function CardLayoutStudy() {
  const [height, setHeight] = useState('fixed')
  const [content, setContent] = useState('short')
  const [actionState, setActionState] = useState<ActionState>('ready')
  const [labels, setLabels] = useState('normal')
  const [active, setActive] = useState<2 | 3>(2)
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}><HudHeading level={1}>Card layout · smoked crystal</HudHeading><HudText variant="secondary">Integrated action cells with static glass facets. Hover, press, or Tab to the actions to inspect their live states.</HudText></header>
    <div className={styles.controls}>
      <label><HudText variant="label">Card height</HudText><HudSelect aria-label="Card height" value={height} onChange={event => setHeight(event.target.value)}><option value="fixed">Fixed workspace</option><option value="natural">Fit content, up to viewport</option></HudSelect></label>
      <label><HudText variant="label">Content</HudText><HudSelect aria-label="Content length" value={content} onChange={event => setContent(event.target.value)}><option value="short">Short content</option><option value="overflow">Overflowing content</option></HudSelect></label>
      <label><HudText variant="label">Action state</HudText><HudSelect aria-label="Action state" value={actionState} onChange={event => setActionState(event.target.value as ActionState)}><option value="ready">Ready / live interaction</option><option value="disabled">Primary disabled</option><option value="pending">Primary pending</option></HudSelect></label>
      <label><HudText variant="label">Labels</HudText><HudSelect aria-label="Action labels" value={labels} onChange={event => setLabels(event.target.value)}><option value="normal">Normal labels</option><option value="long">Long labels</option></HudSelect></label>
    </div>
    <div className={styles.tabs} role="group" aria-label="Action layout"><HudButton aria-pressed={active === 2} onClick={() => setActive(2)}>2 actions</HudButton><HudButton aria-pressed={active === 3} onClick={() => setActive(3)}>3 actions</HudButton></div>
    <div className={styles.examples}>{([2, 3] as const).map(count => <div key={count} className={styles.example} data-active={active === count}><LayoutSample count={count} overflowing={content === 'overflow'} natural={height === 'natural'} actionState={actionState} longLabels={labels === 'long'} /></div>)}</div>
  </main>
}

const meta = { title: 'HUD/Card Layout', component: CardLayoutStudy, parameters: { layout: 'fullscreen', docs: { description: { component: 'Smoked-crystal action band under visual review, composed with the accepted HudCardShell. Uses shared HudControls, typography and band tokens. Stationary layout composition remains story-only; travel is unchanged.' } } } } satisfies Meta<typeof CardLayoutStudy>
export default meta
type Story = StoryObj<typeof meta>
export const StationaryActions: Story = {}
