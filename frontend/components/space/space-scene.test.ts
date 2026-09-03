import { describe, it, expect, vi } from 'vitest'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`: *Own-Fleet Position, Burn Curve, and
// Arrival Ghost Render Continuously*, *Foreign Contacts Render at Their
// Served Position*, *A Non-Star Position at the Origin Is Omitted From the
// Scene, Not Drawn Atop the Star*, *Belt Members Render as Decorative
// Detail...*, *Space View Respects Reduced-Motion Preference*, and the
// visible-selected-mark clause of *Space View Picking...* (tasks.md 2.6,
// 2.7, 2.8, 2.9, 2.10, 2.11, 3.2b, 6.7).
//
// WHY THIS LEVEL. Every scenario above is nominally "about the canvas". A
// WebGL bitmap is not a testable surface and asserting pixels would be
// worthless. What IS testable, and is where every one of these can actually
// break, is the DRAWN-STATE MODEL the component computes and hands to the
// renderer: which entities are in the scene, at what positions, pickable or
// not, selected or not, plus what was deliberately omitted and why. That is
// the contract this file fixes.
//
//   export interface SceneMark {
//     id: string
//     kind: 'star' | 'body' | 'belt' | 'gate' | 'fleet' | 'contact'
//         | 'ghost' | 'point-selection'
//     position: DrawVec3
//     radius: number
//     pickable: boolean
//     selected: boolean
//     emitting?: boolean       // contacts only
//     scanning?: boolean       // contacts only
//   }
//   export interface SceneModel {
//     marks: SceneMark[]
//     curves: { fleetId: string; controlPoints: DrawVec3[] }[]
//     beltFields: { bodyId: string; center: DrawVec3; memberCount: number }[]
//     positionTimeMs: number     // ALWAYS the live world time
//     decorativeTimeMs: number   // FROZEN under reduced motion
//     omissions: { id: string; reason: 'origin' | 'no-position' }[]
//   }
//   export function buildSceneModel(input: SceneInput): SceneModel
//
//   SceneInput = { interior, fleets, contacts, worldTimeMs, reducedMotion,
//                  selection, log }
//     `log(message, detail)` is the diagnostic sink the origin rule requires;
//     injected so it is assertable rather than a bare console call.
//
// VACUITY NOTE: every omission assertion is paired with a positive
// assertion that the NON-omitted entities are present, so an implementation
// that drew nothing fails; and every "frozen" assertion is paired with a
// "still advancing" assertion, so an implementation that froze everything
// fails too.

import { buildSceneModel, type SceneInput, type SceneModel } from './space-scene'

const T0 = 21_175_110_953

const STAR = { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 }
const PLANET = {
  id: 'feat-body-0',
  type: 'rocky',
  space: { X: 17.99, Y: -3.18, Z: -15.55 },
  size: 1.76,
  resources: [{ kind: 'metals', richness: 0.3 }],
  orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18591, phase: 373097, inclination: 500434, node: 205958 },
}
const BELT = {
  id: 'feat-belt-0',
  type: 'belt',
  space: { X: -31.52, Y: 1.3, Z: 31.6 },
  size: 0.9,
  resources: [{ kind: 'metals', richness: 0.3 }],
  orbitElements: { parentId: 'feat-star', radius: 44.66, periodMs: 47192, phase: 618097, inclination: 517477, node: 259477 },
}
const GATE = {
  destSystemId: 'sys_-6_16',
  laneId: 'lane_-7_17_-6_16',
  space: { X: 694.22, Y: 0, Z: -207.51 },
  size: 1.2,
  orbitElements: { parentId: 'feat-star', radius: 724.57, periodMs: 0, phase: 1000101, inclination: 0, node: 0 },
}

function interior(overrides: Record<string, unknown> = {}) {
  return {
    systemId: 'sys_-7_17',
    extent: 658.7081316032265,
    character: 'normal',
    starClass: 'M',
    worldTime: T0,
    scale: 1,
    features: [STAR, PLANET, BELT],
    laneGates: [GATE],
    contacts: [],
    ...overrides,
  }
}

// A parked own fleet.
function parkedFleet(id = 'fleet-1', bodyId = 'feat-body-0') {
  return {
    id,
    corporationId: 'corp-1',
    systemId: 'sys_-7_17',
    own: true,
    worldTime: T0,
    position: { X: 20, Y: -3, Z: -16 },
    attachedTo: bodyId,
    state: {
      Mode: 1,
      Burn: null,
      Drift: null,
      Park: { Kind: 0, BodyId: bodyId, Radius: 5, PeriodMs: 6000, Phase: 0, EpochMs: T0 - 1000, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    },
  }
}

// A burning own fleet whose served curve and arrival are in the future.
function burningFleet(id = 'fleet-1', arriveMs = T0 + 500_000) {
  const cps = [
    { X: 20, Y: 0, Z: -16 },
    { X: 60, Y: 4, Z: -40 },
    { X: 120, Y: 6, Z: -60 },
    { X: 200, Y: 6, Z: -80 },
    { X: 300, Y: 3, Z: -95 },
    { X: 400, Y: 0, Z: -100 },
  ]
  return {
    id,
    corporationId: 'corp-1',
    systemId: 'sys_-7_17',
    own: true,
    worldTime: T0,
    position: { X: 20, Y: 0, Z: -16 },
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 20, Y: 0, Z: -16 },
        Target: { BodyId: 'feat-belt-0', Point: null },
        Intercept: { X: 400, Y: 0, Z: -100 },
        Curve: cps,
        Length: 500,
        DepartMs: T0 - 100_000,
        ArriveMs: arriveMs,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
  }
}

function build(over: Partial<SceneInput> = {}): SceneModel {
  return buildSceneModel({
    interior: interior(),
    fleets: [],
    worldTimeMs: T0,
    reducedMotion: false,
    selection: null,
    log: () => {},
    ...over,
  } as SceneInput)
}

const markById = (m: SceneModel, id: string) => m.marks.find((x) => x.id === id)

describe('space-scene — bodies, gates and the star', () => {
  it('Scenario: A materialized system\'s read carries every body\'s continuous position and size (every served body reaches the scene)', () => {
    const s = build()
    expect(markById(s, 'feat-star')?.kind).toBe('star')
    expect(markById(s, 'feat-body-0')?.kind).toBe('body')
    expect(markById(s, 'feat-belt-0')?.kind).toBe('belt')
    // A gate is a body in the scene, drawn and pickable like any other.
    const gate = s.marks.find((m) => m.kind === 'gate')
    expect(gate, 'the lane gate must be in the scene').toBeDefined()
    expect(gate!.pickable).toBe(true)
  })

  // Scenario: The star at the origin renders normally
  it('Scenario: The star at the origin renders normally', () => {
    const log = vi.fn()
    const s = build({ log })
    const star = markById(s, 'feat-star')
    expect(star).toBeDefined()
    expect(star!.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(s.omissions.find((o) => o.id === 'feat-star')).toBeUndefined()
    expect(log, 'the star at the origin is exempt and must not be logged').not.toHaveBeenCalled()
  })

  // Scenario: A non-star body served at the origin is omitted and logged
  it('Scenario: A non-star body served at the origin is omitted and logged', () => {
    const log = vi.fn()
    const broken = { ...PLANET, space: { X: 0, Y: 0, Z: 0 }, orbitElements: undefined }
    const s = build({ interior: interior({ features: [STAR, broken, BELT] }), log })

    expect(markById(s, 'feat-body-0'), 'must NOT be drawn on top of the star').toBeUndefined()
    expect(s.omissions).toContainEqual({ id: 'feat-body-0', reason: 'origin' })
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls), 'the diagnostic must name the omitted entity').toContain(
      'feat-body-0',
    )
    // ...and everything else still renders — the omission is scoped.
    expect(markById(s, 'feat-star')).toBeDefined()
    expect(markById(s, 'feat-belt-0')).toBeDefined()
  })

  // Scenario: A fleet or contact resolved to the origin is omitted and logged
  it('Scenario: A fleet or contact resolved to the origin is omitted and logged', () => {
    const log = vi.fn()
    const f = { ...parkedFleet('fleet-zero'), position: { X: 0, Y: 0, Z: 0 }, attachedTo: undefined, state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } } }
    const s = build({
      fleets: [f],
      interior: interior({ contacts: [{ position: { X: 0, Y: 0, Z: 0 }, velocity: { X: 1, Y: 0, Z: 0 }, emitting: false, scanning: false }] }),
      log,
    })
    expect(s.marks.filter((m) => m.kind === 'fleet')).toHaveLength(0)
    expect(s.marks.filter((m) => m.kind === 'contact')).toHaveLength(0)
    expect(s.omissions.map((o) => o.reason)).toContain('origin')
    expect(log).toHaveBeenCalled()
  })
})

describe('space-scene — own fleets', () => {
  // Scenario: An idle fleet renders at its live position, advancing with
  // world time
  it('Scenario: An idle fleet renders at its live position, advancing with world time', () => {
    const a = build({ fleets: [parkedFleet()], worldTimeMs: T0 })
    const b = build({ fleets: [parkedFleet()], worldTimeMs: T0 + 1500 })
    const pa = a.marks.find((m) => m.kind === 'fleet')!.position
    const pb = b.marks.find((m) => m.kind === 'fleet')!.position
    expect(pa).toBeDefined()
    expect(pb).not.toEqual(pa)
  })

  // Scenario: A burning fleet renders its curve and an arrival ghost
  it('Scenario: A burning fleet renders its curve and an arrival ghost', () => {
    const s = build({ fleets: [burningFleet()], worldTimeMs: T0 })
    expect(s.curves.find((c) => c.fleetId === 'fleet-1')?.controlPoints).toHaveLength(6)
    const ghost = s.marks.find((m) => m.kind === 'ghost')
    expect(ghost, 'a burning fleet must carry an arrival ghost').toBeDefined()
    expect(ghost!.pickable, 'the ghost is not a hit target').toBe(false)
  })

  it('SDET-added: the ghost sits at the TARGET body\'s position at arriveMs, not at the target\'s position now', () => {
    // The belt is the burn's target and it is moving. A ghost drawn at the
    // belt's CURRENT position would be visibly wrong and would tell the
    // player the wrong thing about where they will end up.
    const arriveMs = T0 + 20_000
    const now = build({ fleets: [burningFleet('fleet-1', arriveMs)], worldTimeMs: T0 })
    const ghost = now.marks.find((m) => m.kind === 'ghost')!
    const beltNow = markById(now, 'feat-belt-0')!.position
    const beltAtArrival = markById(
      build({ fleets: [], worldTimeMs: arriveMs }),
      'feat-belt-0',
    )!.position
    expect(beltAtArrival, 'the fixture must actually move the belt over the burn').not.toEqual(beltNow)
    expect(ghost.position.x).toBeCloseTo(beltAtArrival.x, 6)
    expect(ghost.position.z).toBeCloseTo(beltAtArrival.z, 6)
  })

  it('Scenario: A burn past its served arrival freezes at the intercept until a refetch', () => {
    const arriveMs = T0 - 5_000 // already past
    const a = build({ fleets: [burningFleet('fleet-1', arriveMs)], worldTimeMs: T0 })
    const b = build({ fleets: [burningFleet('fleet-1', arriveMs)], worldTimeMs: T0 + 60_000 })
    const pa = a.marks.find((m) => m.kind === 'fleet')!.position
    const pb = b.marks.find((m) => m.kind === 'fleet')!.position
    expect(pb, 'a past-arrival burn must not move').toEqual(pa)
    expect(pa.x).toBeCloseTo(400, 6) // the served intercept / last control point
    expect(pa.z).toBeCloseTo(-100, 6)
  })

  // Scenario: A fleet with no reported position is omitted from the scene
  it('Scenario: A fleet with no reported position is omitted from the scene', () => {
    const log = vi.fn()
    const inTransit = {
      ...parkedFleet('fleet-transit'),
      position: undefined,
      state: { Mode: 1, Burn: null, Drift: null, Park: null },
      jump: { laneId: 'lane_x', destSystemId: 'sys_a', departMs: T0 - 1, arriveMs: T0 + 90_000 },
    }
    const s = build({ fleets: [inTransit, parkedFleet('fleet-here')], log })
    expect(s.marks.find((m) => m.id === 'fleet-transit')).toBeUndefined()
    expect(s.omissions).toContainEqual({ id: 'fleet-transit', reason: 'no-position' })
    // ...and the fleet that DOES have a position is still drawn, so "omit
    // everything" does not pass.
    expect(s.marks.find((m) => m.id === 'fleet-here')).toBeDefined()
  })

  it('SDET-added: no own fleet is ever a pickable selection target', () => {
    // *Toggle-to-Deselect...*: "The space view draws no selection affordance
    // for a fleet — an own fleet's or a foreign contact's rendered position
    // is never a member of this selection set."
    const s = build({ fleets: [parkedFleet(), burningFleet('fleet-2')] })
    for (const m of s.marks.filter((x) => x.kind === 'fleet' || x.kind === 'contact')) {
      expect(m.pickable, `${m.id} must not be pickable`).toBe(false)
      expect(m.selected).toBe(false)
    }
  })
})

describe('space-scene — foreign contacts', () => {
  const contact = (over = {}) => ({
    position: { X: 300, Y: 5, Z: -120 },
    velocity: { X: 2.5, Y: 0, Z: -1 },
    emitting: false,
    scanning: false,
    ...over,
  })

  // Scenario: A disclosed contact renders at its served position
  it('Scenario: A disclosed contact renders at its served position', () => {
    const s = build({ interior: interior({ contacts: [contact()] }) })
    const c = s.marks.find((m) => m.kind === 'contact')
    expect(c).toBeDefined()
    expect(c!.position).toEqual({ x: 300, y: 5, z: -120 })
  })

  // Scenario: A contact does not drift between reads
  it('Scenario: A contact does not drift between reads', () => {
    const later = build({ interior: interior({ contacts: [contact()] }), worldTimeMs: T0 + 600_000 })
    const c = later.marks.find((m) => m.kind === 'contact')!
    expect(c.position, 'the contact must be frozen, never integrated from its velocity').toEqual({
      x: 300,
      y: 5,
      z: -120,
    })
    // ...while bodies in the SAME model did advance, so "nothing moves" does
    // not pass this test.
    const bodyNow = markById(build(), 'feat-body-0')!.position
    expect(markById(later, 'feat-body-0')!.position).not.toEqual(bodyNow)
  })

  // Scenario: An emitting or scanning contact is visually distinguished
  it('Scenario: An emitting or scanning contact is visually distinguished', () => {
    const s = build({
      interior: interior({
        contacts: [contact(), contact({ emitting: true }), contact({ scanning: true })],
      }),
    })
    const cs = s.marks.filter((m) => m.kind === 'contact')
    expect(cs).toHaveLength(3)
    expect(cs.map((c) => [c.emitting, c.scanning])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ])
  })

  // Scenario: No identity is rendered for a contact
  it('Scenario: No identity is rendered for a contact', () => {
    const s = build({ interior: interior({ contacts: [contact()] }) })
    const c = s.marks.find((m) => m.kind === 'contact')!
    const serialized = JSON.stringify(c)
    for (const leak of ['corp', 'owner', 'fleet-', 'fleetId', 'corporationId']) {
      expect(serialized.toLowerCase(), `a contact must carry no ${leak}`).not.toContain(leak.toLowerCase())
    }
  })

  it('SDET-added: an empty or absent contacts array renders no foreign presence', () => {
    expect(build({ interior: interior({ contacts: [] }) }).marks.filter((m) => m.kind === 'contact')).toHaveLength(0)
    expect(
      build({ interior: interior({ contacts: undefined }) }).marks.filter((m) => m.kind === 'contact'),
    ).toHaveLength(0)
  })
})

describe('space-scene — belt members are decorative', () => {
  // Scenario: Belt members render with no individual facts or selection state
  it('Scenario: Belt members render with no individual facts or selection state', () => {
    const s = build()
    const field = s.beltFields.find((b) => b.bodyId === 'feat-belt-0')
    expect(field, 'a belt renders a decorative field').toBeDefined()
    expect(field!.memberCount, 'the field must actually have members to draw').toBeGreaterThan(0)

    // No member is a mark: no id, no hit target, no selection state.
    const memberMarks = s.marks.filter((m) => m.id.startsWith('feat-belt-0') && m.id !== 'feat-belt-0')
    expect(memberMarks, 'no belt member may be a scene mark').toEqual([])

    // The belt feature itself IS the one pickable, mineable body.
    const belt = markById(s, 'feat-belt-0')!
    expect(belt.pickable).toBe(true)
  })

  it('SDET-added: the decorative field is seeded from the belt id, so it does not jitter between frames', () => {
    const a = build({ worldTimeMs: T0 })
    const b = build({ worldTimeMs: T0 + 33 })
    expect(a.beltFields.find((f) => f.bodyId === 'feat-belt-0')!.memberCount).toBe(
      b.beltFields.find((f) => f.bodyId === 'feat-belt-0')!.memberCount,
    )
  })
})

describe('space-scene — selection is visible', () => {
  // Scenario: A selected point in empty space is visibly marked
  it('Scenario: A selected point in empty space is visibly marked', () => {
    // This clause was thinned out of the port and restored (proposal's
    // `board-view` retirement bullet). A point in vacuum has no intrinsic
    // outline, so without a mark of its own the selection is INVISIBLE and
    // every other scenario still passes.
    const point = { x: 210, y: 0, z: -140 }
    const s = build({ selection: { point } })
    const mark = s.marks.find((m) => m.kind === 'point-selection')
    expect(mark, 'a selected bare point must be drawn').toBeDefined()
    expect(mark!.position, 'at the position it was picked at').toEqual(point)
    expect(mark!.selected).toBe(true)
  })

  it('SDET-added: no point-selection mark exists when nothing is selected or when a body is selected', () => {
    expect(build({ selection: null }).marks.filter((m) => m.kind === 'point-selection')).toHaveLength(0)
    expect(
      build({ selection: { bodyId: 'feat-body-0' } }).marks.filter((m) => m.kind === 'point-selection'),
    ).toHaveLength(0)
  })

  // Scenario: A selected gate still shows its facts and its selected mark
  it('Scenario: A selected gate still shows its facts and its selected mark (the drawn half)', () => {
    const s = build({ selection: { bodyId: 'gate-sys_-6_16' } })
    const gate = s.marks.find((m) => m.kind === 'gate')!
    expect(gate.selected, 'the selected gate\'s drawn mark must show the selected state').toBe(true)
    // ...and nothing else is selected.
    expect(s.marks.filter((m) => m.selected)).toHaveLength(1)
  })

  it('SDET-added: selecting a body marks exactly that body', () => {
    const s = build({ selection: { bodyId: 'feat-body-0' } })
    expect(markById(s, 'feat-body-0')!.selected).toBe(true)
    expect(s.marks.filter((m) => m.selected).map((m) => m.id)).toEqual(['feat-body-0'])
  })
})

describe('space-scene — reduced motion', () => {
  // Scenario: Reduced motion freezes decorative animation while positions
  // keep advancing
  it('Scenario: Reduced motion freezes decorative animation while positions keep advancing', () => {
    const a = buildSceneModel({
      interior: interior(),
      fleets: [parkedFleet()],
      worldTimeMs: T0,
      reducedMotion: true,
      selection: null,
      log: () => {},
    } as SceneInput)
    const b = buildSceneModel({
      interior: interior(),
      fleets: [parkedFleet()],
      worldTimeMs: T0 + 250_000,
      reducedMotion: true,
      selection: null,
      log: () => {},
    } as SceneInput)

    // The decorative time input is frozen...
    expect(b.decorativeTimeMs).toBe(a.decorativeTimeMs)
    // ...while the position clock and every position keep advancing.
    expect(b.positionTimeMs).toBe(T0 + 250_000)
    expect(markById(b, 'feat-body-0')!.position).not.toEqual(markById(a, 'feat-body-0')!.position)
    expect(b.marks.find((m) => m.kind === 'fleet')!.position).not.toEqual(
      a.marks.find((m) => m.kind === 'fleet')!.position,
    )
  })

  it('SDET-added: without a reduced-motion preference the decorative clock advances too', () => {
    const a = build({ worldTimeMs: T0 })
    const b = build({ worldTimeMs: T0 + 250_000 })
    expect(b.decorativeTimeMs).not.toBe(a.decorativeTimeMs)
  })

  it('SDET-added: selection state still renders accurately under reduced motion', () => {
    const s = buildSceneModel({
      interior: interior(),
      fleets: [],
      worldTimeMs: T0,
      reducedMotion: true,
      selection: { bodyId: 'feat-body-0' },
      log: () => {},
    } as SceneInput)
    expect(markById(s, 'feat-body-0')!.selected).toBe(true)
  })
})

describe('space-scene — a failed interior read', () => {
  it('SDET-added: a null interior yields an empty scene rather than throwing', () => {
    const s = buildSceneModel({
      interior: null,
      fleets: [parkedFleet()],
      worldTimeMs: T0,
      reducedMotion: false,
      selection: null,
      log: () => {},
    } as SceneInput)
    expect(s.marks).toEqual([])
    expect(s.curves).toEqual([])
    expect(s.beltFields).toEqual([])
  })
})
