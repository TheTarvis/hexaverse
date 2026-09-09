'use client'

// VitalsStripPill — the fleet cell's state pill (openspec change
// `add-vitals-strip`, `system-console`: *The Fleet Cell's State Pill Is a
// Projection of the Shared Roster Derivation*, impl contract §4).
//
// THE CLOSED PROPS SIGNATURE, FOUR PROPS, AND NO `Fleet` (contract §4.1,
// round 2 F2, done-conditions §16): this file imports no `Fleet` and
// branches on nothing but `RosterRowStatus`'s own additive fields
// (`activityKind`, `etaWorldMs`, `hostLabel`, `targetLabel`,
// `stationKeepRateTonsPerSecond`) plus the ambient render inputs `scale` and
// `worldTime`. Those fields are the shared derivation's own conclusions —
// never `Fleet.state`, `attachedTo`, a park kind, or an action ETA read from
// a fleet object, because this component never receives one. A branch on an
// actual `Fleet` field would be a type error here, not a review finding.
//
// THE ONLY ARITHMETIC THIS COMPONENT PERFORMS (contract §4.2, round 3 MAJOR
// 1): re-expressing the derivation's own absolute-instant ETA anchor
// (`etaWorldMs`) against the projected `worldTime` — `formatByUnit`
// dispatches `world-ms-span-left` to a SPAN formatter, and every live call
// site (`FleetActionsPanel.tsx`, `ScanControl.tsx`, `FleetRoster.tsx`)
// subtracts at the call site the same way. This is presentation arithmetic
// on a value the derivation already concluded, never a second derivation of
// fleet state — deriving a tone, an activity, a place on the ladder, or the
// anchor itself is what this component may never do. NEVER
// `status.remainingMs`: it is a span frozen at derivation time with no
// anchor, so the two-render advancing-countdown property (task 3.5) would
// fail against it. No local `countdown`/`formatEta` helper is extracted —
// `lib/format/guards.test.ts`'s `LOCAL_FORMATTER_RE` fails the per-commit
// gate on those two names anywhere under `components/space`/`components/
// fleet`.
//
// THE RENDERED LADDER (contract §4.3) switches on `activityKind` alone,
// never on `status.activity` — `activity` is player copy `fleet-roster`
// keeps byte-identical (Decision 4); a pill that branched on it would break
// the moment that copy changes. `hostLabel`/`targetLabel` are rendered as
// plain text SIBLINGS of any `<Figure>`, never inside one: served ids
// contain digits, and `figure-formatting`'s R11 clause 2 forbids a complete
// numeric token inside a `data-raw`-carrying element other than the one its
// own raw produced.

import type { ReactNode } from 'react'
import { Figure } from '@/components/figure/Figure'
import { ABSENT_FIGURE, formatByUnit } from '@/lib/format'
import type { RosterRowStatus } from '@/components/fleet/roster-status'

export interface VitalsStripPillProps {
  /** The derivation's output, or its explicit absence: the mounting view
   *  supplies null whenever the own-fleets read's most recent attempt has
   *  failed. */
  status: RosterRowStatus | null
  /** roster.stranded, served. An adornment of the CELL (RULING 13) — it
   *  rides beside the pill and never replaces its activity. */
  stranded: boolean
  /** The mounting view's servedScale — UN-defaulted (RULING 8). */
  scale: number | undefined
  /** The mounting view's ticking, projected worldTime. NEVER serverWorldTime. */
  worldTime: number
}

function etaFigure(status: RosterRowStatus, scale: number | undefined, worldTime: number): ReactNode {
  const span = status.etaWorldMs !== undefined ? status.etaWorldMs - worldTime : undefined
  return (
    <Figure
      raw={span}
      unit="world-ms-span-left"
      text={formatByUnit(span ?? NaN, scale, 'world-ms-span-left')}
      data-testid="vitals-pill-eta"
    />
  )
}

function rateFigure(status: RosterRowStatus, scale: number | undefined): ReactNode {
  const rate = status.stationKeepRateTonsPerSecond
  return (
    <Figure
      raw={rate}
      unit="tons-per-world-s"
      text={formatByUnit(rate ?? NaN, scale, 'tons-per-world-s')}
      data-testid="vitals-pill-rate"
    />
  )
}

function ladder(status: RosterRowStatus, scale: number | undefined, worldTime: number): ReactNode {
  switch (status.activityKind) {
    case 'transit':
      return (
        <>
          In transit {etaFigure(status, scale, worldTime)}
        </>
      )
    case 'underway':
      return (
        <>
          Under way{status.targetLabel !== undefined ? ` to ${status.targetLabel}` : ''}{' '}
          {etaFigure(status, scale, worldTime)}
        </>
      )
    case 'mining':
      return (
        <>
          Mining {etaFigure(status, scale, worldTime)}
        </>
      )
    case 'drifting':
      return <>Drifting</>
    case 'docked':
      return <>Docked{status.hostLabel !== undefined ? ` at ${status.hostLabel}` : ''}</>
    case 'holding':
      return (
        <>
          Holding {rateFigure(status, scale)}
        </>
      )
    case 'onstation':
    default:
      return <>On station</>
  }
}

export function VitalsStripPill({ status, stranded, scale, worldTime }: VitalsStripPillProps) {
  return (
    <>
      <span data-testid="vitals-state-pill">
        {status === null ? ABSENT_FIGURE : ladder(status, scale, worldTime)}
      </span>
      {stranded && <span data-testid="vitals-stranded">Stranded</span>}
    </>
  )
}

export default VitalsStripPill
