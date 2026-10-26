import { useEffect, useRef, useState } from 'react'
import { HudButton } from '@/components/hud/HudControls'
import { HudText } from '@/components/hud/HudTypography'
import { destinations, fleets, type SelectionKind, type StudyItem } from './fixtures'
import { ObjectSearchCard } from '../ObjectSearchCard'
import { emptyObjectSearch, type ObjectSearchValue } from '../ObjectSearch'
import { CompactTravelCard } from '../CompactTravelCard'
import { FleetStatusCard } from '@/components/fleet/FleetStatusCard'
import { fleetFixture, fixtureBurn } from '@/components/fleet/fleet-status-study/fixtures'
import styles from './travel-study.module.css'

function itemArt(item: StudyItem) {
  return item.type === 'Fleet' ? 'fleet' : item.type === 'Station' ? 'station' : item.type === 'Moon' ? 'moon' : item.type === 'Lane gate' ? 'gate' : 'rocky'
}

export function TravelStudy({ entry = 'fleet', scenario = 'affordable', arrivalRevision = 0, statusRevision = 0 }: {
  entry?: SelectionKind; scenario?: string; arrivalRevision?: number; statusRevision?: number
}) {
  const [fleet, setFleet] = useState(fleets[scenario === 'shortfall' ? 1 : scenario === 'unavailable' ? 3 : 0])
  const [destination, setDestination] = useState(destinations[0])
  const [selecting, setSelecting] = useState<SelectionKind | null>(entry)
  const [chosen, setChosen] = useState({ fleet: false, destination: false })
  const [searchHistory, setSearchHistory] = useState<SelectionKind[]>([entry])
  const [open, setOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState(false)
  const [status, setStatus] = useState(false)
  const [journey, setJourney] = useState<{ elapsed: number; stopped: boolean } | null>(null)
  const [seenArrival, setSeenArrival] = useState(arrivalRevision)
  const [seenStatus, setSeenStatus] = useState(statusRevision)
  if (seenArrival !== arrivalRevision) {
    setSeenArrival(arrivalRevision)
    setJourney(current => current ? { ...current, elapsed: 180 } : null)
  }
  if (seenStatus !== statusRevision) {
    setSeenStatus(statusRevision)
    if (journey) { setStatus(true); setOpen(true) }
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [queries, setQueries] = useState<Record<SelectionKind, ObjectSearchValue>>({ fleet: { ...emptyObjectSearch, type: 'fleets' }, destination: emptyObjectSearch })
  const hostRef = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState(true)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!journey || journey.stopped || journey.elapsed >= 180) return
    const tick = setInterval(() => setJourney(current => current ? { ...current, elapsed: Math.min(180, current.elapsed + 1) } : null), 1000)
    return () => clearInterval(tick)
  }, [journey])
  const remote = fleet.system !== destination.system
  const running = !!journey && !journey.stopped && journey.elapsed < 180
  const shortfall = Math.max(0, 18 - (fleet.fuel ?? 0))
  const blocked = remote || !!fleet.mining || shortfall > 0 || running
  const fieldName = (item: StudyItem) => scenario === 'long' ? `${item.name} outer-system ${item.type === 'Fleet' ? 'survey expedition' : 'and resupply facility'}` : item.name
  const reviewed = chosen.fleet && chosen.destination
  const openChooser = (kind: SelectionKind) => {
    setSearchHistory([])
    setSelecting(kind)
  }
  const back = (kind: SelectionKind) => {
    if (searchHistory.length > 1) {
      setSelecting(searchHistory[searchHistory.length - 2])
      setSearchHistory(previous => previous.slice(0, -1))
    } else if (reviewed) {
      setSelecting(null)
      requestAnimationFrame(() => hostRef.current?.querySelector<HTMLButtonElement>(`[aria-label="Change ${kind}"]`)?.focus())
    } else setOpen(false)
  }
  const choose = (kind: SelectionKind, item: StudyItem) => {
    if (kind === 'fleet') setFleet(item); else setDestination(item)
    const next = { ...chosen, [kind]: true }
    setChosen(next)
    setError(false)
    if (!next.fleet || !next.destination) {
      const other = kind === 'fleet' ? 'destination' : 'fleet'
      setSearchHistory(previous => [...previous, other])
      setSelecting(other)
      return
    }
    setSelecting(null)
    setSearchHistory([])
    setRecalculating(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setRecalculating(false); timer.current = null }, 400)
  }
  const start = () => {
    if (blocked || pending || recalculating) return
    setPending(true); setError(false); setControls(true)
    timer.current = setTimeout(() => {
      timer.current = null; setPending(false)
      if (scenario === 'failure') setError(true)
      else { setStatus(true); setJourney({ elapsed: 0, stopped: false }) }
      requestAnimationFrame(() => hostRef.current?.querySelector<HTMLElement>('[data-slot="hud-content"]')?.focus())
    }, 450)
  }
  const stop = () => { if (!pending) { setJourney(current => current ? { ...current, stopped: true } : null); requestAnimationFrame(() => hostRef.current?.querySelector<HTMLElement>('[data-slot="hud-content"]')?.focus()) } }
  const wireFleet = (item: StudyItem) => fleetFixture({ id: item.id, name: fieldName(item), systemId: item.system, attachedTo: item.mining ? 'site' : undefined,
    roster: { ships: [{ class: 'seed' }], cargo: { fuel: item.fuel ?? 0 }, cargoCapacity: Math.max(120, item.fuel ?? 0), freeHold: Math.max(0, 120 - (item.fuel ?? 0)), miningRate: 1 },
  })
  const currentFleet = wireFleet(fleet)
  const worldTime = 1000 + (journey?.elapsed ?? 0) * 1000
  if (journey && !journey.stopped) currentFleet.state = { Mode: 0, Burn: { ...fixtureBurn, DepartMs: 1000, ArriveMs: 181000 }, Park: null, Drift: null }
  const blocker = recalculating ? 'Recalculating trip…' : remote ? 'Inter-system journey · route required.' : fleet.mining ? 'Stop mining before travelling.' : shortfall > 0 ? 'Insufficient fuel for this trip.' : running ? 'Travel already committed.' : null
  return <div className={styles.instance} ref={hostRef} onKeyDown={event => { if (event.key === 'Escape' && selecting) { event.stopPropagation(); back(selecting) } }}>
    {!open ? <div className={styles.closed}><HudText>Card closed. {running ? 'Travel continues.' : 'No order changed.'}</HudText><HudButton onClick={() => setOpen(true)}>Reopen card</HudButton></div>
      : selecting ? <ObjectSearchCard showPresets={false} title={{ search: selecting === 'fleet' ? 'command-fleet' : 'travel-destination', scope: destination.system, fleet: selecting === 'destination' && chosen.fleet ? fleet.name : null, object: selecting === 'fleet' && chosen.destination ? destination.name : null }} className={styles.card}
        items={(selecting === 'fleet' ? fleets : destinations).filter(item => item.system === destination.system).map(item => ({ id: item.id, name: item.name, kind: itemArt(item), category: item.type === 'Fleet' ? 'owned' : undefined, subtitle: `${item.system} · ${item.type}${item.type === 'Fleet' ? ` · ${item.mining ? 'Mining' : 'Ready'} · ${item.fuel} t fuel` : ''}` }))}
        value={queries[selecting]} onChange={value => setQueries(previous => ({ ...previous, [selecting]: value }))}
        onSelect={id => { const item = (selecting === 'fleet' ? fleets : destinations).find(item => item.id === id); if (item) choose(selecting, item) }}
        onBack={reviewed || searchHistory.length > 1 ? () => back(selecting) : undefined} backDestination={reviewed ? 'trip' : searchHistory.at(-2) === 'fleet' ? 'fleets' : 'destinations'} onClose={() => setOpen(false)} />
      : status && journey ? <FleetStatusCard className={styles.card} fleet={currentFleet} worldTime={worldTime} scale={1} nameOf={id => id} resolveBody={() => ({ kind: 'feature', type: destination.type, id: destination.id, name: fieldName(destination) })}
        travelControlsOpen={controls} onTravelControls={() => setControls(true)} onBack={() => setControls(false)} onReviewTravel={() => setStatus(false)} onFocus={() => {}} onRetry={() => {}} onStop={stop} onClose={() => setOpen(false)} notice={journey.stopped ? 'Stopped (fixture).' : undefined} />
        : <CompactTravelCard className={styles.card} fleet={currentFleet} fleets={fleets.map(wireFleet)} systemId="Solace" destination={fieldName(destination)} destinationKind={itemArt(destination)} worldTime={worldTime} mine={fleet.mining ? { eta: worldTime + 180000 } : null} scale={1}
          quote={recalculating || remote ? null : { controlPoints: [], departMs: worldTime, arriveMs: worldTime + 180000, deltaV: 24, fuelCostTons: 18, affordable: shortfall === 0, strandingWarning: false }}
          blocker={blocker} pending={pending} error={error ? 'The order failed. No travel started. Try again.' : null}
          backDestination={entry === 'fleet' ? 'fleets' : 'destinations'} onFleet={() => {}} onChooseFleet={() => openChooser('fleet')} onChooseDestination={() => openChooser('destination')} onStart={start} onRetry={() => {}} onBack={() => { setChosen({ fleet: false, destination: false }); setSearchHistory([entry]); setSelecting(entry) }} onClose={() => setOpen(false)} />}
  </div>
}
