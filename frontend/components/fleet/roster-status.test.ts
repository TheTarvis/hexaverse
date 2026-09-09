// RED-phase suite for fleet-roster ADDED "One Row Per Owned Fleet, Derived
// From Kinematic State" (migrate-fleet-to-continuous-burns, tasks.md 8.5).
//
// Contract this test pins for `components/fleet/roster-status.ts` (does not
// exist yet — this is the module the roster row's status derivation must
// live in, replacing the deleted `fleet-status.ts`, design.md Decision 12):
//
//   export type StatusTone = 'idle' | 'moving' | 'drifting' | 'transit'
//   export interface RosterRowStatus {
//     tone: StatusTone
//     where: string
//     activity: string
//     remainingMs?: number
//   }
//   export type NameOf = (systemId: string) => string
//   export function rosterRowStatus(
//     fleet: Fleet,
//     worldTime: number,
//     nameOf: NameOf,
//     runningMine?: { eta: number; status?: string } | null,
//   ): RosterRowStatus
//
// The four tones are exactly the ones the requirement text names — no fifth
// tone, no reuse of the old 'held'/'transit'-for-departing overload.
//
// Wire shape assumed for `fleet.state` (verified against the real backend
// marshaling — `space.ShipState`/`space.Burn`/`space.Park`/`space.Drift`
// carry NO json tags by design (space's purity test), so they serialize
// under bare, capitalized Go field names; only `fleetDTO`'s own top-level
// fields — id/corporationId/systemId/state/attachedTo/jump/position/own/
// worldTime — and `JumpTransit`'s fields are tagged camelCase):
//
//   state: { Mode: 0|1|2, Burn: {..., ArriveMs, DepartMs}|null,
//             Park: {...}|null, Drift: {...}|null }
//   Mode: 0 = burn (space.ModeBurn), 1 = parked (space.ModeParked),
//         2 = drift (space.ModeDrift)
//   attachedTo?: string   (fleet.Fleet.AttachedTo, camelCase-tagged)
//   jump?: { laneId, destSystemId, departMs, arriveMs }  (camelCase-tagged)
//
// No TypeScript mirror of `backend/space`'s curve/orbit math exists, or ever
// will (design.md Decision 1) — so this derivation may use ONLY a trivial
// integer comparison against the stored ArriveMs to tell whether a burn has
// already settled (t >= ArriveMs), never re-derive the settled park's
// geometry. That is sufficient for a STATUS LABEL (idle/docked vs moving),
// which never needs the settled position.

import { describe, it, expect } from 'vitest'
import type { Fleet } from '@/lib/types/fleet'
import { rosterRowStatus } from './roster-status'
import type { ResolvedBody } from './roster-status'

// --- minimal, precise wire fixtures -----------------------------------------

const ModeBurn = 0
const ModeParked = 1
const ModeDrift = 2

function burnState(arriveMs: number, departMs = 0) {
  return {
    Mode: ModeBurn,
    Burn: {
      Origin: { X: 0, Y: 0, Z: 0 },
      Target: { BodyId: 'body-1', Point: null },
      Intercept: { X: 1, Y: 0, Z: 0 },
      Curve: {},
      Length: 10,
      DepartMs: departMs,
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

const nameOf = (id: string) => (id === 'sys-0' ? 'Axion' : id === 'sys-1' ? 'Borealis' : id)

// Spec: 0011/S1 — "Every fleet is listed with where it is and what it's
// doing". docs/specs/0011-fleet-roster.md's S1 predates
// migrate-fleet-to-continuous-burns and named the old
// `FleetRoster > lists every fleet with where it is and what it is doing` /
// `fleetStatus > …` tests, both deleted with the board package's
// `MovementState`
// (design.md Decision 4). The behaviour survives: `rosterRowStatus` is the
// SAME single derivation every roster row runs through (component/fleet/
// FleetRoster.tsx), and this describe block pins it producing a location
// (a system name, or an origin → destination lane label mid-jump), a
// player-facing activity, and a live countdown wherever the order has a
// known completion time, across every kinematic state a fleet can be in —
// exactly S1's THEN, re-verified per state rather than in one multi-fleet
// render.
describe('rosterRowStatus — fleet-roster ADDED "One Row Per Owned Fleet, Derived From Kinematic State"', () => {
  // Scenario: A parked, undocked fleet reads as on station
  it('reads a parked, undocked fleet as on station, idle, no countdown', () => {
    const s = rosterRowStatus(fleet({ state: parkState() }), 1_000, nameOf, null)
    expect(s.tone).toBe('idle')
    expect(s.where).toBe('Axion')
    expect(s.activity).toBe('On station')
    expect(s.remainingMs).toBeUndefined()
  })

  // Scenario: A docked fleet reads as docked
  it('reads a parked fleet with attachedTo set as docked, idle, no countdown', () => {
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'station-1' }), 1_000, nameOf, null)
    expect(s.tone).toBe('idle')
    expect(s.activity).toBe('Docked')
    expect(s.remainingMs).toBeUndefined()
  })

  // Scenario: A burning fleet counts down to arrival
  it('reads a burning fleet as moving, under way, counting down to arrival', () => {
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null)
    expect(s.tone).toBe('moving')
    expect(s.activity).toBe('Under way')
    expect(s.remainingMs).toBe(60_000)
  })

  // Scenario: A drifting fleet reads as drifting, with no countdown
  it('reads a drifting fleet as drifting, with no countdown', () => {
    const s = rosterRowStatus(fleet({ state: driftState() }), 30_000, nameOf, null)
    expect(s.tone).toBe('drifting')
    expect(s.activity).toBe('Drifting')
    expect(s.remainingMs).toBeUndefined()
  })

  // Scenario: A docked fleet with a running mine reads as mining
  it('reads a docked fleet with a running (future-eta) mine as mining, with a countdown to the mine eta', () => {
    const s = rosterRowStatus(
      fleet({ state: parkState(), attachedTo: 'body-1' }),
      30_000,
      nameOf,
      { eta: 90_000, status: 'running' },
    )
    expect(s.activity).toBe('Mining')
    expect(s.remainingMs).toBe(60_000)
  })

  // Scenario: A past-ETA mine action no longer drives the label
  it('falls back to the kinematic-state label once the running mine eta has passed', () => {
    const s = rosterRowStatus(
      fleet({ state: parkState(), attachedTo: 'body-1' }),
      91_000,
      nameOf,
      { eta: 90_000, status: 'running' },
    )
    expect(s.activity).toBe('Docked')
    expect(s.activity).not.toBe('Mining')
  })

  // Scenario: A fleet mid-jump reads as in transit
  //
  // Spec: 0011/S2 — "A fleet that has left is not reported as being where it
  // left from". The pre-migration scenario named a fleet past its lane's
  // "gate ETA" while `fleet.systemId` still named the origin; the successor
  // mechanism is `jump` (set for the ENTIRE single-hop crossing, design.md
  // Decision 10 — no board-leg/gate-ETA distinction survives). This assigns
  // `s.where` to "Axion → Borealis", not the bare origin `fleet.systemId`
  // would otherwise resolve to via `nameOf` alone — the row does not read as
  // if the fleet were still at Axion.
  it('reads a mid-jump fleet as in transit, counting down, with an origin → destination where label', () => {
    const s = rosterRowStatus(
      fleet({
        systemId: 'sys-0',
        jump: { laneId: 'lane-1', destSystemId: 'sys-1', departMs: 0, arriveMs: 120_000 },
      }),
      30_000,
      nameOf,
      null,
    )
    expect(s.tone).toBe('transit')
    expect(s.activity).toBe('In transit')
    expect(s.where).toBe('Axion → Borealis')
    expect(s.remainingMs).toBe(90_000)
  })

  // Scenario: An unknown system name falls back to its id
  it('falls back to the raw system id when nameOf has no name for it', () => {
    const unknownNameOf = (id: string) => (id === 'sys-9' ? id : 'Named')
    const s = rosterRowStatus(fleet({ systemId: 'sys-9', state: parkState() }), 0, unknownNameOf, null)
    expect(s.where).toBe('sys-9')
  })

  // SDET-added boundary: a burn whose ArriveMs has just passed (t === arriveMs
  // exactly) must NOT still read as "Under way" with a stale countdown — the
  // trivial fold (t >= ArriveMs) is an integer comparison, so the boundary
  // itself is the point most likely to be gotten backwards (`>` instead of
  // `>=`).
  it('folds a burn to its settled state at the exact arrival millisecond (boundary)', () => {
    const s = rosterRowStatus(fleet({ state: burnState(60_000) }), 60_000, nameOf, null)
    expect(s.tone).not.toBe('moving')
    expect(s.remainingMs).toBeUndefined()
  })
})

// =============================================================================
// ADDITIVE EXTENSION — add-vitals-strip, `system-console` ADDED "The Fleet
// Cell's State Pill Is a Projection of the Shared Roster Derivation" (impl
// contract §2, tasks.md 1.1/1.2/1.2). RED-PHASE, compile-red until
// `roster-status.ts` grows the fifth `resolveBody` parameter and the six new
// `RosterRowStatus` fields (`activityKind`, `etaWorldMs`, `parkMode`,
// `hostLabel`, `targetLabel`, `stationKeepRateTonsPerSecond`) plus the
// exported `ResolvedBody`/`ResolveBody` types.
//
// NOT ONE LINE ABOVE THIS MARKER CHANGES. The nine cases above are contract
// §2.1's additive-only check: `tone`/`where`/`activity`/`remainingMs` must
// keep returning byte-identical values for every input they accept today.
// =============================================================================

const featureHit = (type: string, id: string): ResolvedBody => ({ kind: 'feature', type, id })
const gateHit = (destSystemId: string): ResolvedBody => ({ kind: 'gate', destSystemId })

function resolveBodyFrom(map: Record<string, ResolvedBody>) {
  return (id: string): ResolvedBody | null => map[id] ?? null
}

const stationkeepParkState = () => ({
  Mode: ModeParked,
  Burn: null,
  Drift: null,
  Park: {
    Kind: 1,
    BodyId: 'body-1',
    Radius: 0,
    PeriodMs: 0,
    Phase: 0,
    EpochMs: 0,
    Offset: { X: 0, Y: 0, Z: 0 },
    Point: { X: 0, Y: 0, Z: 0 },
  },
})

const pointBurnState = (arriveMs: number) => ({
  Mode: ModeBurn,
  Burn: {
    Origin: { X: 0, Y: 0, Z: 0 },
    Target: { BodyId: null, Point: { X: 12.5, Y: 0, Z: -7 } },
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
})

describe('rosterRowStatus — ADDITIVE: activityKind, one per existing branch (contract §2.2 table)', () => {
  it('fleet.jump -> transit, etaWorldMs = jump.arriveMs', () => {
    const s = rosterRowStatus(
      fleet({ jump: { laneId: 'lane-1', destSystemId: 'sys-1', departMs: 0, arriveMs: 120_000 } }),
      30_000,
      nameOf,
      null,
    )
    expect(s.activityKind).toBe('transit')
    expect(s.etaWorldMs).toBe(120_000)
  })

  it('still burning -> underway, etaWorldMs = Burn.ArriveMs', () => {
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null)
    expect(s.activityKind).toBe('underway')
    expect(s.etaWorldMs).toBe(90_000)
  })

  it('Mode === DRIFT -> drifting, no etaWorldMs, no parkMode', () => {
    const s = rosterRowStatus(fleet({ state: driftState() }), 30_000, nameOf, null)
    expect(s.activityKind).toBe('drifting')
    expect(s.etaWorldMs).toBeUndefined()
    expect(s.parkMode).toBeUndefined()
  })

  it('docked + running (future-eta) mine -> mining, etaWorldMs = runningMine.eta', () => {
    const s = rosterRowStatus(
      fleet({ state: parkState(), attachedTo: 'body-1' }),
      30_000,
      nameOf,
      { eta: 90_000, status: 'running' },
    )
    expect(s.activityKind).toBe('mining')
    expect(s.etaWorldMs).toBe(90_000)
  })

  it('docked, no running mine -> docked, no etaWorldMs', () => {
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'station-1' }), 1_000, nameOf, null)
    expect(s.activityKind).toBe('docked')
    expect(s.etaWorldMs).toBeUndefined()
  })

  it('parked, undocked, park mode stationkeep -> holding, no etaWorldMs', () => {
    const s = rosterRowStatus(fleet({ state: stationkeepParkState() }), 1_000, nameOf, null)
    expect(s.activityKind).toBe('holding')
    expect(s.etaWorldMs).toBeUndefined()
    expect(s.parkMode).toBe('stationkeep')
  })

  it('parked, undocked, park mode point -> onstation (collapsed with orbit)', () => {
    // The shared fixture's parkState() uses Park.Kind 2 (point).
    const s = rosterRowStatus(fleet({ state: parkState() }), 1_000, nameOf, null)
    expect(s.activityKind).toBe('onstation')
    expect(s.etaWorldMs).toBeUndefined()
    expect(s.parkMode).toBe('point')
  })

  it('parked, undocked, park mode orbit -> onstation (collapsed with point)', () => {
    const orbitPark = {
      Mode: ModeParked,
      Burn: null,
      Drift: null,
      Park: { Kind: 0, BodyId: 'body-1', Radius: 10, PeriodMs: 1000, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    }
    const s = rosterRowStatus(fleet({ state: orbitPark }), 1_000, nameOf, null)
    expect(s.activityKind).toBe('onstation')
    expect(s.parkMode).toBe('orbit')
  })

  it('parkMode is present only for a parked fleet — undefined while burning, drifting, or mid-jump', () => {
    expect(rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null).parkMode).toBeUndefined()
    expect(rosterRowStatus(fleet({ state: driftState() }), 30_000, nameOf, null).parkMode).toBeUndefined()
    expect(
      rosterRowStatus(
        fleet({ jump: { laneId: 'l', destSystemId: 'sys-1', departMs: 0, arriveMs: 1 } }),
        0,
        nameOf,
        null,
      ).parkMode,
    ).toBeUndefined()
  })

  // SDET-added: the additive fields must fold the SAME way the four
  // original ones do at the exact arrival boundary — not lag one branch
  // behind (a plausible off-by-one if activityKind were computed from a
  // second, independent comparison against ArriveMs rather than reusing the
  // same fold `stillBurning` already performs).
  it('SDET-added: activityKind folds to a settled (non-underway) state at the exact arrival millisecond, alongside the original boundary case', () => {
    const s = rosterRowStatus(fleet({ state: burnState(60_000) }), 60_000, nameOf, null)
    expect(s.activityKind).not.toBe('underway')
    expect(s.activityKind).toBe('onstation')
    expect(s.etaWorldMs).toBeUndefined()
  })
})

describe('rosterRowStatus — ADDITIVE: hostLabel, resolved by resolveBody against BOTH collections (contract §2.3)', () => {
  it('a features hit names its served type word and served id', () => {
    const resolveBody = resolveBodyFrom({ 'feat-9': featureHit('asteroid', 'feat-9') })
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'feat-9' }), 1_000, nameOf, null, resolveBody)
    expect(s.hostLabel).toBe('asteroid feat-9')
  })

  it('a laneGates hit names Gate plus the resolved destination system name', () => {
    const resolveBody = resolveBodyFrom({ 'gate-1': gateHit('sys-1') })
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'gate-1' }), 1_000, nameOf, null, resolveBody)
    expect(s.hostLabel).toBe('Gate Borealis')
  })

  it('a laneGates hit falls back to the raw destSystemId when the galaxy read has not resolved it', () => {
    const unresolvedNameOf = (id: string) => id
    const resolveBody = resolveBodyFrom({ 'gate-1': gateHit('sys-9') })
    const s = rosterRowStatus(
      fleet({ state: parkState(), attachedTo: 'gate-1' }),
      1_000,
      unresolvedNameOf,
      null,
      resolveBody,
    )
    expect(s.hostLabel).toBe('Gate sys-9')
  })

  it('an attachedTo id matching neither collection degrades to the raw id, never blank', () => {
    const resolveBody = resolveBodyFrom({})
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'unknown-1' }), 1_000, nameOf, null, resolveBody)
    expect(s.hostLabel).toBe('unknown-1')
  })

  it('with no resolveBody supplied at all (the four-argument call FleetRoster.tsx:167 makes today), the host degrades to the raw id', () => {
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'unknown-2' }), 1_000, nameOf, null)
    expect(s.hostLabel).toBe('unknown-2')
  })

  it('hostLabel is undefined for an undocked fleet', () => {
    const s = rosterRowStatus(fleet({ state: parkState() }), 1_000, nameOf, null)
    expect(s.hostLabel).toBeUndefined()
  })

  it('never synthesises a display name for a features hit — the served type word is the only label, not a "prettified" one', () => {
    const resolveBody = resolveBodyFrom({ 'feat-9': featureHit('asteroid', 'feat-9') })
    const s = rosterRowStatus(fleet({ state: parkState(), attachedTo: 'feat-9' }), 1_000, nameOf, null, resolveBody)
    expect(s.hostLabel).not.toMatch(/asteroid belt|mining site|outpost/i)
  })
})

describe('rosterRowStatus — ADDITIVE: targetLabel, the SAME both-collections lookup, plus the point-target case (contract §2.3)', () => {
  it('a burn toward a features entry names its served type word and served id', () => {
    const resolveBody = resolveBodyFrom({ 'body-1': featureHit('planet', 'body-1') })
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null, resolveBody)
    expect(s.targetLabel).toBe('planet body-1')
  })

  it('a burn toward a laneGates entry names Gate plus the destination system name', () => {
    const resolveBody = resolveBodyFrom({ 'body-1': gateHit('sys-1') })
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null, resolveBody)
    expect(s.targetLabel).toBe('Gate Borealis')
  })

  it('a burn target matching neither collection degrades to the raw body id, never blank', () => {
    const resolveBody = resolveBodyFrom({})
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null, resolveBody)
    expect(s.targetLabel).toBe('body-1')
  })

  it('a failed interior read (no resolveBody supplied) also degrades to the raw body id', () => {
    const s = rosterRowStatus(fleet({ state: burnState(90_000) }), 30_000, nameOf, null)
    expect(s.targetLabel).toBe('body-1')
  })

  it('a point target (BodyId null, Point set) is named "a point in space", with no raw coordinate anywhere in the label', () => {
    const s = rosterRowStatus(fleet({ state: pointBurnState(90_000) }), 30_000, nameOf, null)
    expect(s.targetLabel).toBe('a point in space')
    expect(s.targetLabel).not.toMatch(/12\.5|-7\b/)
  })

  it('targetLabel is undefined while not burning', () => {
    const s = rosterRowStatus(fleet({ state: parkState() }), 1_000, nameOf, null)
    expect(s.targetLabel).toBeUndefined()
  })
})

describe('rosterRowStatus — ADDITIVE: stationKeepRateTonsPerSecond, served verbatim, never re-derived (contract §2.4)', () => {
  it('passes roster.stationKeepRateTonsPerSecond through unchanged while holding', () => {
    const s = rosterRowStatus(
      fleet({
        state: stationkeepParkState(),
        roster: { ships: [], cargo: {}, cargoCapacity: 1, freeHold: 1, miningRate: 0, stationKeepRateTonsPerSecond: 0.02 },
      }),
      1_000,
      nameOf,
      null,
    )
    expect(s.stationKeepRateTonsPerSecond).toBe(0.02)
  })

  it('is undefined when the fleet read has not yet served it (never a zero substitute)', () => {
    const s = rosterRowStatus(fleet({ state: stationkeepParkState() }), 1_000, nameOf, null)
    expect(s.stationKeepRateTonsPerSecond).toBeUndefined()
  })
})
