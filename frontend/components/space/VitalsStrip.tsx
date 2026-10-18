'use client'

// VitalsStrip — the always-on instrument bar across the foot of the system
// space view (openspec change `add-vitals-strip`, capability
// `system-console`). Container + the fuel/hold/credits/clock cells; the
// fleet cell (identity, chevron, state pill) is `VitalsStripFleetCell`.
//
// THE STRIP ISSUES NO READ OF ITS OWN (contract §7.2/R11): every prop here
// is a value the mounting view already holds. No hook that reads, no
// service, no `apiClient` — layering per `frontend/CLAUDE.md`.
//
// THE STRIP CARRIES NO VERB (RULING 3): the chevron (inside
// `VitalsStripFleetCell`) is the only interactive surface; nothing here
// commits, cancels, or mutates.
//
// THE HOLD AND CREDITS CELLS INHERIT THE PANEL'S FORMER TESTIDS, on
// purpose (RULING 17, contract §3): `balance-readout`, `balance-value`,
// `balance-figure`, `balance-live-region`, `hold-readout`, `hold-capacity`,
// `hold-capacity-used`, `hold-capacity-total`, `hold-free`, `hold-<kind>`,
// `hold-<kind>-tons` — so five tier-4 e2e specs need no edit. Each of those
// testids' subtree carries EXACTLY one `[data-raw]` (`hold-capacity`
// excepted, the one sanctioned composite) — `e2e/helpers/space-view.ts`'s
// `digits()` throws on zero or on two-or-more.

import { useRef, useState } from 'react'
import { Figure } from '@/components/figure/Figure'
import { Gauge, type GaugeCost, type GaugeSegment } from './Gauge'
import { VitalsStripFleetCell } from './VitalsStripFleetCell'
import { VitalsStripPill } from './VitalsStripPill'
import type { RosterRowStatus } from '@/components/fleet/roster-status'
import { formatByUnit, instantScaleLabel } from '@/lib/format'
import type { Fleet, FleetRoster } from '@/lib/types/fleet'

export interface VitalsStripProps {
  /** Production telemetry lives in Command; legacy fixtures may retain the instrument strip. */
  mode?: 'strip' | 'panel'
  /** The acting fleet, or null when none of the requester's fleets is in
   *  this system. */
  acting: Fleet | null
  /** ALL owned fleets, never filtered to this system. */
  ownedFleets: Fleet[]
  /** The own-fleets read's most recent attempt has failed. */
  fleetsFailed: boolean
  /** null when `fleetsFailed`. */
  status: RosterRowStatus | null
  /** === SystemSpaceView's selectFleet. */
  onSelectFleet: (fleet: Fleet) => void
  systemNames: Record<string, string>
  /** creditsShown — the mounting view's `useCorporationSessionOptional`-
   *  driven derivation (contract §6.3). */
  credits: number | null
  /** The mounting view's servedScale, un-defaulted. */
  scale: number | undefined
  /** The mounting view's projected, ticking worldTime. */
  worldTime: number
  /** The LAST SERVED world instant — what the clock cell holds at while no
   *  scale has been served. */
  serverWorldTime: number | undefined
  /** The view's current burn quote's cost and served flag, for the fuel
   *  gauge only. Omitted when there is no current quote. */
  burnCost?: GaugeCost
}

const LABEL = 'font-mono text-[10px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400'

function sortedCargoEntries(roster: FleetRoster | undefined): [string, number][] | undefined {
  if (!roster) return undefined
  const cargo = roster.cargo ?? {}
  return Object.entries(cargo).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

function FuelCell({
  roster,
  scale,
  draining,
  burnCost,
}: {
  roster: FleetRoster | undefined
  scale: number | undefined
  draining: boolean
  burnCost?: GaugeCost
}) {
  const fuelTons = roster?.cargo?.fuel
  const rangeVal = roster?.estimatedRange
  const capacity = roster?.cargoCapacity
  const segments: GaugeSegment[] | undefined =
    fuelTons === undefined ? undefined : [{ kind: 'fuel', tons: fuelTons }]

  return (
    <div data-testid="vitals-fuel-cell" className="flex items-center gap-2">
      <Gauge
        capacity={capacity}
        segments={segments}
        data-testid="fuel-gauge"
        className="h-1.5 w-10"
        {...(burnCost ? { cost: burnCost } : {})}
      />
      <Figure
        raw={fuelTons}
        unit="tons"
        text={formatByUnit(fuelTons ?? NaN, scale, 'tons')}
        data-testid="vitals-fuel-tons"
        className="font-mono text-[11px] text-zinc-900 dark:text-white"
      />
      <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        <Figure
          raw={rangeVal}
          unit="range"
          text={formatByUnit(rangeVal ?? NaN, scale, 'range')}
          data-testid="vitals-fuel-range"
        />
        <span>range</span>
      </span>
      {draining && (
        <span data-testid="vitals-fuel-draining" className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
          draining
        </span>
      )}
    </div>
  )
}

function HoldCell({ roster, scale }: { roster: FleetRoster | undefined; scale: number | undefined }) {
  const capacity = roster?.cargoCapacity
  const freeHold = roster?.freeHold
  const usedRaw = capacity !== undefined && freeHold !== undefined ? capacity - freeHold : undefined
  const entries = sortedCargoEntries(roster)
  const segments: GaugeSegment[] | undefined = entries?.map(([kind, tons]) => ({ kind, tons }))

  return (
    <div data-testid="vitals-hold-cell" className="flex flex-col gap-1">
      <div data-testid="hold-readout" className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={LABEL}>Hold</span>
          <span
            data-testid="hold-capacity"
            className="flex items-center gap-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400"
          >
            <Figure
              raw={usedRaw}
              unit="tons"
              text={formatByUnit(usedRaw ?? NaN, scale, 'tons')}
              data-testid="hold-capacity-used"
            />
            <span>/</span>
            <Figure
              raw={capacity}
              unit="tons"
              text={formatByUnit(capacity ?? NaN, scale, 'tons')}
              data-testid="hold-capacity-total"
            />
          </span>
          <Gauge capacity={capacity} segments={segments} data-testid="hold-gauge" className="h-1.5 w-14" />
        </div>
        <ul className="flex flex-wrap gap-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {entries?.map(([kind, tons]) => (
            <li key={kind} data-testid={`hold-${kind}`}>
              <span>{kind}</span>{' '}
              <Figure
                raw={tons}
                unit="tons"
                text={formatByUnit(tons, scale, 'tons')}
                data-testid={`hold-${kind}-tons`}
              />
            </li>
          ))}
          <li>
            <Figure
              raw={freeHold}
              unit="tons"
              text={formatByUnit(freeHold ?? NaN, scale, 'tons')}
              data-testid="hold-free"
            />{' '}
            free
          </li>
        </ul>
      </div>
    </div>
  )
}

function CreditsCell({ credits, scale }: { credits: number | null; scale: number | undefined }) {
  return (
    <div data-testid="vitals-credits-cell" className="flex flex-col items-end gap-0.5">
      <div data-testid="balance-readout" className="flex items-center gap-1.5">
        <span className={LABEL}>Credits</span>
        <span
          data-testid="balance-value"
          data-available={credits === null ? 'false' : 'true'}
          className={`font-mono text-sm ${
            credits === null ? 'text-zinc-500 italic' : 'text-zinc-900 dark:text-white'
          }`}
        >
          {credits === null ? (
            'Unavailable'
          ) : (
            <Figure
              raw={credits}
              unit="credits"
              text={formatByUnit(credits, scale, 'credits')}
              data-testid="balance-figure"
            />
          )}
        </span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" data-testid="balance-live-region">
        {credits === null ? 'Balance unavailable.' : `Balance ${formatByUnit(credits, scale, 'credits')}.`}
      </span>
    </div>
  )
}

function ClockCell({
  scale,
  worldTime,
  serverWorldTime,
}: {
  scale: number | undefined
  worldTime: number
  serverWorldTime: number | undefined
}) {
  // A REF LATCH, not a value test: `worldTime` is never undefined, so "has a
  // world time ever been served" cannot be read off it (contract §7.4).
  const everServed = useRef(false)
  if (serverWorldTime !== undefined) everServed.current = true

  const scaleServed = scale !== undefined
  const instant = !everServed.current ? undefined : scaleServed ? worldTime : serverWorldTime

  return (
    <div data-testid="vitals-clock-cell">
      <Figure
        raw={instant}
        unit="world-ms-instant"
        text={formatByUnit(instant ?? NaN, scale, 'world-ms-instant')}
        title={instantScaleLabel(scale)}
        data-testid="vitals-clock-stamp"
        className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400"
      />
    </div>
  )
}

export function VitalsStrip({
  mode = 'strip',
  acting,
  ownedFleets,
  fleetsFailed,
  status,
  onSelectFleet,
  systemNames,
  credits,
  scale,
  worldTime,
  serverWorldTime,
  burnCost,
}: VitalsStripProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const roster = acting?.roster
  const stranded = acting?.roster?.stranded ?? false
  const draining = status?.activityKind === 'underway'

  return (
    <div
      data-testid="vitals-strip"
      data-expanded={detailsOpen}
      className="pointer-events-auto flex h-14 items-center justify-between gap-4 border-t border-zinc-200 bg-zinc-50/95 px-4 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95"
    >
      {mode === 'strip' && <button type="button" data-testid="vitals-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Less telemetry' : 'Telemetry'}</button>}
      {mode === 'strip' && <div data-testid="vitals-fleet-cell">
        <VitalsStripFleetCell
          acting={acting}
          ownedFleets={ownedFleets}
          fleetsFailed={fleetsFailed}
          onSelectFleet={onSelectFleet}
          systemNames={systemNames}
          status={status}
          stranded={stranded}
          scale={scale}
          worldTime={worldTime}
        />
      </div>}
      {mode === 'panel' && <div data-testid="vitals-command-status" className="col-span-2">
        <VitalsStripPill status={status} stranded={stranded} scale={scale} worldTime={worldTime} />
      </div>}
      <FuelCell roster={roster} scale={scale} draining={draining} {...(burnCost ? { burnCost } : {})} />
      <HoldCell roster={roster} scale={scale} />
      <CreditsCell credits={credits} scale={scale} />
      <ClockCell scale={scale} worldTime={worldTime} serverWorldTime={serverWorldTime} />
    </div>
  )
}

export default VitalsStrip
