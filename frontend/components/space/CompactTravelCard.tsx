'use client'

import { useRef, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { rosterRowStatus, type RunningMine } from '@/components/fleet/roster-status'
import { fleetLabel } from '@/lib/fleet-label'
import { HudActionBand, type HudBandAction } from '@/components/hud/HudActionBand'
import { HudButton } from '@/components/hud/HudControls'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudCardBack, HudCardShell } from '@/components/hud/HudCardShell'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudText, HudValue } from '@/components/hud/HudTypography'
import type { HudTaskTitle } from '@/components/hud/hud-card-title'
import { BURN_FUEL_ALLOWANCE } from '@/lib/space-quote'
import { formatByUnit } from '@/lib/format'
import type { BurnPreview, Fleet } from '@/lib/types/fleet'
import { ObjectSearchCard } from './ObjectSearchCard'
import { emptyObjectSearch, type ObjectSearchProps } from './ObjectSearch'
import styles from './compact-travel-card.module.css'

export interface CompactTravelCardProps {
  /** Embedded cards put CompactTravelActions in the owning workspace footer. */
  footerHost?: 'card' | 'workspace'
  className?: string
  fleet: Fleet | null
  fleets: Fleet[]
  systemId: string
  destination: string
  destinationKind?: string
  quote: BurnPreview | null
  worldTime: number
  mine?: RunningMine | null
  scale: number | undefined
  blocker?: string | null
  error?: string | null
  pending?: boolean
  onFleet: (id: string) => void
  fleetSearchStatus?: ObjectSearchProps['status']
  onRetryFleetSearch?: () => void
  choosingFleet?: boolean
  onFleetSearchChange?: (open: boolean) => void
  onChooseFleet?: () => void
  onChooseDestination?: () => void
  onStart: () => void
  backDestination?: string
  onBack: () => void
  onClose: () => void
  onRetry: () => void
}

export function CompactTravelActions({ quote, blocker, pending, onStart, onRetry }: Pick<CompactTravelCardProps, 'quote' | 'blocker' | 'pending' | 'onStart' | 'onRetry'>) {
  const start: HudBandAction = { id: 'start', testId: 'travel-start', label: 'Start travel', pending, pendingLabel: 'Starting…', disabled: !!blocker || !quote?.affordable, onClick: onStart }
  const retry: HudBandAction = { id: 'retry', label: 'Retry estimate', disabled: pending, onClick: onRetry }
  return <HudActionBand label="Trip actions" actions={quote ? [start] : [retry, start]} />
}

/** Share the same task identity with the workspace when it owns this card's frame. */
export function travelCardTitle({ fleet, destination }: Pick<CompactTravelCardProps, 'fleet' | 'destination'>): HudTaskTitle {
  return { fleet: fleet ? fleetLabel(fleet) : null, action: 'travel', object: destination }
}

/** The production review and fixture reviews share this presentation and selection controls. */
export function CompactTravelCard(props: CompactTravelCardProps) {
  const { fleet, fleets, systemId, destination, destinationKind = 'unknown', quote, worldTime, mine, scale, blocker, error, pending, onFleet, onChooseFleet, onChooseDestination, onBack, onClose, footerHost = 'card', className } = props
  const [localChoosingFleet, setLocalChoosingFleet] = useState(false)
  const choosingFleet = props.choosingFleet ?? localChoosingFleet
  const setChoosingFleet = props.onFleetSearchChange ?? setLocalChoosingFleet
  const [search, setSearch] = useState(emptyObjectSearch)
  const fleetTrigger = useRef<HTMLButtonElement>(null)
  const fuel = fleet?.roster?.cargo?.fuel
  const tons = (value: number | undefined) => formatByUnit(value ?? NaN, scale, 'tons')
  const duration = (time: number) => formatByUnit(Math.max(0, time), scale, 'world-ms-span-bare')
  const finishFleetChoice = () => { setChoosingFleet(false); requestAnimationFrame(() => fleetTrigger.current?.focus()) }
  if (choosingFleet) return <ObjectSearchCard frameHost={footerHost === 'workspace' ? 'workspace' : 'card'} showPresets={false} title={{ search: 'command-fleet', scope: systemId, object: destination }} className={className}
    items={fleets.filter(item => !item.jump && item.systemId === systemId).map(item => ({ id: item.id, name: fleetLabel(item), kind: 'fleet', category: 'owned', subtitle: rosterRowStatus(item, worldTime, id => id).activity }))}
    value={search} onChange={setSearch} status={props.fleetSearchStatus} onRetry={props.onRetryFleetSearch} onSelect={id => { onFleet(id); finishFleetChoice() }} onBack={finishFleetChoice} backDestination="trip" onClose={onClose} />
  return <HudCardShell title={footerHost === 'workspace' ? undefined : travelCardTitle(props)} onClose={onClose} closeLabel="Close travel card" className={`${styles.card} ${className ?? ''}`} footer={footerHost === 'card' ? <CompactTravelActions {...props} /> : undefined}>
    <div className={styles.content} data-testid="compact-travel-card">
      <HudCardBack destination={props.backDestination ?? 'objects'} onClick={onBack} disabled={pending} />
      <div className={styles.identities}>
        <HudButton presentation="row" ref={fleetTrigger} className={styles.identity} aria-label="Change fleet" disabled={pending} onClick={onChooseFleet ?? (() => setChoosingFleet(true))}>
          <span className={`hud-type-label ${styles.identityLabel}`}>Fleet</span>
          <HudObjectThumbnail kind="fleet" className={styles.identityArt} />
          <span className={styles.identityText}><span className="hud-type-compact">{fleet ? fleetLabel(fleet) : 'Choose a fleet'}</span><span className="hud-type-secondary">{fleet ? rosterRowStatus(fleet, worldTime, id => id, mine).activity : 'Unavailable'}</span></span>
          <HudIcon icon={ChevronDownIcon} size={16} className={styles.identityChevron} />
        </HudButton>
        <HudButton presentation="row" className={styles.identity} aria-label="Change destination" disabled={pending} onClick={onChooseDestination ?? onBack}>
          <span className={`hud-type-label ${styles.identityLabel}`}>Destination</span>
          <HudObjectThumbnail kind={destinationKind} className={styles.identityArt} />
          <span className={styles.identityText}><span className="hud-type-compact">{destination}</span><span className="hud-type-secondary">{destinationKind === 'unknown' ? 'Outbound travel' : destinationKind.replaceAll('_', ' ')}</span></span>
          <HudIcon icon={ChevronDownIcon} size={16} className={styles.identityChevron} />
        </HudButton>
      </div>
      {quote ? <HudFacts layout="rows" className={styles.facts} items={[
        { label: 'Travel time', value: <HudValue>{duration(quote.arriveMs - quote.departMs)}</HudValue> },
        { label: 'Fuel cost', value: <HudValue>{tons(quote.fuelCostTons)}</HudValue> },
        { label: 'Fuel aboard', value: <HudValue>{tons(fuel)}</HudValue> },
        { label: quote.affordable ? 'Fuel remaining' : 'Fuel shortfall', value: <HudValue>{tons(fuel === undefined ? undefined : quote.affordable ? Math.max(0, fuel - quote.fuelCostTons) : Math.max(0, quote.fuelCostTons - fuel))}</HudValue> },
        { label: 'Fuel ceiling', value: <HudValue>{tons(quote.fuelCostTons * BURN_FUEL_ALLOWANCE)}</HudValue> },
      ]} /> : <HudText role="status">{blocker || 'Calculating trip…'}</HudText>}
      {quote?.strandingWarning && <HudText className={styles.warning}>This trip may leave this fleet unable to reach a station or lane gate.</HudText>}
      {blocker && quote && <HudText role="status" className={styles.warning}>{blocker}</HudText>}
      {error && <HudText role="alert" className={styles.warning}>{error}</HudText>}
    </div>
  </HudCardShell>
}
