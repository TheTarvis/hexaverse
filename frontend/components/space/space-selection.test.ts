import { describe, it, expect } from 'vitest'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`, requirements *Toggle-to-Deselect Single
// Selection Among a Body, a Lane Gate, or a Point*, *Space View Picking
// Resolves to the Body, Lane Gate, or Point Under the Pointer*, and *Burn
// Command Targets Any Selected Body, Lane Gate, or Point Uniformly*
// (tasks.md 3.1, 3.2, 4.10).
//
// THE CONTRACT: `frontend/components/space/space-selection.ts`, the pure
// selection/pick model.
//
//   export interface SpaceSelection { bodyId?: string; point?: DrawVec3 }
//        -- EXACTLY ONE of the two is set. There is deliberately NO 'gate'
//           member and no discriminating `kind` tag: *No kind-specific
//           selection branch survives the unification* forbids a
//           "lane-gate-specific or point-specific selection kind", and
//           `decisions.md`'s "gates ARE bodies" is what makes that possible.
//           A gate is selected as a body whose id is the gate body's id.
//   export interface PickMark { bodyId; screenX; screenY; radiusPx; drawOrder }
//   export function selectionKey(sel): string
//   export function sameSelection(a, b): boolean
//   export function toggleSelection(current, picked): SpaceSelection | null
//   export function selectionOrderRequest(sel): { bodyId?: string; point?: ... }
//   export function resolvePick(input): SpaceSelection | null
//
//        resolvePick input:
//          { screenX, screenY, marks: PickMark[],
//            planePoint: DrawVec3 | null,   // null == the ray missed the pick plane
//            pickRadius: number }           // = pickRadius(extent), scene units
//
// VACUITY NOTE: `resolvePick` returning null for everything would pass the
// three clearing cases and fail all six positive ones; returning the first
// mark always would pass the positive ones and fail the clearing and the
// draw-order ones. No constant satisfies this file.

import {
  selectionKey,
  sameSelection,
  toggleSelection,
  selectionOrderRequest,
  resolvePick,
  type SpaceSelection,
  type PickMark,
} from './space-selection'

const PICK_RADIUS = 900

// A planet, its moon drawn on top of it, a belt (drawn UNDER a body), and a
// lane-gate body — which is just a body whose id happens to be a gate id.
const PLANET: PickMark = { bodyId: 'feat-body-3', screenX: 400, screenY: 300, radiusPx: 30, drawOrder: 2 }
const MOON: PickMark = { bodyId: 'feat-moon-0', screenX: 405, screenY: 305, radiusPx: 10, drawOrder: 3 }
const BELT: PickMark = { bodyId: 'feat-belt-0', screenX: 600, screenY: 300, radiusPx: 60, drawOrder: 1 }
const GATE: PickMark = { bodyId: 'gate-sys_-6_16', screenX: 900, screenY: 120, radiusPx: 14, drawOrder: 2 }
const MARKS = [PLANET, MOON, BELT, GATE]

const somewhere = { x: 12, y: 0, z: -34 }

function pick(x: number, y: number, planePoint: { x: number; y: number; z: number } | null = somewhere) {
  return resolvePick({ screenX: x, screenY: y, marks: MARKS, planePoint, pickRadius: PICK_RADIUS })
}

describe('space-selection — picking', () => {
  // Scenario: Clicking a body mark selects that body
  it('Scenario: Clicking a body mark selects that body', () => {
    // (380, 300) is inside the planet's 30px target and OUTSIDE its moon's
    // 10px one — the planet's own mark, unambiguously.
    expect(pick(380, 300)).toEqual({ bodyId: 'feat-body-3' })
  })

  // Scenario: Clicking a lane-gate mark selects that gate
  it('Scenario: Clicking a lane-gate mark selects that gate', () => {
    // Identical shape to a planet's selection — that identity is the point.
    expect(pick(GATE.screenX, GATE.screenY)).toEqual({ bodyId: 'gate-sys_-6_16' })
  })

  // Scenario: Clicking empty space selects the point under the pointer
  it('Scenario: Clicking empty space selects the point under the pointer', () => {
    expect(pick(50, 700)).toEqual({ point: somewhere })
  })

  // Scenario: An overlapping child mark wins over its parent
  it('Scenario: An overlapping child mark wins over its parent', () => {
    // (405, 305) is inside BOTH the moon's 10px target and the planet's
    // 30px one. The moon is drawn on top (higher drawOrder) and wins.
    expect(pick(405, 305)).toEqual({ bodyId: 'feat-moon-0' })
    // ...and the planet still wins where the moon's target does not reach.
    expect(pick(425, 300)).toEqual({ bodyId: 'feat-body-3' })
  })

  // Scenario: Clicking within the belt's decorative field selects the belt
  // feature  (`Belt Members Render as Decorative Detail...`)
  it('Scenario: Clicking within the belt\'s decorative field selects the belt feature', () => {
    // Anywhere inside the belt's generous field resolves to the ONE belt
    // body. No member id can be produced, because no member is ever a mark.
    for (const dx of [-50, -20, 0, 20, 50]) {
      expect(pick(BELT.screenX + dx, BELT.screenY)).toEqual({ bodyId: 'feat-belt-0' })
    }
  })

  // Scenario: A click resolving to no point clears the selection
  it('Scenario: A click resolving to no point clears the selection', () => {
    // (a) the ray missed the pick plane entirely
    expect(pick(10, 10, null)).toBeNull()
    // (b) it hit the plane, but beyond the maximum pick radius
    const beyond = { x: PICK_RADIUS + 1, y: 0, z: 0 }
    expect(
      resolvePick({ screenX: 10, screenY: 10, marks: MARKS, planePoint: beyond, pickRadius: PICK_RADIUS }),
    ).toBeNull()
  })

  it('SDET-added: a point exactly AT the maximum pick radius still resolves to that point', () => {
    // The requirement says "lies BEYOND the maximum pick radius" clears —
    // so the boundary itself is inside. An implementation using `>=` loses a
    // ring of legal burn targets at the exact edge of the pickable disc.
    const at = { x: PICK_RADIUS, y: 0, z: 0 }
    expect(
      resolvePick({ screenX: 10, screenY: 10, marks: MARKS, planePoint: at, pickRadius: PICK_RADIUS }),
    ).toEqual({ point: at })
  })

  it('SDET-added: the pick radius is measured in three dimensions, not on the x/z plane alone', () => {
    const highAndFar = { x: 0, y: PICK_RADIUS + 1, z: 0 }
    expect(
      resolvePick({ screenX: 1, screenY: 1, marks: MARKS, planePoint: highAndFar, pickRadius: PICK_RADIUS }),
    ).toBeNull()
  })

  it('SDET-added: a mark outside every hit target but within the pick radius yields the point, not the nearest mark', () => {
    // "sized generously around each body's drawn radius" is not "nearest
    // mark wins": a click 200px from every mark is a point pick, and a
    // nearest-mark implementation would silently make bare points
    // unreachable — the one selection kind that makes `space.ParkPoint`
    // usable at all.
    expect(pick(400, 700)).toEqual({ point: somewhere })
  })

  it('SDET-added: an empty scene still resolves a point pick', () => {
    expect(
      resolvePick({ screenX: 1, screenY: 1, marks: [], planePoint: somewhere, pickRadius: PICK_RADIUS }),
    ).toEqual({ point: somewhere })
  })
})

describe('space-selection — toggle-to-deselect, one selection at a time', () => {
  // Scenario: Re-selecting the same body deselects it
  it('Scenario: Re-selecting the same body deselects it', () => {
    const body: SpaceSelection = { bodyId: 'feat-body-3' }
    expect(toggleSelection(body, { bodyId: 'feat-body-3' })).toBeNull()
  })

  // Scenario: Selecting a point replaces a body selection
  it('Scenario: Selecting a point replaces a body selection', () => {
    const body: SpaceSelection = { bodyId: 'feat-body-3' }
    expect(toggleSelection(body, { point: somewhere })).toEqual({ point: somewhere })
  })

  it('SDET-added: selecting a different body replaces rather than deselects', () => {
    expect(toggleSelection({ bodyId: 'feat-body-3' }, { bodyId: 'gate-sys_-6_16' })).toEqual({
      bodyId: 'gate-sys_-6_16',
    })
  })

  it('SDET-added: re-picking the identical point deselects it', () => {
    expect(toggleSelection({ point: somewhere }, { point: { ...somewhere } })).toBeNull()
  })

  it('SDET-added: picking a different point replaces rather than deselects', () => {
    expect(toggleSelection({ point: somewhere }, { point: { x: 1, y: 2, z: 3 } })).toEqual({
      point: { x: 1, y: 2, z: 3 },
    })
  })

  // Scenario: Clicking beyond the pick radius clears the selection
  it('Scenario: Clicking beyond the pick radius clears the selection', () => {
    expect(toggleSelection({ bodyId: 'feat-body-3' }, null)).toBeNull()
    expect(toggleSelection({ point: somewhere }, null)).toBeNull()
    expect(toggleSelection(null, null)).toBeNull()
  })

  it('SDET-added: selection equality is by value, and a gate is not special-cased', () => {
    const gateX: SpaceSelection = { bodyId: 'gate-x' }
    const gateY: SpaceSelection = { bodyId: 'gate-y' }
    const pt: SpaceSelection = { point: somewhere }
    expect(sameSelection(gateX, { bodyId: 'gate-x' })).toBe(true)
    expect(sameSelection(gateX, gateY)).toBe(false)
    expect(sameSelection(gateX, pt)).toBe(false)
    expect(sameSelection(null, null)).toBe(true)
    expect(selectionKey({ bodyId: 'feat-body-3' })).not.toBe(selectionKey({ point: somewhere }))
  })
})

describe('space-selection — one uniform order request for every selection kind', () => {
  // Scenario: Commanding a burn toward a selected lane-gate body submits an
  // order  /  Scenario: Commanding a burn toward a selected point in space
  // submits an order  /  Scenario: No kind-specific selection branch
  // survives the unification
  it('Scenario: No kind-specific selection branch survives the unification', () => {
    // The gate and the planet produce structurally IDENTICAL requests,
    // differing only in the id — proving one code path, not two that
    // happen to agree.
    const planet = selectionOrderRequest({ bodyId: 'feat-body-3' })
    const gate = selectionOrderRequest({ bodyId: 'gate-sys_-6_16' })
    expect(planet).not.toBeNull()
    expect(gate).not.toBeNull()
    expect(Object.keys(planet!).sort()).toEqual(Object.keys(gate!).sort())
    expect(planet).toEqual({ bodyId: 'feat-body-3' })
    expect(gate).toEqual({ bodyId: 'gate-sys_-6_16' })

    // `fleet-movement`'s *Order Request Validation*: exactly one of bodyId
    // or point, never both, never neither.
    const point = selectionOrderRequest({ point: somewhere })
    expect(point).toEqual({ point: somewhere })
    expect(point!.bodyId).toBeUndefined()
    expect(gate!.point).toBeUndefined()
  })

  it('SDET-added: an empty selection produces no order request', () => {
    // *No lane-gate-specific or point-specific refusal copy exists* — the
    // "select a target first" refusal is reachable ONLY from an empty
    // selection, so the empty case must be distinguishable here.
    expect(selectionOrderRequest(null)).toBeNull()
  })
})
