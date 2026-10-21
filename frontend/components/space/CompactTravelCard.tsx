'use client'

import { fleetLabel } from '@/lib/fleet-label'
import type { ReactNode } from 'react'
import { HudBackButton, HudButton } from '@/components/hud/HudControls'
import { Select } from '@/components/catalyst/select'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { HudProgress } from '@/components/hud/HudProgress'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
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
  /** Only the Stop request is busy; other travel requests still lock the control. */
  stopPending?: boolean
  warning?: boolean
  additionalActions?: ReactNode
  onFleet: (id: string) => void
  onChooseFleet?: () => void
  onStart: () => void
  onStop: () => void
  onBack: () => void
  onClose: () => void
  onRetry: () => void
}

/** Presentation only. Quotes, command ownership and mutations stay in the system view. */
export function CompactTravelCard({ mode, fleet, fleets, systemId, destination, quote, worldTime, scale, blocker, notice, error, pending, stopPending, warning, onFleet, onChooseFleet, onStart, onStop, onBack, onClose, onRetry, additionalActions }: CompactTravelCardProps) {
  const fuel = fleet?.roster?.cargo?.fuel
  const burn = fleet?.state?.Mode === 0 ? fleet.state.Burn : null
  const traveling = !!burn && burn.ArriveMs > worldTime
  const progress = burn ? Math.max(0, Math.min(100, (worldTime - burn.DepartMs) / Math.max(1, burn.ArriveMs - burn.DepartMs) * 100)) : 100
  const tons = (value: number | undefined) => formatByUnit(value ?? NaN, scale, 'tons')
  const duration = (time: number) => formatByUnit(Math.max(0, time), scale, 'world-ms-span-in')
  return <HudCardShell title={mode === 'review' ? 'Travel review' : 'Command fleet'} onClose={onClose} closeLabel="Close travel card" className={styles.card}>
    <div className={styles.content} data-testid="compact-travel-card">
      <HudBackButton destination="objects" onClick={onBack} disabled={pending} />
      {mode === 'review' ? <>
        {onChooseFleet ? <div><HudText>Command fleet · {fleet ? fleetLabel(fleet) : 'Choose a fleet'}</HudText><HudButton onClick={onChooseFleet} disabled={pending}>Choose command fleet</HudButton></div> : <label className={styles.picker}>Command fleet
          <Select aria-label="Travel command fleet" value={fleet?.id ?? ''} disabled={pending} onChange={event => onFleet(event.target.value)}>
            {!fleet && <option value="">Choose a fleet</option>}
            {fleets.map(item => <option key={item.id} value={item.id} disabled={!!item.jump || item.systemId !== systemId}>{fleetLabel(item)}{item.jump ? ' · In transit' : item.systemId !== systemId ? ' · Other system' : ''}</option>)}
          </Select>
        </label>}
        <HudHeading size="compact">{destination}</HudHeading>
        <HudText variant="secondary">Outbound travel</HudText>
        {quote ? <HudFacts items={[
          { label: 'Arrival', value: duration(quote.arriveMs - worldTime) },
          { label: 'Fuel cost', value: tons(quote.fuelCostTons) },
          { label: 'Fuel ceiling', value: tons(quote.fuelCostTons * BURN_FUEL_ALLOWANCE) },
          { label: 'Fuel aboard', value: tons(fuel) },
          { label: quote.affordable ? 'Fuel remaining' : 'Fuel shortfall', value: tons(fuel === undefined ? undefined : quote.affordable ? Math.max(0, fuel - quote.fuelCostTons) : Math.max(0, quote.fuelCostTons - fuel)) },
        ]} /> : <p role="status">{blocker || 'Calculating trip…'}</p>}
        {quote?.strandingWarning && <p className={styles.warning}>This trip may leave this fleet unable to reach a station or lane gate.</p>}
        {blocker && quote && <p role="status" className={styles.warning}>{blocker}</p>}
        {error && <p role="alert" className={styles.warning}>{error}</p>}
        <div className={styles.actions}>
          <HudButton variant="primary" data-testid="travel-start" pending={pending} pendingLabel="Starting…" disabled={!!blocker || !quote?.affordable} onClick={onStart}>Start travel</HudButton>
        </div>
        {!quote && <HudButton variant="quiet" disabled={pending} onClick={onRetry}>Retry estimate</HudButton>}
      </> : <>
        <HudHeading size="compact">{fleet ? fleetLabel(fleet) : 'Fleet unavailable'}</HudHeading>
        <HudText>{fleet?.jump ? 'In inter-system transit' : traveling ? 'Travelling' : fleet?.state?.Mode === 2 ? 'Drifting' : 'Ready'} · {destination}</HudText>
        {burn && <div className={styles.travelProgress}><HudProgress label="Travel progress" value={progress} /><div className={styles.progressFigures}><HudValue>{Math.floor(progress)}%</HudValue><HudText variant="secondary"><HudValue>{traveling ? duration(burn.ArriveMs - worldTime) : 'Arrived'}</HudValue></HudText></div></div>}
        {notice && <p role="status">{notice}</p>}
        {warning && <p className={styles.warning}>This course leaves the fleet unable to reach a station or lane gate.</p>}
        {error && <p role="alert" className={styles.warning}>{error}</p>}
        {fleet && !fleet.jump && (traveling || fleet.state?.Mode === 2) && <HudButton tone="danger" data-testid="travel-stop" disabled={pending} pending={stopPending} pendingLabel="Stopping…" onClick={onStop}>Stop travel</HudButton>}
        {additionalActions}
      </>}
    </div>
  </HudCardShell>
}
