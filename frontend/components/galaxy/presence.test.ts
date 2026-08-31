// RED-phase suite for galaxy-view MODIFIED "Own-Fleet Presence and Recenter
// Target" (migrate-fleet-to-continuous-burns, tasks.md 8.12).
//
// Today's `GalaxyView.tsx` computes presence/recenter off `isTravelling(f)`,
// which reads `f.state.mode === 'laneTransit' || f.state.mode === 'laneHold'`
// — fields that no longer exist on `space.ShipState` (design.md Decision 4:
// `laneHold` has no successor at all; lane transit is now the fleet-owned
// `jump` field, not a `state.mode`). This pins the successor as a small,
// standalone pure module — `components/galaxy/presence.ts` (does not exist
// yet) — so the decision ("mid-jump ⇒ not present at the origin") is
// testable without mounting the three.js graph:
//
//   export function ownFleetPresenceSystemIds(
//     fleets: Pick<Fleet, 'systemId' | 'jump'>[],
//   ): string[]
//
//   export function recenterTargetSystemId(
//     fleets: Pick<Fleet, 'systemId' | 'jump'>[],
//   ): string | null

import { describe, it, expect } from 'vitest'
import type { Fleet } from '@/lib/types/fleet'
import { ownFleetPresenceSystemIds, recenterTargetSystemId } from './presence'

function parked(systemId: string, id = `f-${systemId}`): Pick<Fleet, 'systemId' | 'jump'> & { id: string } {
  return { id, systemId } as unknown as Pick<Fleet, 'systemId' | 'jump'> & { id: string }
}

function jumping(systemId: string, id = `f-${systemId}`): Pick<Fleet, 'systemId' | 'jump'> & { id: string } {
  return {
    id,
    systemId,
    jump: { laneId: 'lane-1', destSystemId: 'sys-dest', departMs: 0, arriveMs: 60_000 },
  } as unknown as Pick<Fleet, 'systemId' | 'jump'> & { id: string }
}

describe('ownFleetPresenceSystemIds — galaxy-view MODIFIED "Own-Fleet Presence and Recenter Target"', () => {
  it('marks a system hosting a parked (non-jumping) own fleet', () => {
    expect(ownFleetPresenceSystemIds([parked('sys-0')])).toEqual(['sys-0'])
  })

  // Scenario: A traveling fleet is not marked at the system it left
  it('does not mark the origin system of a mid-jump own fleet', () => {
    expect(ownFleetPresenceSystemIds([jumping('sys-0')])).toEqual([])
  })

  it('marks only the non-jumping fleets among a mixed set', () => {
    const ids = ownFleetPresenceSystemIds([parked('sys-0'), jumping('sys-1'), parked('sys-2')])
    expect(ids.sort()).toEqual(['sys-0', 'sys-2'])
  })

  it('returns no markers for an empty fleet list', () => {
    expect(ownFleetPresenceSystemIds([])).toEqual([])
  })
})

describe('recenterTargetSystemId — galaxy-view MODIFIED "Own-Fleet Presence and Recenter Target"', () => {
  it('snaps to a non-jumping own fleet\'s system', () => {
    expect(recenterTargetSystemId([parked('sys-0')])).toBe('sys-0')
  })

  it('falls back to whole-galaxy framing (null) when every own fleet is mid-jump', () => {
    expect(recenterTargetSystemId([jumping('sys-0'), jumping('sys-1')])).toBeNull()
  })

  it('falls back to whole-galaxy framing (null) with no own fleets at all', () => {
    expect(recenterTargetSystemId([])).toBeNull()
  })
})
