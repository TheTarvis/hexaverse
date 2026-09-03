// roster-commands — per-row command visibility (fleet-roster ADDED "The
// Roster Row Is the Fleet Command Surface", 8.8) and the running-mine gate's
// disable/countdown half (board-view ADDED "Running Mine Gates the Fleet
// Panel's Commands", 8.9). Pure, mirroring roster-status.ts's discipline: no
// clock, no fetch, and no re-derivation of a burn's settled geometry beyond
// the trivial ArriveMs comparison.

import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_BURN, SHIP_MODE_DRIFT } from '@/lib/types/fleet'

export interface RosterCommandVisibility {
  burn: boolean
  cutDrive: boolean
  stop: boolean
  jump: boolean
}

// isChartedGate: true when the given body id is a lane gate whose lane the
// corporation has charted. Injected rather than resolved here — how a caller
// answers it is a wiring decision left to the component composing this
// function. Consulted only where the mounting view declares that the roster
// owns the fleet commands; the system space view declares that it owns them
// itself and passes nothing (`FleetRoster`'s `commandOwner`).
export type IsChartedGate = (bodyId: string) => boolean

export function rosterCommandVisibility(
  fleet: Fleet,
  worldTime: number,
  isChartedGate: IsChartedGate,
): RosterCommandVisibility {
  const state = fleet.state
  const stillBurning =
    state?.Mode === SHIP_MODE_BURN && !!state.Burn && worldTime < state.Burn.ArriveMs
  const drifting = state?.Mode === SHIP_MODE_DRIFT

  const attachedTo = fleet.attachedTo
  const jump = !!attachedTo && isChartedGate(attachedTo)

  return {
    burn: true,
    cutDrive: stillBurning,
    stop: stillBurning || drifting,
    jump,
  }
}

export interface RosterMineGate {
  gated: boolean
  remainingMs?: number
}

export interface RunningMine {
  eta: number
  status?: string
}

export function rosterMineGate(
  worldTime: number,
  runningMine?: RunningMine | null,
): RosterMineGate {
  const gated = !!runningMine && runningMine.eta > worldTime
  return gated ? { gated: true, remainingMs: runningMine!.eta - worldTime } : { gated: false }
}
