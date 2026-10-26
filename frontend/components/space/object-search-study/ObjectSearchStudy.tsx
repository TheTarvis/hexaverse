'use client'

import { useEffect, useRef, useState } from 'react'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudCardBack, HudCardShell } from '@/components/hud/HudCardShell'
import { HudButton } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { fleetFixture } from '@/components/fleet/fleet-status-study/fixtures'
import { CompactTravelCard } from '../CompactTravelCard'
import { ObjectSearchCard } from '../ObjectSearchCard'
import { emptyObjectSearch, isObjectSearchResourceSite, type ObjectSearchEntry, type ObjectSearchValue } from '../ObjectSearch'
import styles from './object-search-study.module.css'
import { objects } from './fixtures'


type Context = 'browse' | 'travel' | 'mine' | 'fleet'
export type ObjectSearchStudyProps = {
  entry: Context
  layout: 'compact' | 'image'
  scenario: 'ready' | 'loading' | 'error' | 'empty' | 'long' | 'many'
}

/** Fixture-only journeys; all candidates, relationships, eligibility and quotes are simulated. */
export function ObjectSearchStudy(props: ObjectSearchStudyProps) {
  return <Journey key={`${props.entry}:${props.scenario}`} {...props} />
}
function Journey({ entry, layout, scenario }: ObjectSearchStudyProps) {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<'search' | 'inspect' | 'review' | 'accepted'>('search')
  const [context, setContext] = useState<Context>(entry)
  const [queries, setQueries] = useState<Partial<Record<Context, ObjectSearchValue>>>({
    fleet: { ...emptyObjectSearch, type: 'fleets', presets: { fleets: 'owned' } },
    mine: { ...emptyObjectSearch, type: 'resource-sites', presets: {} },
  })
  const [inspected, setInspected] = useState('peregrine')
  const [fleetId, setFleetId] = useState('peregrine')
  const [destinationId, setDestinationId] = useState('station')
  const [recovered, setRecovered] = useState(false)
  const host = useRef<HTMLElement>(null)
  const lastResult = useRef<string | null>(null)
  const reopen = useRef<HTMLButtonElement>(null)
  const status = recovered ? 'ready' : scenario === 'loading' ? 'loading' : scenario === 'error' ? 'error' : 'ready'
  const entries = scenario === 'empty' ? [] : scenario === 'many' ? [...objects, ...Array.from({ length: 20 }, (_, i): ObjectSearchEntry => ({ id: `station-${i}`, name: `Solace outpost ${String(i + 1).padStart(2, '0')}`, kind: 'station', subtitle: 'Station · Trade and fuel', owned: i % 2 === 0 }))]
    : objects.map(item => scenario === 'long' ? { ...item, name: `${item.name} — outer-system exploration and resupply expedition` } : item)
  const fleet = entries.find(item => item.id === fleetId) ?? objects[0]
  const destination = entries.find(item => item.id === destinationId) ?? objects[5]
  const item = entries.find(item => item.id === inspected) ?? objects[0]
  // Eligibility belongs to this fixture caller, never to the shared search component.
  const candidates = context === 'fleet' ? entries.filter(item => item.kind === 'fleet' && item.category === 'owned')
    : context === 'mine' ? entries.filter(item => isObjectSearchResourceSite(item) && item.resources?.length && !item.lastObserved)
      : context === 'travel' ? entries.filter(item => item.kind !== 'fleet' && item.kind !== 'burn' && !item.lastObserved) : entries
  const query = queries[context] ?? emptyObjectSearch
  const close = () => { setOpen(false); requestAnimationFrame(() => reopen.current?.focus()) }
  const returnToSearch = () => setView('search')
  const begin = (next: Context) => { setContext(next); setView('search') }
  const select = (id: string) => {
    lastResult.current = id
    if (context === 'browse') { setInspected(id); setView('inspect') }
    else { if (context === 'fleet') setFleetId(id); else setDestinationId(id); setView('review') }
  }
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const card = host.current?.querySelector<HTMLElement>('[data-slot="hud-card"]:not([hidden])')
      const row = view === 'search' && lastResult.current ? card?.querySelector<HTMLButtonElement>(`[data-object-id="${lastResult.current}"]`) : null
      const focus = row ?? (view !== 'search' ? card?.querySelector<HTMLButtonElement>('[data-slot="hud-card-back"] button') : null)
      focus?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, view, context])
  const wireFleet = fleetFixture({ id: fleet.id, name: fleet.name, systemId: 'solace' })
  const searchBack = context === 'browse' ? undefined : () => setView(context === 'fleet' ? 'review' : 'inspect')
  return <main ref={host} className={styles.stage} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close() } }}>
    {!open && <HudButton ref={reopen} onClick={() => setOpen(true)}>Reopen card</HudButton>}
    <div className={styles.host} hidden={!open}>
      <ObjectSearchCard showPresets={context === 'browse'} hidden={view !== 'search'} title={context === 'browse' ? { search: 'objects', scope: 'Solace' }
        : context === 'fleet' ? { search: 'command-fleet', object: destination.name, scope: 'Solace' }
          : { search: context === 'mine' ? 'mining-target' : 'travel-destination', fleet: fleet.name, scope: 'Solace' }}
        items={candidates} value={query} onChange={value => setQueries(previous => ({ ...previous, [context]: value }))} onSelect={select} layout={layout} status={status} onRetry={() => setRecovered(true)} onClose={close} onBack={searchBack} backDestination={context === 'fleet' ? 'travel review' : 'fleet'} />
      {view === 'inspect' && <HudCardShell title={item.name} className={styles.card} onClose={close} closeLabel="Close inspector"
        footer={item.category === 'owned' ? <HudActionBand actions={[{ id: 'travel', label: 'Travel', onClick: () => { setFleetId(item.id); begin('travel') } }, { id: 'mine', label: 'Mine', onClick: () => { setFleetId(item.id); begin('mine') } }]} /> : undefined}>
        <HudCardBack destination={context === 'browse' ? 'objects' : 'search'} onClick={() => { setContext('browse'); returnToSearch() }} />
        {item.kind === 'burn' ? <HudObjectThumbnail analyzed={false} size="large" /> : <HudObjectThumbnail kind={item.kind} size="large" />}
        <HudHeading size="compact">{item.name}</HudHeading><HudText>{item.subtitle}</HudText>
        {item.lastObserved && <HudText>Last observed · {item.lastObserved}. This does not establish current tracking.</HudText>}
        {item.kind === 'burn' && <HudText>Source identity, allegiance and ship composition are unknown.</HudText>}
        <HudFacts layout="rows" items={[{ label: 'System', value: 'Solace' }, { label: 'Command fleet', value: fleet.name }]} />
      </HudCardShell>}
      {view === 'review' && context !== 'mine' && <CompactTravelCard className={styles.card} fleet={wireFleet} fleets={[wireFleet]} systemId="solace" destination={destination.name} destinationKind={destination.kind} worldTime={1000} scale={1}
        quote={{ controlPoints: [], departMs: 1000, arriveMs: 181000, deltaV: 24, fuelCostTons: 18, affordable: true, strandingWarning: false }}
        onFleet={setFleetId} onChooseFleet={() => begin('fleet')} onChooseDestination={() => begin('travel')} onBack={returnToSearch} onClose={close} onRetry={() => {}} onStart={() => setView('accepted')} />}
      {view === 'review' && context === 'mine' && <HudCardShell title="Mining target selected" className={styles.card} onClose={close} closeLabel="Close mining review">
        <HudCardBack destination="mining targets" onClick={returnToSearch} />
        <HudObjectThumbnail kind={destination.kind} size="large" />
        <HudFacts layout="rows" items={[{ label: 'Fleet', value: fleet.name }, { label: 'Target', value: destination.name }, { label: 'Resources', value: destination.subtitle }]} />
        <HudText>Target selected. No mining order has been issued.</HudText>
        <HudButton presentation="chrome" onClick={() => begin('mine')}>Change mining target</HudButton>
      </HudCardShell>}
      {view === 'accepted' && <HudCardShell title="Travel accepted" className={styles.card} onClose={close} closeLabel="Close travel status">
        <HudCardBack destination="travel review" onClick={() => setView('review')} />
        <HudHeading size="compact">{fleet.name}</HudHeading><HudText>Travelling to {destination.name}</HudText><HudText role="status">Simulated acceptance · no server order created.</HudText>
      </HudCardShell>}
    </div>
  </main>
}
