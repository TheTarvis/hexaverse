import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ArrowLeftIcon, MagnifyingGlassIcon, Cog6ToothIcon, TrashIcon } from '@heroicons/react/24/outline'
import { HudCardShell, HudSection } from './HudCardShell'
import { HudButton, HudIconButton, HudSelect } from './HudControls'
import { HudActionBand } from './HudActionBand'
import { HudHeading, HudText, HudValue } from './HudTypography'
import styles from './hud-buttons.stories.module.css'

type State = 'live' | 'disabled' | 'pending'
function CommandExample({ crystal, state }: { crystal: boolean; state: State }) {
  const [active, setActive] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const busy = !!active || state === 'pending'
  const appearance = crystal ? 'crystal' as const : 'standard' as const
  const activate = (id: string) => {
    if (busy || state === 'disabled') return
    setActive(id); setNotice('')
    timer.current = setTimeout(() => { setActive(null); setNotice(`${id} selected in this preview.`); timer.current = null }, 700)
  }
  return <article className={styles.example} aria-label={crystal ? 'Crystal command example' : 'Standard command example'}>
    <header className={styles.exampleTitle}><HudHeading size="compact">{crystal ? 'Smoked crystal' : 'Standard controls'}</HudHeading><HudText variant="secondary">{crystal ? 'Same material as the accepted footer, on standalone buttons.' : 'Explicit standard appearance for comparison only.'}</HudText></header>
    <HudCardShell title="Command" lighting="none" className={styles.card}>
      <div className={styles.command}>
        <div className={styles.telemetry}><HudText variant="label">Credits</HudText><HudValue>₡ 1,000</HudValue><HudText variant="secondary">T+ 291d 22:44 · ×1</HudText></div>
        <div className={styles.row}>
          <HudButton appearance={appearance} variant="primary" pending={active === 'Travel here' || state === 'pending'} pendingLabel="Opening…" disabled={busy || state === 'disabled'} onClick={() => activate('Travel here')}>Travel here</HudButton>
          <HudButton appearance={appearance} disabled={busy || state === 'disabled'} onClick={() => activate('Command fleet')}>Command fleet</HudButton>
        </div>
        <HudSection><HudText variant="label">Selected fleet</HudText><HudHeading variant="section" level={3}>Fleet 02b8e818 · 1 ship</HudHeading><HudText variant="secondary">Quaude Prime -3.6</HudText><HudText variant="secondary">Docked</HudText><div className={styles.row}><HudButton appearance={appearance} variant="primary" pending={active === 'Open fleet system'} pendingLabel="Opening…" disabled={busy || state === 'disabled'} onClick={() => activate('Open fleet system')}>Open fleet system</HudButton></div></HudSection>
        <HudSection><HudHeading variant="section">Sensors</HudHeading><HudText variant="secondary">Focused scan</HudText><div className={styles.row}><HudButton appearance={appearance} variant="quiet" disabled={busy || state === 'disabled'} onClick={() => activate('Inspect target')}>Inspect target</HudButton></div></HudSection>
      </div>
    </HudCardShell>
    <HudText role="status" variant="caption">{notice || 'Fictional context. No navigation or fleet orders.'}</HudText>
  </article>
}

function ButtonStudy() {
  const [state, setState] = useState<State>('live')
  const [active, setActive] = useState('crystal')
  const [chosen, setChosen] = useState(false)
  const [notice, setNotice] = useState('')
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}><HudHeading level={1}>Smoked crystal · beyond the footer</HudHeading><HudText variant="secondary">Opt-in material preview for standalone, inline and icon buttons. Shared game actions default to Lens; legacy app callers await migration.</HudText></header>
    <div className={styles.tools}><label><HudText variant="label">Example state</HudText><HudSelect aria-label="Example state" value={state} onChange={event => setState(event.target.value as State)}><option value="live">Live interaction</option><option value="disabled">Disabled</option><option value="pending">Primary pending</option></HudSelect></label></div>
    <div className={styles.tabs} role="group" aria-label="Appearance example"><HudButton aria-pressed={active === 'standard'} onClick={() => setActive('standard')}>Standard</HudButton><HudButton aria-pressed={active === 'crystal'} onClick={() => setActive('crystal')}>Smoked crystal</HudButton></div>
    <div className={styles.comparison}><div className={styles.variant} data-active={active === 'standard'}><CommandExample crystal={false} state={state} /></div><div className={styles.variant} data-active={active === 'crystal'}><CommandExample crystal state={state} /></div></div>
    <section className={styles.samples} aria-label="Crystal control variants"><HudHeading size="compact">Shared variants</HudHeading>
      <div className={styles.row}><HudButton appearance="crystal" variant="primary" onClick={() => setNotice('Primary action')}>Primary action</HudButton><HudButton appearance="crystal" onClick={() => setNotice('Secondary action')}>Secondary action</HudButton><HudButton appearance="crystal" variant="quiet" onClick={() => setNotice('Quiet action')}>Quiet action</HudButton></div>
      <div className={styles.row}><HudIconButton appearance="crystal" variant="secondary" icon={ArrowLeftIcon} label="Back" onClick={() => setNotice('Back')} /><HudIconButton appearance="crystal" variant="secondary" icon={MagnifyingGlassIcon} label="Search" onClick={() => setNotice('Search')} /><HudIconButton appearance="crystal" variant="secondary" icon={Cog6ToothIcon} label="Settings" onClick={() => setNotice('Settings')} /><HudButton appearance="crystal" aria-pressed={chosen} onClick={() => setChosen(value => !value)}>Selected toggle</HudButton></div>
      <div className={styles.row}><HudButton appearance="crystal" disabled>Unavailable</HudButton><HudButton appearance="crystal" variant="primary" pending pendingLabel="Applying…">Apply changes</HudButton><HudIconButton appearance="crystal" variant="secondary" icon={MagnifyingGlassIcon} label="Searching" pending /><HudButton appearance="crystal" variant="primary" onClick={() => setNotice('Long label activated')}>Open outer-system expedition fleet</HudButton></div>
      <HudHeading size="compact">One shared action interface</HudHeading>
      <div className={styles.row}>
        <HudButton href="/" target="_blank" rel="noreferrer">Open galaxy</HudButton>
        <HudButton href="/" disabled>Unavailable link</HudButton>
        <HudIconButton href="/" icon={ArrowLeftIcon} label="Galaxy link" />
      </div>
      <div className={styles.row}>
        <HudButton presentation="row" aria-pressed={chosen} onClick={() => setChosen(value => !value)}>Structured fleet row · selected state</HudButton>
        <HudIconButton presentation="chrome" icon={Cog6ToothIcon} label="Chrome settings example" onClick={() => setNotice('Chrome settings preview')} />
        <HudButton presentation="map" aria-label="Map target example" onClick={() => setNotice('Map target preview')}>◎</HudButton>
      </div>
      <HudHeading size="compact">Cancel, interrupt and destructive actions</HudHeading>
      <HudText variant="secondary">Cancel leaves an uncommitted choice. Stop interrupts an active order. Destructive actions name what will be removed.</HudText>
      <div className={styles.row}>
        <HudButton appearance="crystal" onClick={() => setNotice('Cancelled this preview choice.')}>Cancel</HudButton>
        <HudButton appearance="crystal" tone="warning" onClick={() => setNotice('Stop travel preview only.')}>Stop travel</HudButton>
        <HudButton appearance="crystal" variant="primary" tone="danger" onClick={() => setNotice('Delete preset preview only. Nothing was deleted.')}>Delete preset</HudButton>
        <HudIconButton appearance="crystal" variant="secondary" tone="danger" icon={TrashIcon} label="Delete preset icon" onClick={() => setNotice('Delete preset icon preview only.')} />
      </div>
      <div className={styles.row}>
        <HudButton appearance="crystal" pending pendingLabel="Working…">Neutral task</HudButton>
        <HudButton appearance="crystal" tone="warning" pending pendingLabel="Stopping…">Stop travel</HudButton>
        <HudButton appearance="crystal" variant="primary" tone="danger" pending pendingLabel="Deleting…">Delete preset</HudButton>
        <HudButton appearance="crystal" tone="danger" disabled>Delete unavailable</HudButton>
      </div>
      <HudText variant="label">Destructive footer</HudText>
      <HudActionBand label="Destructive example actions" actions={[
        { id: 'cancel', label: 'Cancel', onClick: () => setNotice('Kept the preview preset.') },
        { id: 'delete', label: 'Delete preset', tone: 'danger', onClick: () => setNotice('Destructive footer preview only. Nothing was deleted.') },
      ]} />
      <HudText role="status" variant="caption">{notice || 'Hover, press or Tab through the controls. Material facets stay still; working buttons show a diagonal sweep.'}</HudText>
    </section>
  </main>
}
const meta = { title: 'HUD/Buttons', component: ButtonStudy, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ButtonStudy>
export default meta
type Story = StoryObj<typeof meta>
export const SmokedCrystal: Story = {}
