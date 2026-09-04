// roster-status — the roster row's status derivation (fleet-roster ADDED "One
// Row Per Owned Fleet, Derived From Kinematic State"; migrate-fleet-to-
// continuous-burns, tasks.md 8.5). Replaces the deleted `fleet-status.ts`
// (design.md Decision 12): status now derives from `space.ShipState`'s three
// shapes (burn/park/drift) plus the fleet-owned `attachedTo`/`jump` fields,
// never from the deleted board package's `MovementState`.
//
// Pure (no clock, no fetch): the caller passes the live world time in.
//
// No TypeScript mirror of `backend/space`'s curve/orbit math exists, or ever
// will (design.md Decision 1) — so this derivation uses ONLY a trivial
// integer comparison against the stored `ArriveMs` to tell whether a burn has
// already settled (t >= ArriveMs), never re-deriving the settled park's
// geometry. That is sufficient for a status LABEL (idle/docked vs moving);
// once a burn folds past its own arrival, "docked" is read off the fleet's
// own `attachedTo` field, exactly as an ordinary park is.

import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_BURN, SHIP_MODE_DRIFT } from '@/lib/types/fleet'

// tone drives the row's accent: idle (nothing to watch), moving (a burn is
// running), drifting (coasting free, unpowered), transit (crossing a lane).
export type StatusTone = 'idle' | 'moving' | 'drifting' | 'transit'

export interface RosterRowStatus {
  tone: StatusTone
  // Where the fleet is: a system name, or "Origin → Destination" mid-jump.
  where: string
  // What it's doing, in the player's words.
  activity: string
  // World-ms remaining on the current order, when there's a known ETA.
  remainingMs?: number
}

// nameOf resolves a systemId to its display name; falls back to the raw id
// when the caller has no name for it, so an unknown system still renders.
export type NameOf = (systemId: string) => string

export interface RunningMine {
  eta: number
  status?: string
}

export function rosterRowStatus(
  fleet: Fleet,
  worldTime: number,
  nameOf: NameOf,
  runningMine?: RunningMine | null,
): RosterRowStatus {
  const here = nameOf(fleet.systemId)

  // Mid-jump: a fleet-owned field, independent of `state` — a fleet in lane
  // transit has no position in either system (design.md Decision 4).
  if (fleet.jump) {
    return {
      tone: 'transit',
      where: `${here} → ${nameOf(fleet.jump.destSystemId)}`,
      activity: 'In transit',
      remainingMs: Math.max(0, fleet.jump.arriveMs - worldTime),
    }
  }

  const state = fleet.state
  const stillBurning =
    state?.Mode === SHIP_MODE_BURN && !!state.Burn && worldTime < state.Burn.ArriveMs
  if (stillBurning) {
    return {
      tone: 'moving',
      where: here,
      activity: 'Under way',
      remainingMs: state.Burn!.ArriveMs - worldTime,
    }
  }

  if (state?.Mode === SHIP_MODE_DRIFT) {
    return { tone: 'drifting', where: here, activity: 'Drifting' }
  }

  // Parked, or a burn folded past its own arrival — idle either way. Docked
  // reads off the fleet's own `attachedTo`, which the backend clears at burn
  // commit and sets only at resolve (design.md Decision 4, Decision 13).
  const docked = !!fleet.attachedTo

  if (docked && runningMine && runningMine.eta > worldTime) {
    return {
      tone: 'idle',
      where: here,
      activity: 'Mining',
      remainingMs: runningMine.eta - worldTime,
    }
  }

  return {
    tone: 'idle',
    where: here,
    activity: docked ? 'Docked' : 'On station',
  }
}
