'use client'

import { useEffect, useRef, useState } from 'react'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudCardBack, HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudButton } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import type { HudTaskTitle } from '@/components/hud/hud-card-title'
import { ObjectSearchCard } from '../ObjectSearchCard'
import { emptyObjectSearch, type ObjectSearchValue } from '../ObjectSearch'
import { MiningCardContent, MiningCardActions, type MiningCardProps } from '../MiningCard'
import { fleetFixture } from '@/components/fleet/fleet-status-study/fixtures'
import type { ResourceKind } from '@/lib/types/system-space'
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
  const [queries, setQueries] = useState<Record<'fleets' | 'objects', ObjectSearchValue>>({ fleets: { ...emptyObjectSearch, type: 'fleets' }, objects: { ...emptyObjectSearch, type: 'resource-sites' } })
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<View>(situation === 'accepted' || situation === 'running' ? 'status' : situation !== 'ready' ? 'setup' : entry === 'fleet' ? 'fleets' : 'objects')
  const [history, setHistory] = useState<View[]>(situation !== 'ready' ? ['overview'] : [])
  const [kind, setKind] = useState<ResourceKind>('metals')
  const [quantity, setQuantity] = useState('80')
  const [fleetSelected, setFleetSelected] = useState(situation !== 'ready')
  const [objectSelected, setObjectSelected] = useState(situation !== 'ready')
  const [state, setState] = useState<Situation>(situation)
  const pending = useRef(false)
  const running = state === 'accepted' || state === 'running'
  const tons = Number(quantity)
  const valid = fleetSelected && objectSelected && Number.isFinite(tons) && tons > 0 && tons <= 80
  const disabled = !valid || state === 'blocked' || state === 'pending' || running
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

  const model = <div className={styles.model} data-slot="model-preview">
    <SpacecraftPreview kind="ship" objectId="mining-placement-seed" label="Generalist ship" showInstructions={false} accentColor={0x91d9ec} />
  </div>
  const cardProps: MiningCardProps = {
    fleet: fleetFixture({ id: 'peregrine', name: 'Peregrine', attachedTo: 'nereid', roster: { ships: [{ class: 'seed' }, { class: 'seed' }, { class: 'seed' }], cargo: { fuel: 20 }, cargoCapacity: 100, freeHold: 80, miningRate: 12 / 60000 } }),
    target: { id: 'nereid', name: host, type: 'belt', space: { X: 0, Y: 0, Z: 0 }, size: 1, resources: [{ kind: 'metals', richness: 0.68 }, { kind: 'volatiles', richness: 0.32 }] },
    kind, quantity, onKind: setKind, onQuantity: value => { setQuantity(value); if (state === 'failure') setState('ready') },
    onStart: start, onRetry: () => {}, onBack: goBack, backDestination: history.at(-1) === 'objects' ? 'objects' : history.at(-1) === 'fleets' ? 'fleets' : 'fleet',
    worldTime: 1000, scale: 1, pending: state === 'pending',
    blocker: state === 'blocked' ? 'Movement channel occupied. Mining is unavailable.' : null,
    error: state === 'failure' ? 'Mining could not start. Your choices are saved; try again.' : null,
    action: view === 'status' ? { id: 'fixture-mine', actor: 'peregrine', scope: 'Solace', type: 'mine', status: 'running', committedAt: 1000, eta: 1000 + tons / (12 / 60000), worldTime: 1000, params: { kind, tons } } : null,
  }
  const inspector = <>
    <div className={styles.identity}><HudObjectThumbnail kind="resource-site" /><div><HudHeading size="compact">{host}</HudHeading><HudText variant="secondary">Resource host · metals, volatiles</HudText></div></div>
    <HudText variant="secondary">{fleetSelected ? 'Peregrine is attached here.' : 'Choose an attached fleet to mine this belt.'}</HudText>
    <HudFacts layout="rows" items={[{ label: 'Metals richness', value: <HudValue>68%</HudValue> }, { label: 'Volatiles richness', value: <HudValue>32%</HudValue> }]} />
  </>
  const overview = <HudSection aria-label="Fleet overview">
    {model}
    <HudHeading variant="section">{running ? 'Mining' : 'Attached · ready'}</HudHeading>
    <HudText variant="secondary">{host}</HudText>
    <HudFacts layout="rows" items={[{ label: 'Free hold', value: <HudValue>80 t</HudValue> }, { label: 'Ships', value: <HudValue>3 generalists</HudValue> }]} />
    {running && <HudText>Mining {kind} · target {quantity} t</HudText>}
  </HudSection>
  const title = view === 'setup' || view === 'status' ? miningTitle : view === 'resource' ? host : view === 'fleets' ? 'Fleets' : view === 'objects' ? 'Objects' : 'Peregrine · Fleet status'
  const previous = history.at(-1)
  const back = previous ? ({ fleets: 'fleets', objects: 'objects', overview: 'fleet', resource: 'resource', setup: 'mining setup', status: 'mining status' } as const)[previous] : null
  const footer = view === 'setup' || view === 'status' ? <MiningCardActions {...cardProps} /> : view === 'overview'
    ? <HudActionBand actions={[{ id: 'fleet-next', label: running ? 'View mining' : 'Choose object', onClick: () => navigate(running ? 'status' : 'objects') }]} /> : view === 'resource'
      ? <HudActionBand actions={[{ id: 'object-next', label: running ? 'View mining' : 'Choose fleet', onClick: () => navigate(running ? 'status' : 'fleets') }]} /> : undefined

  return <main className={`dark ${styles.stage}`}>
    {!open && <HudButton className={styles.launcher} onClick={() => setOpen(true)}><HudObjectThumbnail kind={fleetSelected ? 'fleet' : 'resource-site'} />{running ? 'Peregrine · Mining' : fleetSelected ? 'Open Peregrine' : objectSelected ? 'Open resource' : entry === 'fleet' ? 'Open fleets' : 'Open objects'}</HudButton>}
    {view === 'fleets' || view === 'objects' ? <ObjectSearchCard hidden={!open} showPresets={false} className={styles.card}
      title={{ search: view === 'fleets' ? 'command-fleet' : fleetSelected ? 'mining-target' : 'objects', scope: 'Solace', fleet: view === 'objects' && fleetSelected ? 'Peregrine' : null, object: view === 'fleets' && objectSelected ? host : null }}
      items={view === 'fleets' ? [{ id: 'peregrine', name: 'Peregrine', kind: 'fleet', category: 'owned', subtitle: '3 generalist ships · 80 t free hold · attached here' }]
        : [{ id: 'nereid', name: host, kind: 'belt', resourceSite: true, resources: ['metals', 'volatiles'], subtitle: 'Metals · Volatiles' }]}
      value={queries[view]} onChange={value => setQueries(previous => ({ ...previous, [view]: value }))}
      onSelect={() => { if (view === 'fleets') { setFleetSelected(true); navigate(objectSelected ? running ? 'status' : 'setup' : 'overview') } else { setObjectSelected(true); navigate(fleetSelected ? running ? 'status' : 'setup' : 'resource') } }}
      onBack={back ? goBack : undefined} backDestination={back ?? undefined} onClose={() => setOpen(false)} />
    : <HudCardShell hidden={!open} paused={!open} title={title} className={styles.card} onClose={() => setOpen(false)} closeLabel="Close mining card" footer={footer}>
      {back && view !== 'setup' && view !== 'status' && <HudCardBack destination={back} disabled={state === 'pending'} onClick={goBack} />}
      {view === 'setup' || view === 'status' ? <MiningCardContent {...cardProps} /> : view === 'resource' ? inspector : overview}
      {overflow && Array.from({ length: 4 }, (_, index) => <HudText key={index} variant="secondary">Survey sector {index + 1} · exposed material and dispersed fragments across the outer belt.</HudText>)}
    </HudCardShell>}
  </main>
}
