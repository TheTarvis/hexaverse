import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, SparklesIcon, SunIcon } from '@heroicons/react/24/outline'
import { HudButton, HudIconButton, HudSearchInput, HudSelect } from '@/components/hud/HudControls'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { BURN_FUEL_ALLOWANCE } from '@/lib/space-quote'
import { destinations, fleets, systems, type Concept, type SelectionKind, type StudyItem } from './fixtures'
import styles from './travel-study.module.css'

function itemArt(item: StudyItem) {
  return item.type === 'Fleet' ? 'fleet' : item.type === 'Station' ? 'station' : item.type === 'Moon' ? 'moon' : item.type === 'Lane gate' ? 'gate' : 'rocky'
}

/** Fictional review data only: this module is imported exclusively by stories. */
function Chooser({ kind, concept, selected, onChoose, onBack, objective, searchRef, counterpart }: {
  kind: SelectionKind; concept: Concept; selected: StudyItem; onChoose: (item: StudyItem) => void; onBack: () => void;
  objective: boolean; searchRef: React.RefObject<HTMLInputElement | null>; counterpart: StudyItem
}) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('Solace')
  const [filter, setFilter] = useState('All')
  const [showSystems, setShowSystems] = useState(false)
  const [limit, setLimit] = useState(20)
  const data = kind === 'fleet' ? fleets : destinations
  const needle = query.trim().toLowerCase()
  const globalSearch = !!needle && concept !== 'A'
  const effectiveScope = globalSearch ? 'All known' : scope
  const matchesText = (item: StudyItem) => `${item.name} ${item.system} ${item.type} ${item.mining ? 'mining' : 'ready'}`.toLowerCase().includes(needle)
  const matchesType = (item: StudyItem) => filter === 'All' || (filter === 'Ready' ? !item.mining : item.type === filter)
  const results = data.filter(item => (effectiveScope === 'All known' || item.system === effectiveScope) && matchesText(item) && matchesType(item))
  const outside = data.filter(item => item.system !== scope && matchesText(item) && matchesType(item)).length
  const showContext = concept === 'C' && !needle && scope === 'Solace' && filter === 'All'
  const preferred = kind === 'destination' && objective ? destinations[100] : selected
  const visible = (showContext ? [preferred, ...results.filter(item => item.id !== preferred.id)] : results).slice(0, limit)
  const changeScope = (next: string) => { setScope(next); setLimit(20); setShowSystems(false) }
  const resultRow = (item: StudyItem) => <HudButton key={item.id} presentation="row" className={styles.result} aria-label={`Choose ${item.name} in ${item.system}`} onClick={() => onChoose(item)}>
    <HudObjectThumbnail kind={itemArt(item)} />
    <span className={styles.resultText}><span className="hud-type-compact">{item.name}</span><span className="hud-type-secondary">{item.system} · {kind === 'fleet' ? `${item.mining ? 'Mining' : 'Ready'} · ${item.fuel} t fuel` : item.type}</span>{item.id === selected.id && <span className={styles.selected}>Current selection</span>}{objective && item.id === destinations[100].id && <span className={styles.selected}>Ore delivery objective</span>}</span>
    <HudIcon icon={ChevronRightIcon} size={16} className={styles.rowArrow} />
  </HudButton>
  return <div className={styles.chooser}>
    <div className={styles.tools}>
      <div className={styles.backRow}><HudIconButton icon={ArrowLeftIcon} label="Back to trip" presentation="chrome" onClick={onBack} /><HudText variant="secondary" className={styles.tripContext} title={`${kind === 'fleet' ? 'Destination' : 'Fleet'}: ${counterpart.name} · ${counterpart.system}`}>{kind === 'fleet' ? 'To' : 'Fleet'}: {counterpart.name} · {counterpart.system}</HudText></div>
      <div className={styles.searchRow}>
        <HudSearchInput ref={searchRef} aria-label={`Search ${kind === 'fleet' ? 'fleets' : 'destinations'}`} placeholder={concept === 'A' ? 'Search by name…' : 'Search all known systems…'} value={query} onChange={event => { setQuery(event.target.value); setLimit(20) }} />
        {concept === 'A' && <div className={styles.scopeToggle} role="group" aria-label="Search scope">
          <HudIconButton icon={SunIcon} label="This system" presentation="chrome" selectionIndicator aria-pressed={scope === 'Solace'} onClick={() => changeScope('Solace')} />
          <HudIconButton icon={SparklesIcon} label="Universe · all known systems" presentation="chrome" selectionIndicator aria-pressed={scope === 'All known'} onClick={() => changeScope('All known')} />
        </div>}
      </div>
      {concept === 'B' ? <div className={styles.scopeRow}><HudText>{globalSearch ? 'Search / All known systems' : `Systems / ${scope}`}</HudText><HudButton onClick={() => setShowSystems(value => !value)}>{showSystems ? 'Show results' : 'Browse systems'}</HudButton></div> : concept === 'C' ? <div className={styles.scopeRow}><HudText variant="secondary">{globalSearch ? 'Searching all known systems' : scope === 'Solace' ? 'For this trip · Solace' : scope}</HudText><HudButton variant="quiet" onClick={() => changeScope(scope === 'All known' ? 'Solace' : 'All known')}>{scope === 'All known' ? 'This system' : 'Browse all'}</HudButton></div> : null}
      <div className={styles.filterRow}><label><span className="hud-type-label">{kind === 'fleet' ? 'Activity' : 'Type'}</span><HudSelect aria-label="Result filter" value={filter} onChange={event => { setFilter(event.target.value); setLimit(20) }}><option>All</option>{(kind === 'fleet' ? ['Ready'] : ['Station', 'Moon', 'Rocky world', 'Lane gate']).map(value => <option key={value}>{value}</option>)}</HudSelect></label><HudText variant="secondary" role="status">{showSystems && concept === 'B' ? `${systems.length} systems` : `${results.length} results`}</HudText></div>
    </div>
    <div className={styles.results} tabIndex={0} aria-label={`${kind} results`}>
      {showSystems && concept === 'B' ? <>{['All known', ...systems].map(system => <HudButton key={system} presentation="row" className={styles.systemRow} onClick={() => { setQuery(''); changeScope(system) }}><span>{system}</span><span className="hud-type-secondary">{system === 'All known' ? data.length : data.filter(item => item.system === system).length}</span><HudIcon icon={ChevronRightIcon} size={16} className={styles.rowArrow} /></HudButton>)}</> : <>
        {showContext && <HudText variant="label" className={styles.resultHeading}>{objective && kind === 'destination' ? 'Objective and nearby destinations' : 'Current selection and this system'}</HudText>}
        {visible.map(resultRow)}
        {results.length === 0 && !showContext && <HudText className={styles.empty}>No matches. Try another name, type or system.</HudText>}
        {visible.length < results.length && <HudButton className={styles.more} onClick={() => setLimit(value => value + 20)}>Show 20 more</HudButton>}
        {concept === 'A' && needle && scope !== 'All known' && outside > 0 && <HudButton className={styles.more} onClick={() => changeScope('All known')}>Search {outside} matches in other systems</HudButton>}
      </>}
    </div>
    <div className={styles.chooserFooter}><HudText variant="secondary">Choosing returns to trip review. No travel starts.</HudText></div>
  </div>
}

export function TravelStudy({ concept = 'A', startSelecting = false, objective = false, scenario = 'affordable', initialKind = 'destination' }: {
  concept?: Concept; startSelecting?: boolean; objective?: boolean; scenario?: string; initialKind?: SelectionKind
}) {
  const [fleet, setFleet] = useState(fleets[scenario === 'shortfall' ? 1 : scenario === 'unavailable' ? 3 : 0])
  const [destination, setDestination] = useState(destinations[objective ? 100 : 0])
  const [selecting, setSelecting] = useState<SelectionKind | null>(startSelecting ? initialKind : null)
  const [open, setOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState(false)
  const [status, setStatus] = useState(false)
  const [journey, setJourney] = useState<{ elapsed: number; stopped: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchFleet = useRef<HTMLInputElement>(null)
  const searchDestination = useRef<HTMLInputElement>(null)
  const fleetTrigger = useRef<HTMLButtonElement>(null)
  const destinationTrigger = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
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
  const openChooser = (kind: SelectionKind) => {
    setSelecting(kind)
    requestAnimationFrame(() => (kind === 'fleet' ? searchFleet : searchDestination).current?.focus())
  }
  const back = (kind: SelectionKind) => { setSelecting(null); requestAnimationFrame(() => (kind === 'fleet' ? fleetTrigger : destinationTrigger).current?.focus()) }
  const choose = (kind: SelectionKind, item: StudyItem) => {
    if (kind === 'fleet') setFleet(item); else setDestination(item)
    back(kind); setRecalculating(true); setError(false)
    timer.current = setTimeout(() => { setRecalculating(false); timer.current = null }, 400)
  }
  const start = () => {
    if (blocked || pending || recalculating) return
    setPending(true); setError(false)
    timer.current = setTimeout(() => {
      timer.current = null; setPending(false)
      if (scenario === 'failure') setError(true)
      else { setStatus(true); setJourney({ elapsed: 0, stopped: false }) }
      requestAnimationFrame(() => contentRef.current?.focus())
    }, 450)
  }
  const stop = () => { if (!pending) { setJourney(current => current ? { ...current, stopped: true } : null); requestAnimationFrame(() => contentRef.current?.focus()) } }
  return <div className={styles.instance} onKeyDown={event => { if (event.key === 'Escape' && selecting) { event.stopPropagation(); back(selecting) } }}>
    {open ? <HudCardShell title={selecting ? `Choose ${selecting}` : status ? 'Fleet status' : 'Travel review'} lighting="none" className={`${styles.card} ${selecting ? styles.choosing : ''}`} contentClassName={styles.shellContent} onClose={() => { if (selecting) back(selecting); else setOpen(false) }} closeLabel={selecting ? 'Close selector and return to trip' : 'Close travel card'}>
      {(['fleet', 'destination'] as const).map(kind => <div key={kind} hidden={selecting !== kind} className={styles.chooserHost}><Chooser kind={kind} concept={concept} selected={kind === 'fleet' ? fleet : destination} counterpart={kind === 'fleet' ? destination : fleet} onChoose={item => choose(kind, item)} onBack={() => back(kind)} objective={objective} searchRef={kind === 'fleet' ? searchFleet : searchDestination} /></div>)}
      <div hidden={!!selecting} className={styles.reviewHost}>
        <div className={styles.review} ref={contentRef} tabIndex={-1}>
          {status && journey ? <>
            <HudHeading size="compact">{fieldName(fleet)}</HudHeading><HudText role="status">{journey.stopped ? 'Stopped · Parked in place' : running ? `Travelling · ${destination.name}` : `Arrived · ${destination.name}`}</HudText>
            {!journey.stopped && <><progress aria-label="Travel progress" className={styles.progress} value={journey.elapsed} max={180} /><HudText>{Math.floor(journey.elapsed / 180 * 100)}% · {180 - journey.elapsed}s remaining</HudText></>}
          </> : <>
            <div className={styles.identities}>{([['fleet', fleet], ['destination', destination]] as const).map(([kind, item]) => <HudButton key={kind} presentation="row" ref={kind === 'fleet' ? fleetTrigger : destinationTrigger} className={styles.identity} aria-label={`Change ${kind}`} disabled={pending || recalculating || running} onClick={() => openChooser(kind)}>
              <span className={`hud-type-label ${styles.identityLabel}`}>{kind === 'fleet' ? 'Fleet' : 'Destination'}</span><HudObjectThumbnail kind={itemArt(item)} className={styles.identityArt} /><span className={styles.identityText}><span className="hud-type-compact">{fieldName(item)}</span><span className="hud-type-secondary">{kind === 'fleet' ? item.mining ? 'Mining' : 'Ready' : item.type}{item.system !== 'Solace' ? ` · ${item.system}` : ''}</span></span><HudIcon icon={ChevronDownIcon} size={16} className={styles.identityChevron} />
            </HudButton>)}</div>
            {recalculating ? <HudText role="status">Recalculating trip…</HudText> : <HudFacts layout="rows" className={styles.facts} items={[
              { label: 'Travel time', value: <HudValue>{remote ? '—' : '3m 00s'}</HudValue> }, { label: 'Fuel cost', value: <HudValue>{remote ? '—' : '18 t'}</HudValue> }, { label: 'Fuel aboard', value: <HudValue>{fleet.fuel} t</HudValue> },
              { label: shortfall ? 'Fuel shortfall' : 'Fuel remaining', value: <HudValue>{remote ? '—' : `${shortfall || (fleet.fuel ?? 0) - 18} t`}</HudValue> }, { label: 'Fuel ceiling', value: <HudValue>{remote ? '—' : `${Number((18 * BURN_FUEL_ALLOWANCE).toFixed(2))} t`}</HudValue> },
            ]} />}
            {remote && <HudText className={styles.warning} role="status">Inter-system journey · route required.</HudText>}
            {fleet.mining && <HudText className={styles.warning}>Stop mining before travelling.</HudText>}
            {shortfall > 0 && <HudText className={styles.warning}>Insufficient fuel. Short by {shortfall} t.</HudText>}
            {error && <HudText className={styles.warning} role="alert">The order failed. No travel started. Try again.</HudText>}
          </>}
        </div>
        <HudActionBand label={status ? 'Fleet travel actions' : 'Trip actions'} actions={status ? [
          { id: 'back', label: 'Back to trip', onClick: () => setStatus(false) },
          { id: 'stop', label: 'Stop travel', tone: 'danger', disabled: !running, onClick: stop },
        ] : [
          { id: 'back', label: 'Back', onClick: () => setOpen(false) },
          { id: 'start', label: 'Start travel', pending, pendingLabel: 'Starting…', disabled: blocked || recalculating, onClick: start },
        ]} />
      </div>
    </HudCardShell> : <div className={styles.closed}><HudText>Card closed. {running ? 'Travel continues.' : 'No order changed.'}</HudText><HudButton onClick={() => setOpen(true)}>Reopen card</HudButton></div>}
    {journey && <div className={styles.reviewerTools}><HudButton variant="quiet" onClick={() => { setStatus(true); setOpen(true) }}>Open fleet status</HudButton>{running && <HudButton variant="quiet" onClick={() => setJourney(current => current ? { ...current, elapsed: 180 } : null)}>Simulate arrival</HudButton>}</div>}
    <HudText variant="caption" className={styles.disclaimer}>Fictional data: 240 fleets, 1,200 destinations. Remote selections test context only; route execution is not part of this preview.</HudText>
  </div>
}
