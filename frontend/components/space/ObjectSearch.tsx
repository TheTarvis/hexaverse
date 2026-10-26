'use client'

import { useLayoutEffect, useRef, type Ref } from 'react'
import { BuildingOffice2Icon, CubeIcon, GlobeAltIcon, QuestionMarkCircleIcon, SparklesIcon, Squares2X2Icon, StarIcon, RocketLaunchIcon } from '@heroicons/react/24/outline'
import { HudButton, HudSearchInput } from '@/components/hud/HudControls'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudText } from '@/components/hud/HudTypography'
import type { ResourceKind } from '@/lib/types/system-space'
import styles from './object-search.module.css'

export const fleetCategoryLabels = { owned: 'Owned', friendly: 'Friendly', enemy: 'Enemy', unknown: 'Unknown' } as const
const objectTypes = {
  all: { label: 'All', icon: Squares2X2Icon },
  fleets: { label: 'Fleets', icon: RocketLaunchIcon },
  structures: { label: 'Structures', icon: BuildingOffice2Icon },
  'resource-sites': { label: 'Resources', icon: CubeIcon },
  bodies: { label: 'Bodies', icon: GlobeAltIcon },
  stars: { label: 'Stars', icon: StarIcon },
  systems: { label: 'Systems', icon: SparklesIcon },
  other: { label: 'Other', icon: QuestionMarkCircleIcon },
} as const
export type ObjectSearchType = keyof typeof objectTypes
export type ObjectSearchEntry = {
  id: string
  name: string
  kind: string
  /** Anonymous contacts never load identified hull art. */
  analyzed?: boolean
  category?: keyof typeof fleetCategoryLabels
  owned?: boolean
  /** Disclosed resource-host role, including hosts whose contents are not known. */
  resourceSite?: boolean
  /** Only disclosed deposits; absence means the contents are not known. */
  resources?: readonly ResourceKind[]
  subtitle: string
  /** Caller-formatted historical context; absence does not imply live tracking. */
  lastObserved?: string
}
export type ObjectSearchValue = {
  type: ObjectSearchType
  presets: Partial<Record<ObjectSearchType, string>>
  search: string
  scrollTop: number
}
export const emptyObjectSearch: ObjectSearchValue = { type: 'all', presets: {}, search: '', scrollTop: 0 }
const resourceLabels: Record<ResourceKind, string> = { metals: 'Metals', volatiles: 'Volatiles', water: 'Water', organics: 'Organics', research: 'Research', exotic: 'Exotic' }
const bodyLabels = { planets: 'Planets', moons: 'Moons', asteroids: 'Asteroids', belts: 'Belts' } as const
function bodyCategory(item: ObjectSearchEntry): keyof typeof bodyLabels | null {
  switch (item.kind) {
    case 'rocky': case 'gas_giant': case 'ice': return 'planets'
    case 'moon': return 'moons'
    case 'asteroid': return 'asteroids'
    case 'belt': return 'belts'
    default: return null
  }
}

/** Resource deposits are a disclosed role, independent of physical kind or action eligibility. */
export function isObjectSearchResourceSite(item: ObjectSearchEntry): boolean {
  return item.resourceSite ?? (item.kind === 'resource-site' || !!item.resources?.length)
}

function matchesType(item: ObjectSearchEntry, type: ObjectSearchType): boolean {
  switch (type) {
    case 'all': return true
    case 'bodies': return bodyCategory(item) !== null
    case 'resource-sites': return isObjectSearchResourceSite(item)
    case 'fleets': return item.kind === 'fleet' || item.kind === 'burn'
    case 'structures': return item.kind === 'station' || item.kind === 'gate'
    case 'stars': return item.kind === 'star'
    case 'systems': return item.kind === 'system'
    case 'other': return !bodyCategory(item) && !isObjectSearchResourceSite(item)
      && !['fleet', 'burn', 'station', 'star', 'gate', 'system'].includes(item.kind)
  }
}

function matchesPreset(item: ObjectSearchEntry, type: ObjectSearchType, preset: string): boolean {
  if (preset === 'all') return true
  switch (type) {
    case 'bodies': return bodyCategory(item) === preset
    case 'fleets': return item.category === preset
    case 'structures': return preset === 'stations' ? item.kind === 'station' : preset === 'gates' ? item.kind === 'gate' : preset === 'owned-stations' && item.kind === 'station' && item.owned === true
    case 'resource-sites': return !!item.resources?.includes(preset as ResourceKind)
    default: return true
  }
}

export type ObjectSearchProps = {
  /** Disclosed, caller-scoped candidates; action callers supply eligible targets only. */
  inputRef?: Ref<HTMLInputElement>
  inputTestId?: string
  resultProps?: (item: ObjectSearchEntry) => {
    ref?: Ref<HTMLButtonElement>
    'data-testid'?: string
    'aria-pressed'?: boolean
    'aria-expanded'?: boolean
    'aria-controls'?: string
  }
  items: readonly ObjectSearchEntry[]
  value: ObjectSearchValue
  onChange: (value: ObjectSearchValue) => void
  onSelect: (id: string) => void
  /** Action searches omit secondary narrowing; caller eligibility still applies. */
  showPresets?: boolean
  layout?: 'compact' | 'image'
  status?: 'ready' | 'loading' | 'error'
  onRetry?: () => void
}

/** Shared controlled search for browsing and action target choice, independent of orders. */
export function ObjectSearch({ items, value, onChange, onSelect, showPresets = true, layout = 'compact', status = 'ready', onRetry, inputRef, inputTestId, resultProps }: ObjectSearchProps) {
  const results = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (results.current) results.current.scrollTop = value.scrollTop }, [value.scrollTop])
  const availableTypes = (Object.keys(objectTypes) as ObjectSearchType[]).filter(type => type === 'all' || type === value.type || items.some(item => matchesType(item, type)))
  const preset = showPresets ? value.presets[value.type] ?? 'all' : 'all'
  const presets = value.type === 'fleets' ? Object.entries(fleetCategoryLabels)
    : value.type === 'bodies' ? Object.entries(bodyLabels)
      : value.type === 'structures' ? [['stations', 'Stations'], ['gates', 'Gates'], ['owned-stations', 'Owned stations']]
      : value.type === 'resource-sites' ? Object.entries(resourceLabels).filter(([kind]) => kind === preset || items.some(item => isObjectSearchResourceSite(item) && item.resources?.includes(kind as ResourceKind))) : []
  const query = value.search.trim().toLowerCase()
  const rows = items.filter(item => matchesType(item, value.type)
    && matchesPreset(item, value.type, preset)
    && `${item.name} ${item.subtitle} ${item.lastObserved ?? ''}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const change = (patch: Partial<ObjectSearchValue>) => onChange({ ...value, ...patch, scrollTop: 0 })
  return <div data-slot="object-search" className={styles.search}>
    <HudSearchInput ref={inputRef} data-testid={inputTestId} aria-label="Find an object" placeholder="Find an object…" value={value.search} onChange={event => change({ search: event.target.value })} />
    <div role="group" aria-label="Object type" className={styles.filters}>
      {availableTypes.map(type => <HudButton key={type} presentation="chrome" selectionIndicator className={styles.filter} aria-pressed={value.type === type} onClick={() => change({ type })}>
        <HudIcon icon={objectTypes[type].icon} /><span>{objectTypes[type].label}</span>
      </HudButton>)}
    </div>
    {showPresets && presets.length > 0 && <div role="group" aria-label="Secondary presets" className={styles.presets}>
      {[['all', 'All'], ...presets].map(([id, label]) => <HudButton key={id} presentation="chrome" selectionIndicator className={styles.preset} aria-pressed={preset === id} title={id === 'unknown' ? 'Unanalyzed burns' : label} onClick={() => change({ presets: { ...value.presets, [value.type]: id } })}>{label}</HudButton>)}
    </div>}
    {value.type === 'fleets' && preset === 'unknown' && <HudText variant="caption">Unanalyzed burns · identity and allegiance unknown.</HudText>}
    <HudText variant="caption" role="status">{status === 'loading' ? 'Loading objects…' : status === 'error' ? 'Objects could not be loaded.' : `${rows.length} ${rows.length === 1 ? 'object' : 'objects'}`}</HudText>
    {status === 'error' && <div className={styles.message}><HudText role="alert">Check the connection and try again.</HudText>{onRetry && <HudButton presentation="chrome" onClick={onRetry}>Retry</HudButton>}</div>}
    {status === 'ready' && !rows.length && <div className={styles.message}><HudText>No matching objects.</HudText><HudButton presentation="chrome" onClick={() => onChange({ ...emptyObjectSearch, presets: {} })}>Clear filters</HudButton></div>}
    <div ref={results} role="region" aria-label="Search results" tabIndex={0} aria-busy={status === 'loading'} className={styles.results} onScroll={event => { const scrollTop = event.currentTarget.scrollTop; if (scrollTop !== value.scrollTop) onChange({ ...value, scrollTop }) }}>
      {status === 'ready' && <div className={styles.grid} data-layout={layout}>{rows.map(item => <HudButton key={item.id} presentation="row" className={styles.tile} data-object-id={item.id} {...resultProps?.(item)} onClick={() => onSelect(item.id)}>
        {item.kind === 'burn' || item.analyzed === false ? <HudObjectThumbnail analyzed={false} size={layout === 'image' ? 'large' : 'compact'} /> : <HudObjectThumbnail kind={item.kind} size={layout === 'image' ? 'large' : 'compact'} />}
        <span className={styles.tileText}><span className="hud-type-compact">{item.name}</span><span className="hud-type-secondary">{item.subtitle}</span>{item.lastObserved && <span className="hud-type-caption">Last observed · {item.lastObserved}</span>}</span>
      </HudButton>)}</div>}
    </div>
  </div>
}
