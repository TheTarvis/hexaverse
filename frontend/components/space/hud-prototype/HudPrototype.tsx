'use client'

// THROWAWAY: five HUD arrangements on /dev/system-storyboard/hud?variant=A|B|C|D|E.
// E asks whether a compact fleet-to-destination card keeps transfers clear.
// D asks whether quiet labels can expand into an on-object command card.
// Question: which structure supports multi-fleet monitoring and object inspection
// on desktop, with a selection-driven drawer on phones? All commands are simulated.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { formatTons } from '@/lib/format'
import { HudPrototypeSwitcher, HUD_PROTOTYPE_VARIANTS, type HudPrototypeVariant } from '@/components/hud/HudPrototypeSwitcher'
import { TransferCardPrototype } from './TransferCardPrototype'
import styles from './hud-prototype.module.css'

type Activity = 'Ready' | 'Mining' | 'Traveling' | 'Docked' | 'Under attack'
export type Entity = {
  id: string; name: string; kind: string; system: string; x: number; y: number
  appearance: string; resources?: string; cost?: number; eta?: string
}
export type Fleet = Entity & {
  activity: Activity; ships: number; fuel: number; cargo: number
  progress: number; destination?: string; scanning?: boolean
}
type GameEvent = {
  id: string; level: 'critical' | 'warning' | 'info'; title: string
  detail: string; target: string; time: string; acknowledged?: boolean
}
type Tab = 'fleets' | 'objects' | 'events'

const initialFleets: Fleet[] = [
  { id: 'peregrine', name: 'Peregrine', kind: 'Your fleet', system: 'Solace', x: 33, y: 53, appearance: 'fleet', activity: 'Ready', ships: 3, fuel: 71.3, cargo: 24, progress: 0 },
  { id: 'morrow', name: 'Morrow', kind: 'Your fleet', system: 'Solace', x: 50, y: 80, appearance: 'fleet', activity: 'Mining', ships: 2, fuel: 42.8, cargo: 133, progress: 66, eta: '18m', destination: 'Inner Belt' },
  { id: 'kepler', name: 'Kepler', kind: 'Your fleet', system: 'Solace', x: 52, y: 27, appearance: 'fleet', activity: 'Traveling', ships: 1, fuel: 28.4, cargo: 8, progress: 43, eta: '3m 12s', destination: 'Aurelia', scanning: true },
  { id: 'atlas', name: 'Atlas', kind: 'Your fleet', system: 'Vega', x: 31, y: 43, appearance: 'fleet', activity: 'Docked', ships: 4, fuel: 18.2, cargo: 160, progress: 0, destination: 'Vega Anchorage' },
  { id: 'warden', name: 'Warden', kind: 'Your fleet', system: 'Arcturus', x: 55, y: 48, appearance: 'fleet', activity: 'Under attack', ships: 3, fuel: 51, cargo: 18, progress: 0 },
  { id: 'prospect', name: 'Prospect', kind: 'Your fleet', system: 'Vega', x: 68, y: 55, appearance: 'fleet', activity: 'Mining', ships: 2, fuel: 36, cargo: 90, progress: 45, eta: '42m', destination: 'Cinder Field' },
  { id: 'faraday', name: 'Faraday', kind: 'Your fleet', system: 'Arcturus', x: 75, y: 32, appearance: 'fleet', activity: 'Ready', ships: 1, fuel: 63, cargo: 12, progress: 0 },
  { id: 'wayfarer', name: 'Wayfarer', kind: 'Your fleet', system: 'Solace', x: 22, y: 47, appearance: 'fleet', activity: 'Docked', ships: 2, fuel: 8.6, cargo: 120, progress: 0, destination: 'Home Station' },
]

const objects: Entity[] = [
  { id: 'star', name: 'Solace', kind: 'G-type star', system: 'Solace', x: 47, y: 44, appearance: 'star' },
  { id: 'home', name: 'Home Station', kind: 'Trading station', system: 'Solace', x: 27, y: 40, appearance: 'station', cost: 2.1, eta: '1m 08s' },
  { id: 'nereid', name: 'Nereid', kind: 'Ice giant', system: 'Solace', x: 66, y: 58, appearance: 'ice', resources: 'Volatiles · surveyed', cost: 4.8, eta: '2m 14s' },
  { id: 'vesper', name: 'Vesper', kind: 'Rocky world', system: 'Solace', x: 38, y: 30, appearance: 'rock', resources: 'Metals · surveyed', cost: 3.2, eta: '1m 46s' },
  { id: 'aurelia', name: 'Aurelia', kind: 'Gas giant', system: 'Solace', x: 79, y: 28, appearance: 'gas', resources: 'Not yet surveyed', cost: 8.2, eta: '4m 36s' },
  { id: 'belt', name: 'Inner Belt', kind: 'Asteroid field', system: 'Solace', x: 55, y: 72, appearance: 'belt', resources: 'Metals · 1,240 t observed', cost: 3.6, eta: '1m 52s' },
  { id: 'gate', name: 'Vega Gate', kind: 'Lane gate', system: 'Solace', x: 86, y: 66, appearance: 'gate', cost: 12.6, eta: '6m 10s' },
  { id: 'burn', name: 'Unknown burn', kind: 'Detected contact', system: 'Solace', x: 73, y: 43, appearance: 'contact' },
  { id: 'vega-star', name: 'Vega', kind: 'A-type star', system: 'Vega', x: 47, y: 44, appearance: 'star' },
  { id: 'vega-home', name: 'Vega Anchorage', kind: 'Trading station', system: 'Vega', x: 30, y: 40, appearance: 'station', cost: 2.1, eta: '1m 08s' },
  { id: 'cinder', name: 'Cinder Field', kind: 'Asteroid field', system: 'Vega', x: 68, y: 59, appearance: 'belt', resources: 'Metals · 860 t observed', cost: 3.6, eta: '1m 52s' },
  { id: 'arcturus-star', name: 'Arcturus', kind: 'K-type star', system: 'Arcturus', x: 47, y: 44, appearance: 'star' },
  { id: 'haven', name: 'Haven', kind: 'Rocky world', system: 'Arcturus', x: 72, y: 61, appearance: 'rock', resources: 'Not yet surveyed', cost: 3.2, eta: '1m 46s' },
]

const initialEvents: GameEvent[] = [
  { id: 'attack', level: 'critical', title: 'Warden is under attack', detail: 'Arcturus · 3 ships · hostile action confirmed', target: 'warden', time: 'Now' },
  { id: 'detection', level: 'warning', title: 'Unknown engine burn spotted', detail: 'Solace · ownership and intent unknown · last seen 2m ago', target: 'burn', time: '2m ago' },
  { id: 'arrival', level: 'info', title: 'Wayfarer arrived at Home Station', detail: 'Solace · docked and ready for orders', target: 'wayfarer', time: '6m ago' },
]

function isFleet(entity: Entity): entity is Fleet { return 'ships' in entity }
function glyph(entity: Entity) {
  return entity.appearance === 'fleet' ? '➤' : entity.appearance === 'station' ? '◇' : entity.appearance === 'gate' ? '◈' : entity.appearance === 'contact' ? '⌁' : entity.appearance === 'belt' ? '⁙' : '●'
}

function FleetMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 3 59 15 54 39 32 61 10 39 5 15Z" fill="#081725" stroke="currentColor" strokeWidth="2" /><path d="m32 8 21 10-4 18-17 18-17-18-4-18Z" fill="currentColor" opacity=".18" /><path d="M32 13 42 42 32 36 22 42Z" fill="currentColor" /><path d="M16 20h7m-5 7h4m26-7h-7m5 7h-4M32 40v10" stroke="currentColor" strokeWidth="2" /></svg>
}

export function HudPrototype() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const variantParam = searchParams.get('variant')
  const variant: HudPrototypeVariant = variantParam === 'A' || variantParam === 'B' || variantParam === 'C' || variantParam === 'E' ? variantParam : 'D'
  const [phone, setPhone] = useState(false)
  const [fleets, setFleets] = useState(initialFleets)
  const [events, setEvents] = useState(initialEvents)
  const [commandId, setCommandId] = useState('peregrine')
  const [pickedFleet, setPickedFleet] = useState(false)
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [system, setSystem] = useState('Solace')
  const [camera, setCamera] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('objects')
  const [browserView, setBrowserView] = useState<'list' | 'details'>('list')
  const [fleetOpen, setFleetOpen] = useState(true)
  const [objectsOpen, setObjectsOpen] = useState(true)
  const [fleetQuery, setFleetQuery] = useState('')
  const [objectQuery, setObjectQuery] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [objectFilter, setObjectFilter] = useState('all')
  const [preview, setPreview] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [transferTargetId, setTransferTargetId] = useState('vesper')
  const mapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const [cardPosition, setCardPosition] = useState({ left: 0, top: 0, anchorX: 0, anchorY: 0 })

  // Keep the expanded label inside the viewport as its contents or camera change.
  useLayoutEffect(() => {
    if (variant !== 'D' || !inspectedId) return
    const mapElement = mapRef.current
    const card = cardRef.current
    if (!mapElement || !card) return
    function position() {
      if (!mapElement || !card) return
      const bounds = mapElement.getBoundingClientRect()
      const marker = mapElement.querySelector(`[data-testid="map-${inspectedId}"]`)?.getBoundingClientRect()
      const anchorX = marker ? marker.left + marker.width / 2 - bounds.left : 340
      const anchorY = marker ? marker.top + marker.height / 2 - bounds.top : 180
      const gap = marker ? marker.width / 2 + 22 : 0
      const left = Math.max(12, Math.min(bounds.width - card.offsetWidth - 16,
        anchorX + gap + card.offsetWidth < bounds.width - 16 ? anchorX + gap : anchorX - gap - card.offsetWidth))
      const top = Math.max(132, Math.min(anchorY - 36, bounds.height - card.offsetHeight - 48))
      setCardPosition(previous => previous.left === left && previous.top === top && previous.anchorX === anchorX && previous.anchorY === anchorY ? previous : { left, top, anchorX, anchorY })
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(mapElement)
    observer.observe(card)
    // Follow the existing camera's short transform transition.
    let frame = 0
    const until = performance.now() + 450
    function followCamera() { position(); if (performance.now() < until) frame = requestAnimationFrame(followCamera) }
    frame = requestAnimationFrame(followCamera)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [variant, inspectedId, camera, phone, system])

  const fleetChosen = variant !== 'D' || pickedFleet
  const command = fleets.find(fleet => fleet.id === commandId)!
  const entities: Entity[] = [...objects, ...fleets]
  const inspected = entities.find(entity => entity.id === inspectedId)
  const destination = objects.find(entity => entity.id === preview)
  const localObjects = entities.filter(entity => entity.system === system)
  const critical = events.find(event => event.level === 'critical' && !event.acknowledged)
  const danger = fleets.filter(fleet => fleet.activity === 'Under attack').length
  const busy = command.activity === 'Mining' || command.activity === 'Traveling'
  const canTravel = fleetChosen && !!inspected?.cost && inspected.system === command.system && !busy

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const changeVariant = useCallback((next: HudPrototypeVariant) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('variant', next)
    router.replace(`${pathname}?${params}`, { scroll: false })
  }, [pathname, router, searchParams])

  function inspect(id: string, source: 'objects' | 'fleets' = 'objects') {
    if (variant === 'E') {
      const fleet = fleets.find(item => item.id === id)
      const target = objects.find(item => item.id === id)
      if (fleet) {
        setCommandId(id); setSystem(fleet.system); setCamera(null)
        if (objects.find(item => item.id === transferTargetId)?.system !== fleet.system) setTransferTargetId('')
      } else if (target?.cost) {
        setTransferTargetId(id)
      } else {
        setNotice('Choose a planet, station, belt, or gate as the destination.'); return
      }
      setPreview(null); setDrawer(false)
      return
    }
    if (variant === 'D' && fleets.some(fleet => fleet.id === id)) {
      setCommandId(id); setPickedFleet(true)
      if (inspected && !isFleet(inspected)) {
        setPreview(null); setBrowserView('details'); setTab('objects'); setDrawer(true)
        return
      }
    }
    setInspectedId(id); setPreview(null); setBrowserView('details'); setTab(source); setDrawer(true)
  }
  function openTab(next: Tab) { setTab(next); if (next !== 'events') setBrowserView('list'); setDrawer(true) }
  function backToList() { setBrowserView('list'); setPreview(null); if (variant === 'D') setInspectedId(null) }
  function chooseTarget() {
    setObjectFilter('all'); setObjectQuery(''); setObjectsOpen(true); openTab('objects')
  }
  function focus(entity: Entity) {
    setSystem(entity.system); setCamera(entity.id); setDrawer(false)
  }
  function takeCommand(fleet: Fleet) {
    setCommandId(fleet.id); setPickedFleet(true); setPreview(null)
    setNotice(`Command transferred to ${fleet.name}. Map remains in ${system}.`)
  }
  function addEvent(event: GameEvent) { setEvents(current => [event, ...current]); setNotice(event.title) }
  function setActivity(activity: Activity, extra: Partial<Fleet> = {}) {
    setFleets(current => current.map(fleet => fleet.id === commandId ? { ...fleet, activity, ...extra } : fleet))
    setPreview(null)
  }
  function commitTravel() {
    if (!destination || destination.system !== command.system || !destination.cost || destination.cost > command.fuel || busy) return
    setActivity('Traveling', { fuel: command.fuel - destination.cost, destination: destination.name, eta: destination.eta, progress: 0 })
    addEvent({ id: `depart-${events.length}`, level: 'info', title: `${command.name} departed for ${destination.name}`, detail: `${command.system} · arrival in ${destination.eta}`, target: command.id, time: 'Now' })
  }
  function simulateArrival() {
    const target = objects.find(entity => entity.name === command.destination && entity.system === command.system)
    setActivity(target?.appearance === 'station' ? 'Docked' : 'Ready', { progress: 100, eta: undefined, ...(target ? { x: target.x - 3, y: target.y - 3 } : {}) })
    addEvent({ id: `arrival-${events.length}`, level: 'info', title: `${command.name} arrived at ${command.destination}`, detail: `${command.system} · ready for orders`, target: command.id, time: 'Now' })
  }
  function reset() {
    setFleets(initialFleets); setEvents(initialEvents); setCommandId('peregrine')
    setInspectedId(null); setPickedFleet(false); setSystem('Solace'); setCamera(null); setDrawer(false)
    setExpanded(false); setTab('objects'); setBrowserView('list'); setPreview(null); setNotice(null)
    setFleetQuery(''); setObjectQuery(''); setAttentionOnly(false); setObjectFilter('all')
    setFleetOpen(true); setObjectsOpen(true)
    setTransferTargetId('vesper')
  }

  const fleetList = <section className={styles.listSection} aria-label="Fleet overview">
    <header className={styles.sectionHeading}><Button plain aria-expanded={fleetOpen} onClick={() => setFleetOpen(!fleetOpen)}>Your fleets <span>{fleets.length}</span><span>{fleetOpen ? '−' : '+'}</span></Button></header>
    {fleetOpen && <><div className={styles.listTools}><Input aria-label="Search fleets" placeholder="Find a fleet…" value={fleetQuery} onChange={event => setFleetQuery(event.target.value)} /><Button plain aria-label="Filter fleets needing attention" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}>{attentionOnly ? 'All' : '⚑'}</Button></div>
      <div className={styles.fleetRows}>{fleets.filter(fleet => fleet.name.toLowerCase().includes(fleetQuery.toLowerCase()) && (!attentionOnly || fleet.activity === 'Under attack' || fleet.fuel < 15)).map(fleet => <Button plain key={fleet.id} data-testid={`fleet-${fleet.id}`} data-selected={variant === 'E' ? commandId === fleet.id : inspectedId === fleet.id} aria-pressed={variant === 'E' ? commandId === fleet.id : undefined} className={styles.fleetRow} onClick={() => inspect(fleet.id, 'fleets')}>
        <span className={styles.fleetSymbol} data-danger={fleet.activity === 'Under attack'}><FleetMark /></span>
        <span className={styles.rowBody}><strong>{fleet.name} {variant !== 'E' && fleetChosen && fleet.id === commandId && <em>CMD</em>} {fleet.activity === 'Under attack' && <b className={styles.danger}>!</b>}</strong><small>{fleet.system} · {fleet.activity}{fleet.scanning ? ' + scanning' : ''}</small>{fleet.progress > 0 && fleet.progress < 100 && <i className={styles.progress}><i style={{ width: `${fleet.progress}%` }} /></i>}</span>
        <span className={styles.rowMeta}>{fleet.eta ?? (fleet.fuel < 15 ? 'Low fuel' : `${fleet.ships} ships`)}<small>{fleet.eta ? 'remaining' : formatTons(fleet.fuel)}</small></span>
      </Button>)}</div></>}
  </section>

  const objectList = <section className={styles.listSection} aria-label="System object browser">
    <header className={styles.sectionHeading}><Button plain aria-expanded={objectsOpen} onClick={() => setObjectsOpen(!objectsOpen)}>In {system} <span>{localObjects.length}</span><span>{objectsOpen ? '−' : '+'}</span></Button></header>
    {objectsOpen && <><div className={styles.listTools}><Input aria-label="Search system objects" placeholder="Find an object…" value={objectQuery} onChange={event => setObjectQuery(event.target.value)} /></div>
      <div className={styles.filterRow}>{['all', 'sites', 'fleets'].map(filter => <Button plain key={filter} aria-pressed={objectFilter === filter} onClick={() => setObjectFilter(filter)}>{filter === 'all' ? 'All' : filter === 'sites' ? 'Sites' : 'Fleets'}</Button>)}</div>
      <div className={styles.objectRows}>{localObjects.filter(entity => entity.name.toLowerCase().includes(objectQuery.toLowerCase()) && (objectFilter === 'all' || (objectFilter === 'fleets' ? isFleet(entity) : !!entity.resources))).map(entity => <Button plain key={entity.id} className={styles.objectRow} data-testid={`object-${entity.id}`} data-selected={variant === 'E' ? commandId === entity.id || transferTargetId === entity.id : inspectedId === entity.id} onClick={() => inspect(entity.id)}><span className={styles.objectGlyph} data-appearance={entity.appearance}>{glyph(entity)}</span><span><strong>{entity.name} {fleetChosen && entity.id === commandId && <em className={styles.commandTag}>CMD</em>}</strong><small>{isFleet(entity) ? entity.activity : entity.kind}</small></span><span className={styles.chevron}>›</span></Button>)}</div></>}
  </section>

  const eventList = <section className={styles.eventList} aria-label="Event history"><header className={styles.eventListHeading}><h2>Signals & reports</h2><span>{events.length} recorded</span></header>{events.map(event => <article key={event.id} data-level={event.level}>
    <span className={styles.eventSeverity} aria-label={event.level}>{event.level === 'critical' ? '!' : event.level === 'warning' ? '△' : 'i'}</span>
    <div className={styles.eventContent}><div className={styles.eventTitle}><Button plain onClick={() => inspect(event.target)}>{event.title} ↗</Button><time>{event.time}</time></div><p>{event.detail}</p>
    {event.level === 'critical' && <Button plain className={styles.acknowledge} disabled={event.acknowledged} onClick={() => setEvents(current => current.map(item => item.id === event.id ? { ...item, acknowledged: true } : item))}>{event.acknowledged ? '✓ Acknowledged · danger ongoing' : 'Acknowledge alarm'}</Button>}</div>
  </article>)}</section>

  const fleetCommands = <section className={styles.commandCard} aria-label="Command fleet">
    <div className={styles.cardHeading}><p className={styles.eyebrow}>FLEET CONTROLS</p><Button plain aria-label="Browse fleets to change command" onClick={() => openTab('fleets')}>Change ↗</Button></div>
    <div className={styles.commandIdentity}><FleetMark className={styles.commandCrest} /><div><h2>{command.name}</h2><p>{command.ships} ships · {command.system}</p></div><span className={styles.stateBadge} data-danger={command.activity === 'Under attack'}>{command.activity}</span></div>
    <div className={styles.gauges}><div><span>Fuel <strong>{formatTons(command.fuel)}</strong></span><i className={styles.progress}><i style={{ width: `${command.fuel}%` }} /></i></div><div><span>Hold <strong>{formatTons(command.fuel + command.cargo)} <small>/ 200 t</small></strong></span><i className={styles.progress}><i style={{ width: `${(command.fuel + command.cargo) / 2}%` }} /></i></div></div>
    {command.destination && <p className={styles.activityLine}>{command.activity === 'Traveling' ? '↗' : command.activity === 'Mining' ? '⁙' : '◇'} {command.destination}{command.eta && <strong>{command.eta} left</strong>}</p>}
    {command.scanning && <p className={styles.sensorStatus}>◎ Sensor sweep running · independent of travel</p>}
    <div className={styles.commandActions}>
      <Button outline disabled={command.scanning} onClick={() => { setActivity(command.activity, { scanning: true }); setNotice(`Sensor sweep started for ${command.name}.`) }}>{command.scanning ? 'Scanning…' : '◎ Scan'}</Button>
      {command.activity === 'Mining' && <Button outline onClick={() => { setActivity('Ready', { eta: undefined }); setNotice(`Extraction stopped for ${command.name}.`) }}>Stop mining</Button>}
      {command.activity === 'Traveling' && <Button outline onClick={() => { setActivity('Ready', { destination: undefined, eta: undefined, progress: 0 }); setNotice(`Drive cut for ${command.name}.`) }}>Cut drive</Button>}
      {command.activity === 'Docked' && <Button outline disabled={command.fuel + command.cargo > 190} onClick={() => { setActivity('Docked', { fuel: command.fuel + 10 }); setNotice(`10 t of fuel added to ${command.name} · simulated purchase.`) }}>Buy 10 t fuel</Button>}
      <Button plain onClick={() => focus(command)}>Go to fleet ⌖</Button>
    </div>
    {command.activity === 'Traveling' && <Button plain className={styles.simulate} onClick={simulateArrival}>Prototype: simulate arrival →</Button>}
  </section>

  const details = inspected ? <section className={styles.detailCard} aria-label="Inspected object">
    <div className={styles.browserHeading}><Button plain aria-label={variant === 'D' ? 'Close inspection' : 'Back to list'} onClick={backToList}><span className={styles.desktopBack}>{variant === 'D' ? 'SELECTED OBJECT' : '← Objects'}</span><span className={styles.mobileBack}>← {tab === 'fleets' ? 'Fleets' : 'Objects'}</span></Button><span>{inspected.system}{variant === 'D' && <Button plain aria-label="Dismiss selected object" onClick={() => { setInspectedId(null); setPreview(null); setDrawer(false) }}>×</Button>}</span></div>
    {inspected.id !== commandId && <div className={styles.detailIdentity}><span className={`${styles.portrait} ${styles[inspected.appearance]}`}>{isFleet(inspected) ? <FleetMark /> : ['station', 'gate', 'contact', 'belt'].includes(inspected.appearance) ? glyph(inspected) : ''}</span><div><h2>{inspected.name}</h2><p>{inspected.kind}{isFleet(inspected) ? ` · ${inspected.ships} ships` : ''}</p></div><Button plain aria-label={`Go to ${inspected.name}`} title="Move camera to this object" onClick={() => focus(inspected)}>⌖</Button></div>}
    {isFleet(inspected) ? inspected.id === commandId ? <div className={styles.fleetWorkspace}>{fleetCommands}<Button color="cyan" className={styles.primary} onClick={chooseTarget}>Choose a target →</Button></div> : <><dl className={styles.facts}><div><dt>Activity</dt><dd className={inspected.activity === 'Under attack' ? styles.danger : ''}>{inspected.activity}{inspected.scanning ? ' + scanning' : ''}</dd></div><div><dt>Destination</dt><dd>{inspected.destination ?? 'No active course'}</dd></div><div><dt>Arrival / completion</dt><dd>{inspected.eta ? `In ${inspected.eta}` : '—'}</dd></div><div><dt>Fuel / cargo</dt><dd>{inspected.fuel} t / {inspected.cargo} t</dd></div></dl><Button color="cyan" aria-label={`Command ${inspected.name}`} className={styles.primary} onClick={() => takeCommand(inspected)}>Command this fleet</Button></> : <>
      <dl className={styles.facts}><div><dt>{inspected.appearance === 'contact' ? 'Evidence' : 'Resources'}</dt><dd>{inspected.appearance === 'contact' ? 'Engine burn detected' : inspected.resources ?? 'Not a resource site'}</dd></div><div><dt>{inspected.appearance === 'contact' ? 'Last observed' : 'Knowledge'}</dt><dd>{inspected.appearance === 'contact' ? '2m ago · position uncertain' : 'Known system object'}</dd></div>{inspected.appearance === 'contact' && <div><dt>Identity / intent</dt><dd>Unknown</dd></div>}<div><dt>Nearby fleets</dt><dd>{fleets.filter(fleet => fleet.system === inspected.system && Math.hypot(fleet.x - inspected.x, fleet.y - inspected.y) < 12).map(fleet => fleet.name).join(', ') || 'None observed'}</dd></div></dl>
      <section className={styles.targetCommands} aria-label="Fleet and target actions"><div className={styles.actionPairing} data-testid="command-target"><span><small>COMMAND FLEET</small><strong>{fleetChosen ? command.name : 'Select fleet'}</strong></span><b aria-hidden="true">→</b><span><small>TARGET</small><strong>{inspected.name}</strong></span></div>
      {!fleetChosen ? <Button outline className={styles.secondary} onClick={() => openTab('fleets')}>Choose fleet →</Button> : <>
      {inspected.system !== command.system && <p className={styles.hint}>{command.name} is in {command.system}; this target is in {inspected.system}.</p>}
      {destination ? <div className={styles.courseReview} aria-label="Course preview"><p className={styles.eyebrow}>REVIEW COURSE · NOT YET COMMITTED</p><div><span>Arrival<strong>In {destination.eta}</strong></span><span>Fuel cost<strong>{destination.cost} t</strong></span><span>Fuel after<strong>{formatTons(command.fuel - destination.cost!)}</strong></span></div><p>Return fuel is not included in this outbound estimate.</p><div className={styles.actionPair}><Button outline onClick={() => setPreview(null)}>Back</Button><Button color="cyan" disabled={destination.cost! > command.fuel || busy || destination.system !== command.system} onClick={commitTravel}>Start travel</Button></div></div> : inspected.cost ? <><Button color="cyan" className={styles.primary} disabled={!canTravel} onClick={() => setPreview(inspected.id)}>Preview course →</Button>{busy && <><p className={styles.hint}>{command.name} is {command.activity.toLowerCase()}. Stop it to plot a new course.</p><Button outline className={styles.secondary} onClick={() => { setActivity('Ready', { eta: undefined, progress: 0 }); setNotice(`${command.name} ready for a new course.`) }}>Stop {command.activity.toLowerCase()}</Button></>}
        {inspected.resources && <Button outline className={styles.secondary} disabled={command.destination !== inspected.name || command.activity !== 'Ready'} onClick={() => { setActivity('Mining', { destination: inspected.name, eta: '24m', progress: 1 }); setNotice(`${command.name} started mining at ${inspected.name}.`) }}>Mine · {command.destination === inspected.name && command.activity === 'Ready' ? 'start extraction' : 'requires arrival'}</Button>}
        {inspected.appearance === 'station' && <Button outline className={styles.secondary} disabled={command.destination !== inspected.name || command.activity !== 'Ready'} onClick={() => { setActivity('Docked', { destination: inspected.name }); setNotice(`${command.name} docked at ${inspected.name}.`) }}>Dock · {command.destination === inspected.name && command.activity === 'Ready' ? 'enter station' : 'requires arrival'}</Button>}
        {inspected.appearance === 'gate' && <p className={styles.hint}>Warp becomes available after arriving at the gate.</p>}
      </> : <p className={styles.hint}>{inspected.appearance === 'contact' ? 'This is a remembered detection; identity and intent remain unknown.' : 'No fleet commands available for this object.'}</p>}
      </>}
      </section>
    </>}
    <details className={styles.moreDetails}><summary>More details</summary><p>{isFleet(inspected) ? `Ships: ${Array.from({ length: inspected.ships }, (_, index) => `${inspected.name} ${index + 1}`).join(', ')}. Fleet fuel and cargo share hold capacity.` : `${inspected.name} · ${inspected.kind}. Only observed information is shown. Additional survey records would appear here.`}</p></details>
  </section> : <section className={styles.emptyDetail}><span>⌖</span><h2>Choose something to inspect</h2><p>Select it on the map or in the object browser.<br />{command.name} will keep receiving your commands.</p><Button outline onClick={() => openTab('objects')}>Browse objects</Button></section>

  const focusEntity = entities.find(entity => entity.id === camera)
  const map = <div ref={mapRef} className={styles.map} aria-label={`${system} system map`} data-testid="prototype-map" data-system={system} data-camera={camera ?? 'system'}>
    <div className={styles.mapArt} style={focusEntity ? { transformOrigin: `${focusEntity.x}% ${focusEntity.y}%`, transform: `translate(${50 - focusEntity.x}%, ${45 - focusEntity.y}%) scale(1.12)` } : undefined}>
      <svg className={styles.orbits} viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="hud-grid" width="86" height="50" patternUnits="userSpaceOnUse"><path d="M0 25 22 0H65L86 25 65 50H22Z" fill="none" stroke="#77afce" strokeWidth=".5" opacity=".12" /></pattern><radialGradient id="hud-glow"><stop stopColor="#d4964d" stopOpacity=".09" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient></defs><rect width="1000" height="700" fill="url(#hud-grid)" /><ellipse cx="470" cy="308" rx="320" ry="220" fill="url(#hud-glow)" />{[90, 165, 255, 350, 445].map(radius => <ellipse key={radius} cx="470" cy="308" rx={radius} ry={radius * .63} transform="rotate(-14 470 308)" fill="none" stroke="#a1bcd0" strokeWidth=".6" opacity=".17" />)}<ellipse cx="470" cy="308" rx="275" ry="175" transform="rotate(-14 470 308)" fill="none" stroke="#b9926a" strokeWidth="11" strokeDasharray="1 6 2 9 1 3" opacity=".2" />{destination && <path d={`M${command.x * 10} ${command.y * 7} Q520 230 ${destination.x * 10} ${destination.y * 7}`} fill="none" stroke="#83e9de" strokeWidth="1.5" strokeDasharray="6 5" />}</svg>
      {Array.from({ length: 90 }, (_, index) => <i key={index} className={styles.starPoint} style={{ left: `${(index * 37.17) % 100}%`, top: `${(index * 23.73) % 100}%`, opacity: .15 + (index % 5) * .12 }} />)}
      {localObjects.map(entity => <Button plain key={entity.id} className={styles.mapObject} data-selected={variant === 'E' ? commandId === entity.id || transferTargetId === entity.id : inspectedId === entity.id} data-command={fleetChosen && commandId === entity.id} data-appearance={entity.appearance} data-testid={`map-${entity.id}`} aria-label={`${variant === 'E' ? isFleet(entity) ? 'Select fleet' : 'Set destination' : 'Inspect'} ${entity.name}`} onClick={() => inspect(entity.id)} style={{ left: `${entity.x}%`, top: `${entity.y}%` } as CSSProperties}><span className={`${styles.celestial} ${styles[entity.appearance]}`}>{isFleet(entity) ? <FleetMark /> : ['station', 'gate', 'contact', 'belt'].includes(entity.appearance) ? glyph(entity) : ''}</span><span className={styles.mapLabel}><strong>{entity.name}{isFleet(entity) && <small> {entity.ships}</small>}</strong><small>{isFleet(entity) ? `${entity.activity}${entity.eta ? ` · ${entity.eta}` : ''}` : entity.appearance === 'contact' ? 'Unknown · 2m ago' : entity.kind}</small></span></Button>)}
    </div>
    {variant === 'D' && inspected && <>
      {inspected.system === system && <svg className={styles.selectionLeader} aria-hidden="true"><path d={`M${cardPosition.anchorX} ${cardPosition.anchorY} L${cardPosition.left > cardPosition.anchorX ? cardPosition.left : cardPosition.left + 310} ${Math.max(cardPosition.top + 25, Math.min(cardPosition.anchorY, cardPosition.top + 80))}`} /></svg>}
      <aside ref={cardRef} className={styles.anchoredInspector} aria-label="Selected object controls" style={{ left: cardPosition.left, top: cardPosition.top }}>{details}</aside>
    </>}
    <div className={styles.mapCaption}><span>LOCAL SPACE / {system.toUpperCase()}</span><h1>{system}<small> α</small></h1><p>{localObjects.length} known objects · {fleets.filter(fleet => fleet.system === system).length} of {fleets.length} fleets here</p></div>
    <div className={styles.mapTools}><Button outline onClick={() => { setCamera(null); setDrawer(false) }}>System view ⌖</Button><Button outline onClick={() => openTab('objects')}>Objects ≡</Button></div>
    {destination && <div className={styles.arcLabel}>PREVIEW · {destination.eta} · {destination.cost} t fuel</div>}
  </div>

  const header = <header className={styles.topBar}><div className={styles.brand}>H<span>HEXAVERSE</span></div><Button plain className={styles.commandChip} aria-label={fleetChosen ? `Open command fleet ${command.name}` : 'Choose command fleet'} onClick={() => fleetChosen ? inspect(command.id) : openTab('fleets')}><FleetMark /><span>{fleetChosen ? <>Commanding: <strong>{command.name}</strong></> : 'Select a fleet'}</span>{fleetChosen && <small className={styles.chipVitals}>{command.activity} · {command.fuel} t</small>}<span>⌄</span></Button><div className={styles.globalStatus}><span>₡ <strong>12,480</strong></span><span><strong>{fleets.length}</strong> fleets</span><span className={styles.danger}>{danger} under attack</span></div><Button plain onClick={() => openTab('events')}>Events <span className={styles.eventCount}>{events.length}</span></Button></header>
  const alarm = critical ? <aside role="alert" className={styles.alarm}><span className={styles.alarmIcon}>!</span><div><strong>{critical.title}</strong><small>{critical.detail}</small></div><Button plain onClick={() => inspect(critical.target)}>Review ↗</Button><Button plain aria-label="Acknowledge critical alarm" onClick={() => setEvents(current => current.map(event => event.id === critical.id ? { ...event, acknowledged: true } : event))}>✓</Button></aside> : <aside className={styles.quietAlert}><span className={styles.danger}>● Warden · danger ongoing</span><Button plain onClick={() => openTab('events')}>Event history ↗</Button></aside>

  return <main className={`${styles.prototype} dark`}>
    <div className={styles.labBar}><span><b>HUD STUDY</b> <small>SIMULATED · LAYOUT NOT COMMITTED</small></span><div><Button plain aria-pressed={phone} onClick={() => { setPhone(!phone); setDrawer(false) }}>{phone ? 'Desktop' : 'Phone preview'}</Button><Button plain onClick={reset}>Reset</Button></div></div>
    <div className={`${styles.game} ${phone ? styles.phoneMode : ''}`} data-variant={variant} data-drawer={drawer} data-tab={tab}>
      <div className={styles.hudContent} onKeyDown={event => { if (event.key === 'Escape') { setDrawer(false); setPreview(null); if (variant === 'D') setInspectedId(null) } }}>
        {header}{map}{alarm}
        {variant === 'E' && <TransferCardPrototype fleet={command} fleets={fleets} target={objects.find(object => object.id === transferTargetId)} objects={objects} previewing={!!destination} onFleet={id => inspect(id, 'fleets')} onTarget={id => { if (id) inspect(id); else { setTransferTargetId(''); setPreview(null) } }} onPreview={() => setPreview(transferTargetId)} onBack={() => setPreview(null)} onTravel={commitTravel} onStop={() => setActivity('Ready', { eta: undefined, destination: undefined, progress: 0 })} onArrival={simulateArrival} />}
        <aside className={styles.fleetRail}>{fleetList}</aside>
        <aside className={styles.objectRail} data-scene-browser={drawer && tab === 'objects' && browserView === 'list'} data-view={browserView} aria-label="Object browser and inspector"><div className={styles.browserPage} data-testid="desktop-object-list" hidden={browserView !== 'list'}>{objectList}</div><div key={inspectedId} className={styles.browserPage} hidden={browserView !== 'details'}>{details}</div></aside>
        {drawer && (tab === 'events' || (tab === 'fleets' && browserView === 'list')) && <div className={styles.desktopOverlay}><div className={styles.overlayHeading}><h2>{tab === 'events' ? 'Event history' : 'Your fleets'}</h2><Button plain aria-label="Close panel" onClick={() => setDrawer(false)}>×</Button></div>{tab === 'events' ? eventList : fleetList}</div>}
        <div className={styles.mobileFleetBar}><Button plain onClick={() => fleetChosen ? inspect(command.id) : openTab('fleets')}><span className={styles.fleetSymbol}><FleetMark /></span><span><strong>{fleetChosen ? `Commanding: ${command.name}` : 'Select a fleet'}</strong>{fleetChosen && <small>{command.activity} · {command.fuel} t fuel</small>}</span><span>⌃</span></Button><Button plain aria-label="Open command network drawer" onClick={() => openTab('fleets')}>≡</Button></div>
        {drawer && <section className={`${styles.mobileDrawer} ${expanded ? styles.drawerExpanded : ''}`} aria-label="Mobile HUD drawer"><div className={styles.drawerHandle}><Button plain className={styles.drawerCommand} aria-label={fleetChosen ? `Open command fleet ${command.name}` : 'Choose command fleet'} onClick={() => fleetChosen ? inspect(command.id) : openTab('fleets')}><FleetMark />{fleetChosen && <small>Commanding</small>}<strong>{fleetChosen ? command.name : 'Select fleet'}</strong></Button><Button plain aria-label={expanded ? 'Reduce drawer' : 'Expand drawer'} onClick={() => setExpanded(!expanded)}>{expanded ? '⌄' : '⌃'}</Button><Button plain aria-label="Close drawer to map" onClick={() => setDrawer(false)}>Map ↓</Button></div><nav className={styles.drawerTabs} aria-label="HUD sections">{(['fleets', 'objects', 'events'] as const).map(item => <Button plain key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => openTab(item)}>{item === 'events' ? `Events (${events.length})` : item}</Button>)}</nav><div className={styles.drawerBody}>
          <div className={styles.browserPage} data-testid="mobile-object-list" hidden={tab !== 'objects' || browserView !== 'list'}>{objectList}</div>
          <div className={styles.browserPage} data-testid="mobile-fleet-list" hidden={tab !== 'fleets' || browserView !== 'list'}>{fleetList}</div>
          <div key={inspectedId} className={styles.browserPage} hidden={tab === 'events' || browserView !== 'details'}>{details}</div>
          <div className={styles.browserPage} hidden={tab !== 'events'}>{eventList}</div>
        </div></section>}
        {notice && <div role="status" className={styles.toast}>{notice}</div>}
        <footer className={styles.worldClock}>PERSEUS REACH <span>T+ 28d 21:46 · ×1</span></footer>
      </div>
    </div>
    <div className={styles.prototypeFooter}><HudPrototypeSwitcher variant={variant} onChange={changeVariant} /><span>{HUD_PROTOTYPE_VARIANTS.find(item => item.key === variant)?.description}</span><details className={styles.state}><summary>Study state ⌃</summary><pre>{JSON.stringify({ variant, viewport: phone ? 'phone preview' : 'responsive', viewedSystem: system, cameraFocus: camera, commandFleet: fleetChosen ? command.name : null, inspectedObject: inspected?.name, browserView, objectFilter, objectQuery, mobileDrawerOpen: drawer, drawerSection: tab, coursePreview: destination?.name ?? null, transfer: { fleetId: commandId, targetId: transferTargetId, previewing: !!destination }, fleets: fleets.map(fleet => ({ name: fleet.name, activity: fleet.activity, fuel: fleet.fuel, scanning: !!fleet.scanning })), events }, null, 2)}</pre></details></div>
  </main>
}
