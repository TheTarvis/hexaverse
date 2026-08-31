// presence — the galaxy-view MODIFIED "Own-Fleet Presence and Recenter
// Target" derivation (migrate-fleet-to-continuous-burns, tasks.md 8.12).
//
// A fleet mid-jump (`jump` set) has no cell in either system — it is not
// "present" at the system it left (design.md Decision 4, Decision 10: a jump
// is atomic and single-hop, so there is no held-mid-lane state to occupy).

import type { Fleet } from '@/lib/types/fleet'

type PresenceFleet = Pick<Fleet, 'systemId' | 'jump'>

// ownFleetPresenceSystemIds — the systems hosting at least one of the
// requester's own fleets that are not currently mid-jump.
export function ownFleetPresenceSystemIds(fleets: PresenceFleet[]): string[] {
  const ids = new Set<string>()
  for (const f of fleets) {
    if (f.jump) continue
    ids.add(f.systemId)
  }
  return [...ids]
}

// recenterTargetSystemId — the system the recenter control snaps to: the
// first non-jumping own fleet's system, or null (whole-galaxy framing) when
// every own fleet is mid-jump or there are none.
export function recenterTargetSystemId(fleets: PresenceFleet[]): string | null {
  for (const f of fleets) {
    if (!f.jump) return f.systemId
  }
  return null
}
