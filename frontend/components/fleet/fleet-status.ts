// Fleet status — one fleet's movement state read as a sentence a player can act
// on: where it is, what it's doing, when it's done, and where clicking it should
// take you. Pure (no clock, no fetch): the roster passes the live world time in.
//
// The wire carries only the movement state, so the status is DERIVED from it —
// the same (state, worldTime) the board and the galaxy animate from, so the
// roster can never disagree with the picture.

import { stateAt } from '@/lib/hex'
import type { Fleet } from '@/lib/types/fleet'

// tone drives the row's accent: idle (nothing to watch), moving (an order is
// running), transit (out on a lane), held (parked mid-lane, wants a decision).
export type StatusTone = 'idle' | 'moving' | 'transit' | 'held'

export interface FleetStatus {
  tone: StatusTone
  // Where the fleet is: a system name, or "Origin → Destination" while on a lane.
  where: string
  // What it's doing, in the player's words.
  activity: string
  // World-ms remaining on the current order, when there's a known ETA.
  remainingMs?: number
  // The system to open when the row is clicked — null for a fleet on a lane,
  // which belongs to no board (the galaxy view is where it's visible).
  goToSystemId: string | null
}

// nameOf resolves a systemId to its display name (the galaxy read's names); it
// falls back to the id, so an unnamed/unknown system still reads sanely.
export type NameOf = (systemId: string) => string

export function fleetStatus(fleet: Fleet, worldTime: number, nameOf: NameOf): FleetStatus {
  // Read the EFFECTIVE state (stateAt): a burn whose arrival has passed IS
  // docked/coasting, so an arrived fleet never reads "Under way" with a negative
  // countdown while it waits for the next refetch.
  const s = stateAt(fleet.state, worldTime)
  const here = nameOf(fleet.systemId)

  switch (s.mode) {
    case 'laneTransit': {
      const lt = s.laneTransit
      if (!lt || lt.route.length < 2) break
      const dest = lt.route[lt.route.length - 1]
      const gateEta = lt.boardLeg?.gateEta
      // Before the gate ETA the hull is still crossing its origin board — it's
      // "departing", not yet on the lane, and clicking it should open that board
      // so you can watch it run for the gate.
      const departing = gateEta !== undefined && worldTime < gateEta
      return {
        tone: 'transit',
        where: `${here} → ${nameOf(dest)}`,
        activity: departing ? 'Departing' : 'In transit',
        remainingMs: lt.arriveTime - worldTime,
        goToSystemId: departing ? fleet.systemId : null,
      }
    }
    case 'laneHold': {
      const h = s.laneHold
      if (!h) break
      return {
        tone: 'held',
        where: `${nameOf(h.from)} → ${nameOf(h.to)}`,
        activity: 'Holding mid-lane',
        goToSystemId: null,
      }
    }
    case 'burn': {
      const b = s.burn
      if (!b) break
      return {
        tone: 'moving',
        where: here,
        activity: b.dockOnArrive ? 'Docking' : 'Under way',
        remainingMs: b.arriveTime - worldTime,
        goToSystemId: fleet.systemId,
      }
    }
    case 'docked':
      return { tone: 'idle', where: here, activity: 'Docked', goToSystemId: fleet.systemId }
    case 'coast':
      return { tone: 'idle', where: here, activity: 'On station', goToSystemId: fleet.systemId }
  }

  // A mode whose payload didn't come through (shouldn't happen — the server
  // writes exactly one shape) still reads as "somewhere", never as a blank row.
  return { tone: 'idle', where: here, activity: 'On station', goToSystemId: fleet.systemId }
}
