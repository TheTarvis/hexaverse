'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { HudIcon } from '@/components/hud/HudIcon'
import { Input } from '@/components/catalyst/input'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudCardBack, HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudButton, HudSelect } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import type { HudTaskTitle } from '@/components/hud/hud-card-title'
import { SpacecraftPreview } from '../SpacecraftPreview'
import styles from './mining-placement-study.module.css'

type Situation = 'ready' | 'blocked' | 'failure' | 'pending' | 'accepted' | 'running'
type View = 'fleets' | 'objects' | 'overview' | 'resource' | 'setup' | 'status'
type Props = { situation: Situation; overflow: boolean; entry: 'fleet' | 'resource' }

/** Single-card journey prototype. All reads and the acceptance response are fictional. */
export function MiningPlacementStudy(props: Props) {
  return <MiningSetup key={`${props.entry}:${props.situation}`} {...props} />
}

function MiningSetup({ situation, overflow, entry }: Props) {
  const quantityId = useId()
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<View>(situation === 'accepted' || situation === 'running' ? 'status' : situation !== 'ready' ? 'setup' : entry === 'fleet' ? 'fleets' : 'objects')
  const [history, setHistory] = useState<View[]>(situation !== 'ready' ? ['overview'] : [])
  const [shipsOpen, setShipsOpen] = useState(false)
  const [kind, setKind] = useState('iron')
  const [quantity, setQuantity] = useState('80')
  const [fleetSelected, setFleetSelected] = useState(situation !== 'ready')
  const [objectSelected, setObjectSelected] = useState(situation !== 'ready')
  const [state, setState] = useState<Situation>(situation)
  const pending = useRef(false)
  const running = state === 'accepted' || state === 'running'
  const tons = Number(quantity)
  const valid = fleetSelected && Number.isFinite(tons) && tons > 0 && tons <= 80
  const disabled = !valid || state === 'blocked' || state === 'pending' || running
  const seconds = Math.ceil(tons / 12 * 60)
  const duration = valid ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : 'Unavailable'
  const host = overflow ? 'Nereid outer belt — northern extraction field and survey anchorage' : 'Nereid outer belt'
  const miningTitle: HudTaskTitle = { fleet: fleetSelected ? 'Peregrine' : null, action: 'mining', object: host }

  useEffect(() => {
    if (state !== 'pending' || situation === 'pending') return
    const timer = window.setTimeout(() => { pending.current = false; setState('accepted'); setHistory(['overview']); setView('status') }, 900)
    return () => window.clearTimeout(timer)
  }, [state, situation])

  function start() {
    if (pending.current || disabled) return
    pending.current = true
    setState('pending')
  }
  function navigate(next: View) { setHistory(previous => [...previous, view]); setView(next) }
  function goBack() {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(items => items.slice(0, -1))
    setView(previous)
  }
  function openSetup() { navigate(running ? 'status' : 'setup') }

  const model = <div className={styles.model} data-slot="model-preview">
    <SpacecraftPreview kind="ship" objectId="mining-placement-seed" label="Generalist ship" showInstructions={false} accentColor={0x91d9ec} />
  </div>
  const commit = { id: 'mine', label: 'Start mining', onClick: start, disabled, pending: state === 'pending', pendingLabel: 'Starting mining…' }
  const setup = <HudSection aria-label="Mining setup">
    {fleetSelected ? model : <div className={styles.awaitingFleet}><HudText variant="secondary">Choose a fleet to preview its ships.</HudText></div>}
    <>
      <div className={styles.formFields}>
        <label className={styles.field}><HudText variant="label">Resource</HudText><HudSelect aria-label="Resource" value={kind} disabled={!fleetSelected || state === 'pending'} onChange={event => setKind(event.target.value)}><option value="iron">Iron</option><option value="silicates">Silicates</option></HudSelect></label>
        <div className={styles.field}><label htmlFor={quantityId} className="hud-type-label">Quantity (t)</label><div className={styles.quantityRow}>
          <Input id={quantityId} aria-label="Quantity in tonnes" type="number" min={0} max={80} step="any" value={quantity} disabled={!fleetSelected || state === 'pending'} onChange={event => { setQuantity(event.target.value); if (state === 'failure') setState('ready') }} />
          <HudButton variant="quiet" aria-label="Set maximum mining quantity" disabled={!fleetSelected || state === 'pending'} onClick={() => { setQuantity('80'); if (state === 'failure') setState('ready') }}>Max</HudButton>
        </div></div>
      </div>
      <div className={styles.estimate}>
        <HudText variant="label">Estimated duration</HudText><HudValue>{duration}</HudValue>
      </div>
      {fleetSelected && <HudText variant="caption">80 t free hold · 12 t/min mining rate</HudText>}
      {fleetSelected && !valid && <HudText role="alert">Choose an amount greater than 0 and no more than 80 tonnes.</HudText>}
      {state === 'blocked' && <HudText role="status">Movement channel occupied. Mining is unavailable.</HudText>}
      {state === 'failure' && <HudText role="alert">Mining could not start. Your choices are saved; try again.</HudText>}
    </>
    {fleetSelected && <HudButton presentation="row" aria-expanded={shipsOpen} onClick={() => setShipsOpen(value => !value)}>Ships · 3<HudIcon icon={ChevronDownIcon} size={16} className={shipsOpen ? styles.expandedChevron : undefined} /></HudButton>}
    {fleetSelected && shipsOpen && <HudText variant="secondary">3 generalist ships · attached to this resource host</HudText>}
  </HudSection>

  const inspector = <>
    <div className={styles.identity}><HudObjectThumbnail kind="resource-site" /><div><HudHeading size="compact">{host}</HudHeading><HudText variant="secondary">Resource host · iron, silicates</HudText></div></div>
    <HudText variant="secondary">{fleetSelected ? 'Peregrine is attached here.' : 'Choose an attached fleet to mine this belt.'}</HudText>
    <HudFacts layout="rows" items={[{ label: 'Iron richness', value: <HudValue>68%</HudValue> }, { label: 'Silicate richness', value: <HudValue>32%</HudValue> }]} />
  </>
  const overview = <HudSection aria-label="Fleet overview">
    {model}
    <HudHeading variant="section">{running ? 'Mining' : 'Attached · ready'}</HudHeading>
    <HudText variant="secondary">{host}</HudText>
    <HudFacts layout="rows" items={[{ label: 'Free hold', value: <HudValue>80 t</HudValue> }, { label: 'Ships', value: <HudValue>3 generalists</HudValue> }]} />
    {running && <HudText>Mining {kind} · target {quantity} t</HudText>}
  </HudSection>
  const status = <HudSection aria-label="Mining status">
    {model}
    <HudHeading variant="section">Mining</HudHeading>
    <HudText role="status">{state === 'accepted' ? 'Mining started' : 'Mining in progress'}</HudText>
    <HudFacts layout="rows" items={[
      { label: 'Resource', value: kind === 'iron' ? 'Iron' : 'Silicates' },
      { label: 'Target quantity', value: <HudValue>{quantity} t</HudValue> },
      { label: 'Estimated duration', value: <HudValue>{duration}</HudValue> },
    ]} />
    <HudText variant="secondary">You can close this card. Mining continues.</HudText>
  </HudSection>
  const fleetList = <HudSection aria-label="Choose fleet">
    <HudHeading variant="section">{objectSelected ? 'Fleets attached here' : 'Your fleets'}</HudHeading>
    <HudButton presentation="row" onClick={() => { setFleetSelected(true); navigate('overview') }}>
      <HudObjectThumbnail kind="fleet" /><span className={styles.choiceText}><span className="hud-type-compact">Peregrine</span><span className="hud-type-secondary">3 generalist ships · 80 t free hold</span></span>
    </HudButton>
  </HudSection>
  const objectList = <HudSection aria-label="Choose object">
    <HudHeading variant="section">{fleetSelected ? 'Objects at Peregrine' : 'Known objects'}</HudHeading>
    <HudButton presentation="row" onClick={() => { setObjectSelected(true); navigate('resource') }}>
      <HudObjectThumbnail kind="resource-site" /><span className={styles.choiceText}><span className="hud-type-compact">{host}</span><span className="hud-type-secondary">Iron · Silicates</span></span>
    </HudButton>
  </HudSection>
  const title = view === 'setup' || view === 'status' ? miningTitle : view === 'resource' ? host : view === 'fleets' ? 'Fleets' : view === 'objects' ? 'Objects' : 'Peregrine · Fleet status'
  const previous = history.at(-1)
  const back = previous ? ({ fleets: 'fleets', objects: 'objects', overview: 'fleet', resource: 'resource', setup: 'mining setup', status: 'mining status' } as const)[previous] : null
  const footer = view === 'setup' ? <HudActionBand actions={[commit]} /> : view === 'overview'
    ? <HudActionBand actions={[{ id: 'fleet-next', label: running ? 'View mining' : objectSelected ? 'Mine here' : 'Choose object', onClick: () => objectSelected || running ? openSetup() : navigate('objects') }]} /> : view === 'resource'
      ? <HudActionBand actions={[{ id: 'object-next', label: running ? 'View mining' : fleetSelected ? 'Mine here' : 'Choose fleet', onClick: () => fleetSelected || running ? openSetup() : navigate('fleets') }]} /> : undefined

  return <main className={`dark ${styles.stage}`}>
    {!open && <HudButton className={styles.launcher} onClick={() => setOpen(true)}><HudObjectThumbnail kind={fleetSelected ? 'fleet' : 'resource-site'} />{running ? 'Peregrine · Mining' : fleetSelected ? 'Open Peregrine' : objectSelected ? 'Open resource' : entry === 'fleet' ? 'Open fleets' : 'Open objects'}</HudButton>}
    <HudCardShell hidden={!open} paused={!open} title={title} className={styles.card} onClose={() => setOpen(false)} closeLabel="Close mining card" footer={footer}>
      {back && <HudCardBack destination={back} disabled={state === 'pending'} onClick={goBack} />}
      {view === 'fleets' ? fleetList : view === 'objects' ? objectList : view === 'setup' ? setup : view === 'status' ? status : view === 'resource' ? inspector : overview}
      {overflow && Array.from({ length: 4 }, (_, index) => <HudText key={index} variant="secondary">Survey sector {index + 1} · exposed material and dispersed fragments across the outer belt.</HudText>)}
    </HudCardShell>
  </main>
}
