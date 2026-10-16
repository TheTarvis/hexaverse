'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/catalyst/button'
import { Select } from '@/components/catalyst/select'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { BURN_FUEL_ALLOWANCE } from '@/lib/space-quote'
import { formatByUnit } from '@/lib/format'
import type { BurnPreview, Fleet } from '@/lib/types/fleet'
import styles from './compact-travel-card.module.css'

export interface CompactTravelCardProps {
  mode: 'review' | 'status'
  fleet: Fleet | null
  fleets: Fleet[]
  systemId: string
  destination: string
  quote: BurnPreview | null
  worldTime: number
  scale: number | undefined
  blocker?: string | null
  notice?: string | null
  error?: string | null
  pending?: boolean
  warning?: boolean
  additionalActions?: ReactNode
  onFleet: (id: string) => void
  onStart: () => void
  onStop: () => void
  onBack: () => void
  onClose: () => void
  onRetry: () => void
}

/** Presentation only. Quotes, command ownership and mutations stay in the system view. */
export function CompactTravelCard({ mode, fleet, fleets, systemId, destination, quote, worldTime, scale, blocker, notice, error, pending, warning, onFleet, onStart, onStop, onBack, onClose, onRetry, additionalActions }: CompactTravelCardProps) {
  const fuel = fleet?.roster?.cargo?.fuel
  const burn = fleet?.state?.Mode === 0 ? fleet.state.Burn : null
  const traveling = !!burn && burn.ArriveMs > worldTime
  const progress = burn ? Math.max(0, Math.min(100, (worldTime - burn.DepartMs) / Math.max(1, burn.ArriveMs - burn.DepartMs) * 100)) : 100
  const tons = (value: number | undefined) => formatByUnit(value ?? NaN, scale, 'tons')
  const duration = (time: number) => formatByUnit(Math.max(0, time), scale, 'world-ms-span-in')
  return <HudCardShell title={mode === 'review' ? 'Travel review' : 'Command fleet'} onClose={onClose} closeLabel="Close travel card" className={styles.card}>
    <div className={styles.content} data-testid="compact-travel-card">
      {mode === 'review' ? <>
        <label className={styles.picker}>Command fleet
          <Select aria-label="Travel command fleet" value={fleet?.id ?? ''} disabled={pending} onChange={event => onFleet(event.target.value)}>
            {!fleet && <option value="">Choose a fleet</option>}
            {fleets.map(item => <option key={item.id} value={item.id} disabled={!!item.jump || item.systemId !== systemId}>Fleet {item.id.slice(-6)}{item.jump ? ' · In transit' : item.systemId !== systemId ? ' · Other system' : ''}</option>)}
          </Select>
        </label>
        <HudHeading size="compact">{destination}</HudHeading>
        <HudText variant="secondary">Outbound travel</HudText>
        {quote ? <dl className={styles.facts}>
          <dt>Arrival</dt><dd>{duration(quote.arriveMs - worldTime)}</dd>
          <dt>Fuel cost</dt><dd>{tons(quote.fuelCostTons)}</dd>
          <dt>Fuel ceiling</dt><dd>{tons(quote.fuelCostTons * BURN_FUEL_ALLOWANCE)}</dd>
          <dt>Fuel aboard</dt><dd>{tons(fuel)}</dd>
          <dt>{quote.affordable ? 'Fuel remaining' : 'Fuel shortfall'}</dt><dd>{tons(fuel === undefined ? undefined : quote.affordable ? Math.max(0, fuel - quote.fuelCostTons) : Math.max(0, quote.fuelCostTons - fuel))}</dd>
        </dl> : <p role="status">{blocker || 'Calculating trip…'}</p>}
        {quote?.strandingWarning && <p className={styles.warning}>This trip may leave this fleet unable to reach a station or lane gate.</p>}
        {blocker && quote && <p role="status" className={styles.warning}>{blocker}</p>}
        {error && <p role="alert" className={styles.warning}>{error}</p>}
        <div className={styles.actions}>
          <Button outline onClick={onBack} disabled={pending}>Back</Button>
          <Button color="cyan" data-testid="travel-start" disabled={pending || !!blocker || !quote?.affordable} onClick={onStart}>{pending ? 'Starting…' : 'Start travel'}</Button>
        </div>
        {!quote && <Button plain disabled={pending} onClick={onRetry}>Retry estimate</Button>}
      </> : <>
        <HudHeading size="compact">{fleet ? `Fleet ${fleet.id.slice(-6)}` : 'Fleet unavailable'}</HudHeading>
        <HudText>{fleet?.jump ? 'In inter-system transit' : traveling ? 'Travelling' : fleet?.state?.Mode === 2 ? 'Drifting' : 'Ready'} · {destination}</HudText>
        {burn && <><progress aria-label="Travel progress" value={progress} max={100} className={styles.progress} /><HudText>{Math.floor(progress)}% · {traveling ? duration(burn.ArriveMs - worldTime) : 'Arrived'}</HudText></>}
        {notice && <p role="status">{notice}</p>}
        {warning && <p className={styles.warning}>This course leaves the fleet unable to reach a station or lane gate.</p>}
        {error && <p role="alert" className={styles.warning}>{error}</p>}
        {fleet && !fleet.jump && (traveling || fleet.state?.Mode === 2) && <Button outline data-testid="travel-stop" disabled={pending} onClick={onStop}>{pending ? 'Stopping…' : 'Stop travel'}</Button>}
        {additionalActions}
        <Button plain onClick={onBack}>Browse destinations</Button>
      </>}
    </div>
  </HudCardShell>
}
