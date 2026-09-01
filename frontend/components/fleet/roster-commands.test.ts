// RED-phase suite for fleet-roster ADDED "The Roster Row Is the Fleet
// Command Surface" (8.8) and board-view ADDED "Running Mine Gates the Fleet
// Panel's Commands" — the disable/countdown half only (8.9); the cancel-mine
// WIRING half of 8.9 (invokes the generic action-cancel endpoint, leaves
// kinematic state/attachedTo untouched) is component-level and covered in
// FleetRoster.test.tsx instead, since it's a call-the-right-hook assertion,
// not a pure derivation.
//
// Contract this test pins for `components/fleet/roster-commands.ts` (does
// not exist yet):
//
//   export interface RosterCommandVisibility {
//     burn: boolean
//     cutDrive: boolean
//     stop: boolean
//     jump: boolean
//   }
//   // isChartedGate: true when the given body id is a lane gate whose lane
//   // the corporation has charted. Left as an injected predicate rather than
//   // resolved inside this module — the SystemBoard wire shape does not
//   // currently name a gate's body id on `LaneGate` (`lib/types/system-board
//   // .ts`), so how a caller answers this question is a wiring decision left
//   // to the component composing this function, not this pure derivation.
//   export function rosterCommandVisibility(
//     fleet: Fleet,
//     worldTime: number,
//     isChartedGate: (bodyId: string) => boolean,
//   ): RosterCommandVisibility
//
//   export interface RosterMineGate {
//     gated: boolean
//     remainingMs?: number
//   }
//   export function rosterMineGate(
//     worldTime: number,
//     runningMine?: { eta: number; status?: string } | null,
//   ): RosterMineGate

import { describe, it, expect } from 'vitest'
import type { Fleet } from '@/lib/types/fleet'
import { rosterCommandVisibility, rosterMineGate } from './roster-commands'

const ModeBurn = 0
const ModeParked = 1
const ModeDrift = 2

function burnState(arriveMs: number) {
  return {
    Mode: ModeBurn,
    Burn: {
      Origin: { X: 0, Y: 0, Z: 0 },
      Target: { BodyId: 'body-1', Point: null },
      Intercept: { X: 1, Y: 0, Z: 0 },
      Curve: {},
      Length: 10,
      DepartMs: 0,
      ArriveMs: arriveMs,
      Accel: 1,
      InsertionPhase: 0,
    },
    Park: null,
    Drift: null,
  }
}

function parkState() {
  return {
    Mode: ModeParked,
    Burn: null,
    Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    Drift: null,
  }
}

function driftState() {
  return {
    Mode: ModeDrift,
    Burn: null,
    Park: null,
    Drift: { Anchor: { X: 0, Y: 0, Z: 0 }, Velocity: { X: 1, Y: 0, Z: 0 }, EpochMs: 0 },
  }
}

function fleet(overrides: Record<string, unknown> = {}): Fleet {
  return {
    id: 'fleet-1',
    corporationId: 'corp-1',
    systemId: 'sys-0',
    state: parkState(),
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: 0,
    ...overrides,
  } as unknown as Fleet
}

const noChartedGates = () => false
// Renamed from allGatesCharted (replace-observation-with-sightings tasks.md
// 4.10): the injected predicate's SEMANTICS moved from "is this gate's lane
// charted" to "is this body a lane gate at all" — jump no longer has a
// charted-knowledge precondition — even though rosterCommandVisibility's own
// call shape (a single (bodyId: string) => boolean) never changed.
const isAnyLaneGate = () => true
const noGateBodies = () => false

describe('rosterCommandVisibility — fleet-roster ADDED "The Roster Row Is the Fleet Command Surface"', () => {
  // Scenario: Burn is always available
  it('always offers burn, regardless of kinematic state', () => {
    for (const state of [parkState(), burnState(90_000), driftState()]) {
      expect(rosterCommandVisibility(fleet({ state }), 0, noChartedGates).burn).toBe(true)
    }
  })

  // Scenario: Cut drive is offered only while burning
  it('offers cut-drive while burning', () => {
    const v = rosterCommandVisibility(fleet({ state: burnState(90_000) }), 30_000, noChartedGates)
    expect(v.cutDrive).toBe(true)
  })

  // Scenario: Cut drive is withheld outside a burn
  it('withholds cut-drive for a parked or drifting fleet', () => {
    expect(rosterCommandVisibility(fleet({ state: parkState() }), 0, noChartedGates).cutDrive).toBe(false)
    expect(rosterCommandVisibility(fleet({ state: driftState() }), 0, noChartedGates).cutDrive).toBe(false)
  })

  // Scenario: Stop in place is offered while burning or drifting
  it('offers stop-in-place while burning or drifting', () => {
    expect(rosterCommandVisibility(fleet({ state: burnState(90_000) }), 30_000, noChartedGates).stop).toBe(true)
    expect(rosterCommandVisibility(fleet({ state: driftState() }), 0, noChartedGates).stop).toBe(true)
  })

  // Scenario: Stop in place is withheld while parked
  it('withholds stop-in-place while parked — nothing to stop', () => {
    expect(rosterCommandVisibility(fleet({ state: parkState() }), 0, noChartedGates).stop).toBe(false)
  })

  // Scenario: Jump is offered while attached to any lane-gate body
  // (fleet-roster ADDED "The Roster Row Is the Fleet Command Surface, Jump
  // Gated by Attachment Alone" — replace-observation-with-sightings tasks.md
  // 4.10, design.md Decision 2: charting is map knowledge and a sellable
  // intel product, never a permission, so jump is offered on attachment
  // ALONE, with no dependency on whether the corporation has charted the
  // gate's lane).
  //
  // rosterCommandVisibility's own jump logic (`!!attachedTo &&
  // isGateBody(attachedTo)`) is unchanged from before this rename — it was
  // always agnostic to what its injected predicate actually tests. The
  // REGRESSION this section closes lives entirely in the predicate the
  // MOUNTING VIEW hands in (SystemBoardView.tsx / GalaxyView.tsx, both
  // hardcoded to `() => false` — see the dedicated composition-root test in
  // SystemBoardView.test.tsx). This test is retitled/renamed
  // (allGatesCharted → isAnyLaneGate) to state the CURRENT contract rather
  // than the superseded charted-lane one; its assertion is unchanged.
  it('offers jump while attached to any lane-gate body, charted or not', () => {
    const v = rosterCommandVisibility(fleet({ state: parkState(), attachedTo: 'gate-1' }), 0, isAnyLaneGate)
    expect(v.jump).toBe(true)
  })

  // Scenario: Jump is withheld when not attached to a gate
  it('withholds jump when unattached, or attached to a non-gate body', () => {
    expect(rosterCommandVisibility(fleet({ state: parkState() }), 0, isAnyLaneGate).jump).toBe(false)
    expect(
      rosterCommandVisibility(fleet({ state: parkState(), attachedTo: 'planet-1' }), 0, noGateBodies).jump,
    ).toBe(false)
  })

  // A burn past its own arrival must be read as settled (park), not burn —
  // cut-drive/stop must withdraw the instant the countdown would have hit
  // zero, without waiting for a refetch to correct `state.Mode`.
  it('withdraws cut-drive/stop once a burn has settled past its own arrival millisecond', () => {
    const v = rosterCommandVisibility(fleet({ state: burnState(60_000) }), 60_000, noChartedGates)
    expect(v.cutDrive).toBe(false)
    expect(v.stop).toBe(false)
  })
})

describe('rosterMineGate — board-view ADDED "Running Mine Gates the Fleet Panel\'s Commands" (disable half)', () => {
  // Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is running
  it('gates with a countdown while the running mine eta is still in the future', () => {
    const g = rosterMineGate(30_000, { eta: 90_000, status: 'running' })
    expect(g.gated).toBe(true)
    expect(g.remainingMs).toBe(60_000)
  })

  it('does not gate absent a running mine', () => {
    expect(rosterMineGate(30_000, null).gated).toBe(false)
  })

  // "the gating lifts once the ETA passes, with no navigation required" — a
  // pure function of (worldTime, runningMine) already satisfies this by
  // construction (no additional acknowledgement/dismiss state to carry).
  it('lifts gating the instant the eta passes, by world time alone', () => {
    const g = rosterMineGate(90_000, { eta: 90_000, status: 'running' })
    expect(g.gated).toBe(false)
    expect(g.remainingMs).toBeUndefined()
  })
})
