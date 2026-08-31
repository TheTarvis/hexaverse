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
// `fleetStatus > …` tests, both deleted with `board.MovementState`
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
