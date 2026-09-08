import { describe, expect, it } from 'vitest'

// REGRESSION — the burning fleet that teleported (2026-09-08).
//
// `space.Curve` is a Go struct `{P0, C1, C2, C3, C4, P5 Vec3}` with no json
// tags, so a fleet read serves the curve as an OBJECT keyed by those six
// names. The scene only accepted an array, silently fell back to the frozen
// served `position`, and drew nothing of the burn: no motion, no path, no
// arrival ghost — until the arrival refetch moved the mark in one jump.
// Every earlier fixture wrote the curve as an array, which is why the suite
// never saw it. This file pins the WIRE shape.

import { buildSceneModel, type SceneFleet, type SceneInput } from './space-scene'
import type { SystemSpace } from '@/lib/types/system-space'

const T0 = 21_175_110_953

const interior = {
  id: 'sys_-7_17',
  worldTime: T0,
  scale: 1,
  extent: 600,
  starClass: 'G',
  features: [
    { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 },
    {
      id: 'feat-body-0',
      type: 'rocky',
      space: { X: 400, Y: 0, Z: -100 },
      size: 1.7,
      orbitElements: { parentId: 'feat-star', radius: 412.3, periodMs: 3_600_000, phase: 0, inclination: 0, node: 0 },
    },
  ],
  laneGates: [],
  contacts: [],
} as unknown as SystemSpace

const wireCurve = {
  P0: { X: 20, Y: 0, Z: -16 },
  C1: { X: 60, Y: 4, Z: -40 },
  C2: { X: 120, Y: 6, Z: -60 },
  C3: { X: 200, Y: 6, Z: -80 },
  C4: { X: 300, Y: 3, Z: -95 },
  P5: { X: 400, Y: 0, Z: -100 },
}

function burning(departMs: number, arriveMs: number, curve: unknown = wireCurve): SceneFleet {
  return {
    id: 'fleet-1',
    systemId: 'sys_-7_17',
    position: { X: 20, Y: 0, Z: -16 },
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 20, Y: 0, Z: -16 },
        Target: { BodyId: 'feat-body-0', Point: null },
        Intercept: { X: 400, Y: 0, Z: -100 },
        Curve: curve,
        Length: 500,
        DepartMs: departMs,
        ArriveMs: arriveMs,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
  }
}

function build(fleet: SceneFleet, worldTimeMs: number) {
  return buildSceneModel({
    interior,
    fleets: [fleet],
    worldTimeMs,
    reducedMotion: false,
    selection: null,
    log: () => {},
  } as SceneInput)
}

describe('space-scene — the served curve is an object keyed P0..P5, not an array', () => {
  it('parses the wire shape into six control points and draws the burn path', () => {
    const s = build(burning(T0 - 10_000, T0 + 10_000), T0)
    const curve = s.curves.find((c) => c.fleetId === 'fleet-1')
    expect(curve, 'the burn path must be drawn from the wire-shaped curve').toBeDefined()
    expect(curve!.controlPoints).toHaveLength(6)
    expect(curve!.controlPoints[0]).toEqual({ x: 20, y: 0, z: -16 })
    expect(curve!.controlPoints[5]).toEqual({ x: 400, y: 0, z: -100 })
    expect(curve!.param).toBeCloseTo(0.5, 6)
    expect(s.marks.find((m) => m.kind === 'ghost'), 'an arrival ghost rides the wire-shaped burn').toBeDefined()
  })

  it('advances the fleet mark along the curve with world time instead of freezing at the served position', () => {
    const early = build(burning(T0 - 10_000, T0 + 10_000), T0 - 5_000)
    const late = build(burning(T0 - 10_000, T0 + 10_000), T0 + 5_000)
    const pEarly = early.marks.find((m) => m.kind === 'fleet')!.position
    const pLate = late.marks.find((m) => m.kind === 'fleet')!.position
    expect(pLate, 'a burning fleet must move between frames').not.toEqual(pEarly)
    // Neither frame sits on the frozen served position (the origin at 20,0,-16).
    expect(pEarly).not.toEqual({ x: 20, y: 0, z: -16 })
    expect(pLate.x).toBeGreaterThan(pEarly.x)
  })

  it('still accepts the array shape older fixtures use', () => {
    const asArray = [wireCurve.P0, wireCurve.C1, wireCurve.C2, wireCurve.C3, wireCurve.C4, wireCurve.P5]
    const s = build(burning(T0 - 10_000, T0 + 10_000, asArray), T0)
    expect(s.curves.find((c) => c.fleetId === 'fleet-1')?.controlPoints).toHaveLength(6)
  })

  it('an object missing a control point yields no curve, and the mark falls back to the served position', () => {
    const { P5: _dropped, ...partial } = wireCurve
    void _dropped
    const s = build(burning(T0 - 10_000, T0 + 10_000, partial), T0)
    expect(s.curves).toHaveLength(0)
    expect(s.marks.find((m) => m.kind === 'fleet')!.position).toEqual({ x: 20, y: 0, z: -16 })
  })

  it('carries the served mode and arrival on the fleet mark for the facts card, and the drift velocity for a coast', () => {
    const s = build(burning(T0 - 10_000, T0 + 10_000), T0)
    const mark = s.marks.find((m) => m.kind === 'fleet')!
    expect(mark.fleetMode).toBe(0)
    expect(mark.arriveMs).toBe(T0 + 10_000)
    expect(mark.pickable, 'a fleet is still never a selection target').toBe(false)

    const drifting: SceneFleet = {
      id: 'fleet-2',
      position: { X: 50, Y: 0, Z: 50 },
      state: {
        Mode: 2,
        Burn: null,
        Park: null,
        Drift: { Anchor: { X: 50, Y: 0, Z: 50 }, Velocity: { X: 0.5, Y: 0, Z: -0.25 }, EpochMs: T0 },
      },
    }
    const d = build(drifting, T0 + 2_000)
    const dm = d.marks.find((m) => m.id === 'fleet-2')!
    expect(dm.fleetMode).toBe(2)
    expect(dm.velocity).toEqual({ x: 0.5, y: 0, z: -0.25 })
    expect(dm.position.x).toBeCloseTo(51, 6)
  })
})
