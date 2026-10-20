'use client'

import { HudFacts } from '@/components/hud/HudFacts'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { planetKind } from './webgl/scene-art'
import { SpacecraftPreview } from './SpacecraftPreview'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { HudButton, HudIconButton } from '@/components/hud/HudControls'
import { Input } from '@/components/catalyst/input'
import styles from './system-object-index.module.css'

export interface IndexedObject {
  name: string
  label?: string
  catalogueRef?: string
  enclosingStar?: string
  kind: string
  group: string
  x: number
  y: number
  starClass?: string
  className?: string
  knownFrom?: string
  resources?: string
  fleets?: string[]
  fleet?: {
    id: string
    mode?: 0 | 1 | 2
    activity: string
    systemLabel: string
    attachedTo?: string
    shipCount?: number
  }
}

/** The index consumes disclosed objects; anonymous contacts never load hull art. */
function ObjectThumbnail({ object, className }: { object: IndexedObject; className?: string }) {
  const kind = object.kind.trim().toLowerCase().replaceAll('_', ' ')
  if (kind === 'contact' || kind === 'unresolved contact') return <HudObjectThumbnail analyzed={false} className={className} />
  const category = object.fleet ? 'fleet' : kind === 'fleet' ? 'unknown' : object.group === 'Lane gates' ? 'gate' : object.kind
  return <HudObjectThumbnail kind={category} className={className} />
}

/** Shared object browser. Opening details never issues a command. */
export function SystemObjectIndex({ objects, selected, open, onOpen, onSelect, onFocus, offscreen, onOffscreen, canPlot = false, onPlot, systemName = 'System', detailContent, inspectorBody, compact = false, servicesWithoutDetails = false, detailContentFor, tutorialTarget, plotHint, loading = false, failed = false, onRetry, disabled = false, selectedFleetId, onSelectFleet, onFocusFleet, fleetsLoading = false, fleetsFailed = false, onRetryFleets }: {
  selectedFleetId?: string | null
  onSelectFleet?: (fleetId: string) => void
  onFocusFleet?: (fleetId: string) => void
  fleetsLoading?: boolean
  fleetsFailed?: boolean
  onRetryFleets?: () => void
  /** Independently read station services remain usable when body telemetry fails. */
  servicesWithoutDetails?: boolean
  compact?: boolean
  inspectorBody?: ReactNode
  detailContent?: ReactNode
  detailContentFor?: string
  systemName?: string
  tutorialTarget?: string | null
  plotHint?: string
  loading?: boolean
  failed?: boolean
  onRetry?: () => void
  disabled?: boolean
  canPlot?: boolean
  onPlot?: () => void
  objects: IndexedObject[]
  selected: string | null
  /** Preview activity only. The disclosed-object list is always visible. */
  open: boolean
  onOpen: (open: boolean) => void
  onSelect: (name: string) => void
  onFocus: () => void
  offscreen?: boolean
  onOffscreen?: () => void
}) {
  const [details, setDetails] = useState<string | null>(null)
  const expandButtons = useRef(new Map<string, HTMLElement>())
  const searchRef = useRef<HTMLInputElement>(null)
  const rowKey = (object: IndexedObject) => JSON.stringify([object.fleet ? 'fleet' : 'body', object.fleet?.id ?? object.name])
  const available = objects.filter(object => object.fleet ? !fleetsFailed && !fleetsLoading : !failed && !loading)
  const fleetDetail = details?.startsWith('["fleet",') ?? false
  const detailObject = details ? available.find(object => fleetDetail
    ? !!object.fleet && object.fleet.id === selectedFleetId && rowKey(object) === details
    : !object.fleet && object.name === selected) : undefined
  const fleetFacts = detailObject?.fleet
  const selectedPlanet = detailObject && !fleetFacts ? planetKind(detailObject.kind) : null
  const previousSelected = useRef(selected)
  useEffect(() => {
    if (previousSelected.current !== selected && fleetDetail) setDetails(selected ? JSON.stringify(['body', selected]) : null)
    previousSelected.current = selected
  }, [selected, fleetDetail])
  useEffect(() => {
    if (!fleetDetail || detailObject) return
    setDetails(null)
    if (open) searchRef.current?.focus()
  }, [fleetDetail, detailObject, open])
  function closeDetails() {
    setDetails(null)
    if (details) requestAnimationFrame(() => (expandButtons.current.get(details) ?? searchRef.current)?.focus())
  }
  const [search, setSearch] = useState('')
  const matches = available.filter(object => `${object.label ?? object.name} ${object.catalogueRef ?? ""} ${object.kind}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <div className={`${styles.indexShell} ${compact ? styles.compact : ''}`}>
    {/* Rows stay visible; `open` controls expensive detail previews, not disclosure. */}
    <div className={styles.indexPanels} data-details={!!detailObject || servicesWithoutDetails} onKeyDown={event => {
      if (event.key === 'Escape' && details) { event.stopPropagation(); closeDetails() }
    }}>
      <aside id="system-index" className={styles.systemIndex} aria-label="System index" style={inspectorBody ? { display: 'none' } : undefined}>
        <div className={styles.searchHeader} data-testid="system-index-search-header">
        <HudText variant="label">{systemName} / Known objects</HudText>
        <Input ref={searchRef} type="search" autoComplete="off" spellCheck={false} enterKeyHint="search" data-testid="system-index-search" aria-label="Find a system object" placeholder="Find a world, station, fleet…" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <div data-testid="system-index-results">
        {loading && <HudText variant="secondary" role="status">Loading system objects…</HudText>}
        {failed && <div role="alert"><HudText variant="secondary">System objects are unavailable.</HudText><HudButton variant="quiet" data-testid="index-retry" onClick={onRetry}>Retry</HudButton></div>}
        {fleetsLoading && <HudText variant="secondary" role="status">Loading fleets…</HudText>}
        {fleetsFailed && <div role="alert"><HudText variant="secondary">Fleet telemetry is unavailable.</HudText><HudButton variant="quiet" data-testid="index-fleets-retry" onClick={onRetryFleets}>Retry fleets</HudButton></div>}
        {Array.from(new Set(available.map(object => object.group))).map(group => {
          const rows = matches.filter(object => object.group === group)
          return rows.length > 0 && <section key={group}><HudHeading variant="section" level={3}>{group}</HudHeading>{rows.map(object => <div key={rowKey(object)} className={styles.indexRow} data-selected={object.fleet ? selectedFleetId === object.fleet.id : !fleetDetail && selected === object.name}>
            <HudButton presentation="row" ref={el => { if (el) expandButtons.current.set(rowKey(object), el); else expandButtons.current.delete(rowKey(object)) }} data-testid={object.fleet ? `index-fleet-${object.fleet.id}` : `index-${object.name}`} aria-pressed={object.fleet ? selectedFleetId === object.fleet.id : !fleetDetail && selected === object.name} aria-expanded={!!detailObject && rowKey(detailObject) === rowKey(object)} aria-controls="object-details" onClick={() => { if (!open) onOpen(true); if (object.fleet) onSelectFleet?.(object.fleet.id); else onSelect(object.name); setDetails(detailObject && rowKey(detailObject) === rowKey(object) ? null : rowKey(object)) }}>
              <ObjectThumbnail object={object} />
              <span className={styles.rowCopy}><span className="hud-type-compact">{object.label ?? object.name}</span><small>{object.enclosingStar && `${object.enclosingStar} · `}{object.catalogueRef && `${object.catalogueRef} · `}{object.kind}{object.name === tutorialTarget ? ' · Tutorial destination' : ''}</small></span>
              <span aria-hidden="true" className={styles.rowChevron}>{detailObject && rowKey(detailObject) === rowKey(object) ? '‹' : '›'}</span>
            </HudButton>
          </div>)}</section>
        })}
        {!loading && !failed && !fleetsLoading && !fleetsFailed && matches.length === 0 && <HudText variant="secondary" role="status">{available.length ? 'No known objects match. Try a name or type.' : 'No objects have been disclosed in this system.'}</HudText>}
        <small className={styles.muted}>Select an object to open or close its details.</small>
        </div>
      </aside>
      {(detailObject || detailContent || inspectorBody) && <aside style={!detailObject && !inspectorBody && !servicesWithoutDetails ? { display: 'none' } : inspectorBody ? { padding: 0, border: 0, background: 'transparent', overflow: 'visible' } : undefined} id="object-details" className={styles.objectDetails} aria-label={detailObject ? `Details for ${detailObject.label ?? detailObject.name}` : servicesWithoutDetails ? 'Docked station services' : undefined}>
        {inspectorBody}
        {servicesWithoutDetails && !detailObject && <header className={styles.detailsHeader}><div><p>Docked station services</p><p className={styles.muted}>System objects are unavailable. Your station services are still connected.</p><HudButton variant="quiet" onClick={onRetry}>Retry system objects</HudButton></div></header>}
        <div hidden={!!inspectorBody} style={{ display: inspectorBody ? 'none' : 'contents' }}>
        {detailObject && <header className={styles.detailsHeader}><p className={styles.eyebrow}>SELECTED {fleetFacts ? 'FLEET' : detailObject.group === 'Stations' ? 'STATION' : detailObject.group === 'Worlds' ? 'WORLD' : 'OBJECT'}</p><HudIconButton icon={ArrowLeftIcon} label="Close details and return to objects" autoFocus presentation="chrome" className={styles.detailsClose} data-testid="details-back" onClick={closeDetails} /></header>}
        <div className={styles.detailsBody}>{detailObject && <><div className={styles.inspectorTitle}><>{!fleetFacts && !selectedPlanet && detailObject.kind !== 'station' && detailObject.kind !== 'star' && <ObjectThumbnail object={detailObject} className={styles.portrait} />}</><div><HudHeading size="compact" level={3}>{detailObject.label ?? detailObject.name}</HudHeading>{detailObject.catalogueRef && <p>{detailObject.catalogueRef}</p>}<p className={styles.muted}>{detailObject.kind}</p></div></div>
        {open && fleetFacts && <SpacecraftPreview key={`fleet:${fleetFacts.id}`} kind="ship" objectId={fleetFacts.id} label={fleetFacts.id} accentColor={fleetFacts.mode === 0 ? 0xffb454 : fleetFacts.mode === 2 ? 0xc4b5fd : 0x4ade80} />}
        {open && !fleetFacts && detailObject.kind === 'station' && <SpacecraftPreview key={`station:${detailObject.name}`} kind="station" objectId={detailObject.name} label={detailObject.label ?? detailObject.name} accentColor={0x67e8f9} />}
        {open && !fleetFacts && detailObject.kind === 'star' && <SpacecraftPreview key={`star:${detailObject.name}:${detailObject.starClass ?? ''}`} kind="star" objectId={detailObject.name} starClass={detailObject.starClass} label={detailObject.label ?? detailObject.name} accentColor={0xffffff} />}
        {open && selectedPlanet && <SpacecraftPreview key={`${selectedPlanet}:${detailObject.name}`} kind={selectedPlanet} objectId={detailObject.name} label={detailObject.label ?? detailObject.name} accentColor={0xffffff} />}
        <HudFacts layout="rows" items={fleetFacts ? [
          { label: 'Activity', value: fleetFacts.activity }, { label: 'System', value: fleetFacts.systemLabel },
          ...(fleetFacts.attachedTo ? [{ label: 'Attached host', value: fleetFacts.attachedTo }] : []), { label: 'Ships', value: fleetFacts.shipCount ?? 'Unavailable' },
        ] : [
          { label: 'Known from', value: detailObject.knownFrom ?? 'Astronomical observation' },
          { label: 'Resources', value: detailObject.resources ?? 'Not surveyed — inspect or scan this host.' },
          { label: 'Fleets here', value: detailObject.fleets?.length ? detailObject.fleets.join(', ') : 'No known fleets' },
          ...(detailObject.group === 'Stations' ? [{ label: 'Services', value: 'Sell cargo · Purchase fuel while docked' }] : []),
        ]} /></>}
          <div className={styles.detailServices} style={fleetFacts || !servicesWithoutDetails && detailObject?.name !== detailContentFor ? { display: 'none' } : undefined}>{detailContent}</div>
        </div>
        {detailObject && <div className={styles.indexActions}>
          <HudButton variant="quiet" data-testid="index-focus" disabled={disabled} onClick={() => { if (fleetFacts) onFocusFleet?.(fleetFacts.id); else onFocus() }}>Focus {detailObject.label ?? detailObject.name} ⌖</HudButton>
          {!fleetFacts && (canPlot ? <HudButton variant="primary" className={styles.primary} data-testid="details-plot" disabled={disabled} onClick={onPlot}>Travel here</HudButton> : plotHint ? <small className={styles.muted}>{plotHint}</small> : null)}
          {!fleetFacts && onOffscreen && <HudButton variant="quiet" data-testid="simulate-offscreen" aria-pressed={offscreen} onClick={onOffscreen}>Preview off-screen locator</HudButton>}
        </div>}
        </div>
      </aside>}
    </div>
  </div>
}
