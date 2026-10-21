'use client'

// Active Storybook study: selected activity-first hierarchy.
// Fixtures only. Keep the accepted compact/disclosure direction; no live mutations.
import { useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudBackButton, HudButton, HudSearchInput, HudSelect } from '@/components/hud/HudControls'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudProgress } from '@/components/hud/HudProgress'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { HudActionBand } from '@/components/hud/HudActionBand'
import styles from './fleet-status-study.module.css'

const scenarios = {
  ready: { label: 'Ready', activity: 'Docked', context: 'Nereid Outer System Research Anchorage', location: 'Nereid system', progress: null, remaining: '', task: 'Review travel' },
  travelling: { label: 'Travelling', activity: 'Travelling to Nereid', context: 'Nereid Outer System Research Anchorage', location: 'Nereid system', progress: 65, remaining: '1m 03s', task: 'Return to travel' },
  mining: { label: 'Mining + sensors', activity: 'Mining iron', context: 'Nereid Outer Belt · 12 t ordered', location: 'Nereid system', progress: 42, remaining: '2m 18s', task: 'Return to mining' },
  remote: { label: 'Remote fleet', activity: 'Docked', context: 'Aurelia Deep Space Research Anchorage', location: 'Aurelia system · outside this view', progress: null, remaining: '', task: 'Open fleet system' },
  transit: { label: 'Lane transit', activity: 'In transit to Aurelia', context: 'Nereid → Aurelia', location: 'Between systems', progress: 38, remaining: '4m 12s', task: 'View destination' },
  confirming: { label: 'Awaiting confirmation', activity: 'Awaiting arrival confirmation', context: 'Nereid Outer System Research Anchorage', location: 'Nereid system', progress: 100, remaining: '', task: 'Return to travel' },
  unavailable: { label: 'Unavailable reads', activity: 'Activity unavailable', context: 'Fleet readings could not be loaded.', location: 'Location unavailable', progress: null, remaining: '', task: 'Retry readings' },
  completed: { label: 'Completed scan', activity: 'Docked', context: 'Nereid Outer System Research Anchorage', location: 'Nereid system', progress: null, remaining: '', task: 'View scan report' },
  failed: { label: 'Failed scan', activity: 'Docked', context: 'Nereid Outer System Research Anchorage', location: 'Nereid system', progress: null, remaining: '', task: 'Return to sensors' },
} as const

type Scenario = keyof typeof scenarios

function FleetExample({ scenario, render }: { scenario: Scenario; render?: (content: ReactNode, footer: ReactNode) => ReactNode }) {
  const id = useId()
  const launcher = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  const [cargo, setCargo] = useState(false)
  const [ships, setShips] = useState(false)
  const [task, setTask] = useState(false)
  const [notice, setNotice] = useState('')
  const [readingsRecovered, setReadingsRecovered] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)
  const data = scenarios[readingsRecovered && scenario === 'unavailable' ? 'ready' : scenario]
  const unavailable = scenario === 'unavailable' && !readingsRecovered
  const close = () => { setOpen(false); launcher.current?.focus() }
  const condition = <HudFacts layout="rows" items={[
    { label: 'Fuel', value: <HudValue>{unavailable ? 'Unavailable' : '18 t'}</HudValue> },
    { label: 'Hold used', value: <HudValue>{unavailable ? 'Unavailable' : '72 / 120 t'}</HudValue> },
  ]} />
  const activity = <div className={styles.activity}>
    <HudHeading variant="section" level={4}>{stopped ? 'Awaiting updated fleet status' : data.activity}</HudHeading>
    <HudText variant="secondary">{data.context}</HudText>
    {data.progress !== null && !stopped && <div className={styles.meter}>
      <HudProgress label={`${data.label} progress`} value={data.progress} />
      <div className={styles.figures}><HudValue>{data.progress}%</HudValue><HudText variant="secondary">{data.remaining ? <><HudValue>{data.remaining}</HudValue> remaining</> : 'Waiting for fleet report'}</HudText></div>
    </div>}
    {scenario === 'mining' && <div className={styles.sensor}>
      <HudText>Focused scan · Nereid Outer Belt</HudText>
      <HudText variant="secondary"><HudValue>38s</HudValue> remaining · running alongside mining</HudText>
      <HudButton variant="quiet" onClick={() => { setTask(true); setNotice('Focused scan task opened (simulated).') }}>Return to sensors</HudButton>
    </div>}
    {scenario === 'completed' && <HudText role="status">Focused scan complete. Report ready.</HudText>}
    {scenario === 'failed' && <HudText role="status">Focused scan failed. Open sensors to review and retry.</HudText>}
    {unavailable && <HudText role="status">Fuel, cargo and ships are unavailable until readings recover.</HudText>}
  </div>
  const openTask = () => {
    if (unavailable) { setReadingsRecovered(true); setNotice('Retry succeeded (simulated). Fleet readings restored.'); return }
    setTask(true)
    setNotice(`${data.task} opened (simulated).`)
  }

  const content = (
        <div className={render ? styles.hostedBody : styles.body}>
          {task ? <>
            <HudBackButton destination="fleet status" autoFocus onClick={() => setTask(false)} />
            <HudHeading size="compact">{notice.startsWith('Focused scan') ? 'Focused scan' : data.task}</HudHeading>
            <HudText>This is the return destination only. The task interaction will use its reviewed design during integration.</HudText>
            <HudText variant="secondary">Peregrine Deep Space Expedition · {data.context}</HudText>
            {scenario === 'travelling' && <HudButton tone="danger" pending={stopping} disabled={stopped} onClick={() => { setStopping(true); setNotice('Stop requested (simulated). Use the fixture control below to confirm.')}}>Stop travel</HudButton>}
            {stopping && <HudButton onClick={() => { setStopping(false); setStopped(true); setNotice('Stop accepted (simulated). Awaiting a fresh fleet report.')}}>Simulate Stop acceptance</HudButton>}
          </> : <>
            <div className={styles.identity}><HudObjectThumbnail kind="fleet" /><div><HudHeading size="compact">Peregrine Deep Space Expedition</HudHeading><HudText variant="secondary">Command fleet · {data.location}</HudText></div></div>
            {activity}{condition}
            <div className={styles.details}>
              <HudButton presentation="row" aria-expanded={cargo} aria-controls={`${id}-cargo`} disabled={unavailable} onClick={() => setCargo(!cargo)}><HudIcon icon={cargo ? ChevronUpIcon : ChevronDownIcon} size={16} />Cargo{!unavailable && ' · 48 t free'}</HudButton>
              {cargo && !unavailable && <div id={`${id}-cargo`}><HudFacts layout="rows" items={[
                { label: 'Fuel (in hold)', value: <HudValue>18 t</HudValue> },
                { label: 'Iron', value: <HudValue>42 t</HudValue> },
                { label: 'Silicates', value: <HudValue>12 t</HudValue> },
                { label: 'Free space', value: <HudValue>48 t</HudValue> },
              ]} /><HudText variant="caption">Cargo is pooled across the fleet. Fuel occupies hold space.</HudText></div>}
              <HudButton presentation="row" aria-expanded={ships} aria-controls={`${id}-ships`} disabled={unavailable} onClick={() => setShips(!ships)}><HudIcon icon={ships ? ChevronUpIcon : ChevronDownIcon} size={16} />Ships{!unavailable && ' · 3'}</HudButton>
              {ships && !unavailable && <HudSection id={`${id}-ships`}><HudFacts layout="rows" items={[{ label: 'Seed hull', value: <HudValue>× 3</HudValue> }, { label: 'Combined hold', value: <HudValue>120 t</HudValue> }]} /><HudText variant="caption">Composition by class. Individual ship roles and cargo allocation are outside this review.</HudText></HudSection>}
            </div>
          </>}
        </div>
  )
  const footer = !task && <HudActionBand label="Fleet status actions" actions={[
          { id: 'focus', label: scenario === 'transit' ? 'Focus destination' : 'Focus fleet', disabled: unavailable || scenario === 'remote', onClick: () => setNotice('Map focus changed (simulated). Fleet status stays open.') },
          { id: 'task', label: data.task, onClick: openTask },
        ]} />
  const noticeContent = <HudText className={styles.notice} role="status" variant="caption">{notice || 'Fictional readings. Dismissal preserves ongoing work and expanded details.'}</HudText>
  if (render) return render(<>{content}{noticeContent}</>, footer)

  return <article className={styles.example} aria-label="Activity-first fleet status">
    <header className={styles.optionHeading}>
      <HudHeading variant="section">Activity first</HudHeading>
      <HudText variant="secondary">Selected hierarchy · current work, then fuel and hold.</HudText>
    </header>
    <div className={styles.launcher}><HudButton ref={launcher} aria-expanded={open} onClick={() => setOpen(true)}>Fleet status</HudButton></div>
    <div hidden={!open}>
      <HudCardShell title={task ? 'Return to task · simulation' : 'Fleet status'} onClose={close} className={styles.card} contentClassName={styles.cardContent} footer={footer} closeLabel="Close fleet status" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
        {content}
      </HudCardShell>
    </div>
    {noticeContent}
  </article>
}

export function FleetStatusStudy() {
  const [scenario, setScenario] = useState<Scenario>('travelling')
  return <main className={`dark ${styles.stage}`}>
    <header className={styles.intro}>
      <HudHeading level={1} size="compact">Fleet status · selected direction</HudHeading>
      <HudText variant="secondary">Compact summary; cargo and ships expand separately. Fictional data and simulated outcomes. Dedicated Fleet status hosting selected; task actions remain under review.</HudText>
      <div className={styles.controls}>
        <label><HudText variant="label">Situation</HudText><HudSelect aria-label="Situation" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{Object.entries(scenarios).map(([key, data]) => <option key={key} value={key}>{data.label}</option>)}</HudSelect></label>
      </div>
    </header>
    <div className={styles.single}>
      <FleetExample key={scenario} scenario={scenario} />
    </div>
  </main>
}


/** Dedicated host journey; workspace owns framing, launchers and phone boundary. */
export function FleetStatusHostingStudy() {
  const [scenario, setScenario] = useState<Scenario>('travelling')
  const [query, setQuery] = useState('')
  const [inspecting, setInspecting] = useState(false)
  return <main className={`dark ${styles.workspaceStage}`}>
    <div className={styles.workspaceIntro}>
      <HudHeading level={1} size="compact">Fleet status · own card</HudHeading>
      <HudText variant="secondary">Fictional data. Arrange HUD contains situation controls. No live orders.</HudText>
    </div>
    <FleetExample scenario={scenario} render={(content, footer) => <HudWorkspace corporationId="storybook-fleet-status-own-host" panels={[
      { id: 'objects', label: 'Objects', children: <>
        {inspecting && <HudBackButton destination="objects" onClick={() => setInspecting(false)} />}
        <HudSearchInput aria-label="Find objects" placeholder="Find an object…" value={query} onChange={event => setQuery(event.target.value)} />
        {inspecting ? <>
          <HudHeading size="compact">Nereid Outer System Research Anchorage</HudHeading>
          <HudText variant="secondary">Station · fictional inspection</HudText>
          <HudText>Inspecting this station keeps Peregrine selected for commands.</HudText>
        </> : 'Nereid Outer System Research Anchorage'.toLowerCase().includes(query.toLowerCase()) ? <HudButton presentation="row" onClick={() => setInspecting(true)}><HudObjectThumbnail kind="station" />Nereid Outer System Research Anchorage</HudButton> : <HudText>No matching objects.</HudText>}
      </> },
      { id: 'fleets', label: 'Fleet status', children: content, footer },
    ]} settingsContent={<label className={styles.fixtureControl}><HudText variant="label">Simulated situation</HudText><HudSelect aria-label="Simulated situation" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{Object.entries(scenarios).map(([key, data]) => <option key={key} value={key}>{data.label}</option>)}</HudSelect></label>} />} />
  </main>
}
