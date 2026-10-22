'use client'

import { useId, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { HudActionBand, type HudBandAction } from '@/components/hud/HudActionBand'
import { HudBackButton, HudButton } from '@/components/hud/HudControls'
import { HudCardShell, HudSection } from '@/components/hud/HudCardShell'
import { HudFacts } from '@/components/hud/HudFacts'
import { HudIcon } from '@/components/hud/HudIcon'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudProgress } from '@/components/hud/HudProgress'
import { HudHeading, HudText, HudValue } from '@/components/hud/HudTypography'
import { formatByUnit } from '@/lib/format'
import { scanFizzleCopy } from '@/lib/scan-copy'
import { fleetLabel } from '@/lib/fleet-label'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import { rosterRowStatus, type NameOf, type ResolveBody } from './roster-status'
import styles from './fleet-status.module.css'

export interface FleetStatusProps {
  fleet: Fleet | null
  worldTime: number
  scale: number | undefined
  nameOf: NameOf
  resolveBody?: ResolveBody
  mine?: GameAction | null
  scan?: GameAction | null
  scanReport?: GameAction | null
  loading?: boolean
  activityFailed?: boolean
  failed?: boolean
  notice?: string | null
  error?: string | null
  travelControlsOpen: boolean
  onTravelControls: () => void
  onBack: () => void
  onReviewTravel: () => void
  onFocus: () => void
  focusDisabled?: boolean
  focusLabel?: string
  onRetry: () => void
  pending?: boolean
  stopPending?: boolean
  onStop: () => void
  additionalActions?: readonly [] | readonly [HudBandAction] | readonly [HudBandAction, HudBandAction]
}

function canStop({ fleet, worldTime }: Pick<FleetStatusProps, 'fleet' | 'worldTime'>) {
  return !!fleet && !fleet.jump && (fleet.state.Mode === 2 || fleet.state.Mode === 0 && !!fleet.state.Burn && fleet.state.Burn.ArriveMs > worldTime)
}

export function FleetStatusActions(props: FleetStatusProps) {
  const { fleet, failed, loading, pending, stopPending, travelControlsOpen, onStop, onRetry, onFocus, onTravelControls, onReviewTravel, focusDisabled, focusLabel, additionalActions } = props
  if (loading) return <HudActionBand label="Fleet status actions" actions={[{ id: 'loading', label: 'Loading fleets', pending: true, pendingLabel: 'Loading fleets…', onClick: onRetry }]} />
  if (failed || !fleet) return <HudActionBand label="Fleet status actions" actions={[{ id: 'retry', label: failed ? 'Retry readings' : 'Refresh fleets', onClick: onRetry }]} />
  const hasTravelControls = canStop(props) || !!fleet.jump || !!additionalActions?.length
  if (!travelControlsOpen) return <HudActionBand label="Fleet status actions" actions={[
    { id: 'focus', label: focusLabel ?? 'Focus fleet', onClick: onFocus, disabled: focusDisabled || pending },
    { id: 'task', label: canStop(props) || fleet.jump ? 'Return to travel' : hasTravelControls ? 'Travel controls' : 'Review travel', onClick: hasTravelControls ? onTravelControls : onReviewTravel, disabled: pending },
  ]} />
  const [secondary, tertiary] = additionalActions ?? []
  const stop: HudBandAction = { id: 'stop', label: 'Stop travel', testId: 'travel-stop', tone: 'danger', disabled: pending, pending: stopPending, pendingLabel: 'Stopping…', onClick: onStop }
  return canStop(props)
    ? <HudActionBand label="Fleet travel actions" actions={secondary ? tertiary ? [secondary, stop, tertiary] : [secondary, stop] : [stop]} />
    : secondary ? <HudActionBand label="Fleet travel actions" actions={tertiary ? [secondary, tertiary] : [secondary]} />
      : <HudActionBand label="Fleet travel actions" actions={[{ id: 'review', label: 'Review travel', onClick: onReviewTravel, disabled: pending || !!fleet.jump }]} />
}

/** Activity-first status from served reads. Disclosure state belongs to this mounted view. */
export function FleetStatusContent(props: FleetStatusProps) {
  const { fleet, worldTime, scale, nameOf, resolveBody, mine, scan, scanReport, failed, loading, activityFailed, notice, error, travelControlsOpen, onBack, pending } = props
  const id = useId()
  const [cargo, setCargo] = useState(false)
  const [ships, setShips] = useState(false)
  const tons = (value: number | undefined) => formatByUnit(value ?? NaN, scale, 'tons')
  const duration = (value: number) => formatByUnit(Math.max(0, value), scale, 'world-ms-span-bare')
  if (loading) return <div className={styles.content} data-testid="fleet-status-card"><HudText role="status">Loading fleet readings…</HudText></div>
  if (failed || !fleet) return <div className={styles.content} data-testid="fleet-status-card"><HudHeading size="compact">{failed ? 'Fleet readings unavailable' : 'Choose an owned fleet'}</HudHeading><HudText role="status">{failed ? 'Refresh fleet readings to see current activity and cargo.' : 'No owned fleet is selected. Refresh readings to check available fleets.'}</HudText>{error && <HudText role="alert">{error}</HudText>}</div>
  const status = rosterRowStatus(fleet, worldTime, nameOf, mine, resolveBody)
  const burn = fleet.state.Mode === 0 ? fleet.state.Burn : null
  const timing = fleet.jump ? { start: fleet.jump.departMs, end: fleet.jump.arriveMs }
    : burn ? { start: burn.DepartMs, end: burn.ArriveMs }
      : mine ? { start: mine.committedAt, end: mine.eta } : null
  const progress = timing ? Math.max(0, Math.min(100, (worldTime - timing.start) / Math.max(1, timing.end - timing.start) * 100)) : null
  const awaiting = timing && timing.end <= worldTime
  const roster = fleet.roster
  const counts = new Map<string, number>()
  for (const ship of roster?.ships ?? []) counts.set(ship.class, (counts.get(ship.class) ?? 0) + 1)
  return <div className={styles.content} data-testid="fleet-status-card">
    {travelControlsOpen && <HudBackButton destination="fleet status" onClick={onBack} disabled={pending} />}
    <div className={styles.identity}><HudObjectThumbnail kind="fleet" /><div><HudHeading size="compact">{fleetLabel(fleet)}</HudHeading><HudText variant="secondary">Command fleet · {status.where}</HudText></div></div>
    <section className={styles.activity} aria-label="Fleet activity">
      <HudHeading variant="section" level={4}>{awaiting ? mine && !burn && !fleet.jump ? 'Awaiting mining confirmation' : 'Awaiting arrival confirmation' : status.activity}</HudHeading>
      <HudText variant="secondary">{status.targetLabel ?? status.hostLabel ?? status.where}</HudText>
      {progress !== null && <div className={styles.meter}><HudProgress label={mine && !burn && !fleet.jump ? 'Mining progress' : 'Travel progress'} value={progress} /><div className={styles.figures}><HudValue>{Math.floor(progress)}%</HudValue><HudText variant="secondary">{awaiting ? 'Waiting for fleet report' : <><HudValue>{duration(timing!.end - worldTime)}</HudValue> remaining</>}</HudText></div></div>}
      {activityFailed && <HudText role="status" variant="secondary">Action readings unavailable.</HudText>}
      {scan && <section className={styles.sensor} aria-label="Sensor activity"><HudText>Focused scan</HudText><HudText variant="secondary">{scan.eta <= worldTime ? 'Awaiting scan confirmation' : <><HudValue>{duration(scan.eta - worldTime)}</HudValue> remaining</>}</HudText></section>}
      {!scan && scanReport && <section className={styles.sensor} aria-label="Scan report"><HudText>{scanReport.reasonCode ? 'Focused scan failed' : 'Focused scan completed'}</HudText><HudText role="status" variant="secondary">{scanFizzleCopy(scanReport.reasonCode)}</HudText></section>}
    </section>
    {!roster && <HudText role="status" variant="secondary">Roster readings unavailable.</HudText>}
    <HudFacts layout="rows" items={[
      { label: 'Fuel', value: <HudValue>{tons(roster?.cargo?.fuel)}</HudValue> },
      { label: 'Hold used', value: <HudValue>{tons(roster ? roster.cargoCapacity - roster.freeHold : undefined)} / {tons(roster?.cargoCapacity)}</HudValue> },
    ]} />
    <div className={styles.details}>
      <HudButton presentation="row" aria-expanded={cargo} aria-controls={`${id}-cargo`} disabled={!roster} onClick={() => setCargo(value => !value)}><HudIcon icon={cargo ? ChevronUpIcon : ChevronDownIcon} size={16} />Cargo{roster && ` · ${tons(roster.freeHold)} free`}</HudButton>
      {cargo && roster && <div id={`${id}-cargo`}><HudFacts layout="rows" items={[
        ...(roster.cargo ? Object.entries(roster.cargo).map(([kind, value]) => ({ label: kind === 'fuel' ? 'Fuel (in hold)' : kind, value: <HudValue>{tons(value)}</HudValue> })) : [{ label: 'Cargo', value: 'Unavailable' }]),
        { label: 'Free space', value: <HudValue>{tons(roster.freeHold)}</HudValue> },
      ]} /><HudText variant="caption">Cargo is pooled across the fleet. Fuel occupies hold space.</HudText></div>}
      <HudButton presentation="row" aria-expanded={ships} aria-controls={`${id}-ships`} disabled={!roster} onClick={() => setShips(value => !value)}><HudIcon icon={ships ? ChevronUpIcon : ChevronDownIcon} size={16} />Ships{roster && ` · ${roster.ships.length}`}</HudButton>
      {ships && roster && <HudSection id={`${id}-ships`}><HudFacts layout="rows" items={[
        ...Array.from(counts, ([kind, count]) => ({ label: kind, value: <HudValue>× {count}</HudValue> })),
        { label: 'Combined hold', value: <HudValue>{tons(roster.cargoCapacity)}</HudValue> },
      ]} /></HudSection>}
    </div>
    {notice && <HudText role="status">{notice}</HudText>}
    {error && <HudText role="alert" className={styles.warning}>{error}</HudText>}
    {fleet.strandingWarning && <HudText className={styles.warning}>This course leaves the fleet unable to reach a station or lane gate.</HudText>}
  </div>
}

export function FleetStatusCard(props: FleetStatusProps & { onClose: () => void; className?: string }) {
  return <HudCardShell title="Fleet status" onClose={props.onClose} closeLabel="Close fleet status" className={props.className} footer={<FleetStatusActions {...props} />}><FleetStatusContent {...props} /></HudCardShell>
}
