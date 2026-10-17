import { fleetCamera } from './space-camera'
import { viewBasisOf } from './space-projection'
import { describe, it, expect } from 'vitest'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`, requirements *Space View Camera Orbit,
// Pan, and Zoom*, *Space View Camera Touch Pinch-Zoom*, *Space View Camera
// Is Keyboard-Operable*, *Space View Camera Manual Recenter* (tasks.md
// 5.1, 5.1b, 5.1c, 5.2, 5.4, 5.5, 5.6).
//
// THE CONTRACT: `frontend/components/space/space-camera.ts` is the PURE
// camera model — no React, no DOM — mirroring the shape
// `components/board/board-camera.ts` already established for the board
// view it replaces. Every gesture is a pure `(camera, input) -> camera`.
// It is NOT in `lib/space/`, whose name guard admits only draw math
// (tasks.md 1.4/1.5).
//
//   export interface SpaceCamera { yaw; pitch; distance; target: {x,y,z} }
//   export const DRAG_THRESHOLD_PX = 8
//   export const DEFAULT_DISTANCE_MULT, ZOOM_MIN_MULT, ZOOM_MAX_MULT,
//                PAN_BOUND_MULT, PICK_RADIUS_MULT : number   (extent multiples)
//   export const PITCH_MIN, PITCH_MAX, KEY_ORBIT_STEP,
//                KEY_PAN_STEP_MULT, KEY_ZOOM_FACTOR : number
//   defaultCamera(extent) / isDefaultCamera(cam, extent)
//   zoomRange(extent) / panBound(extent) / pickRadius(extent)
//   clampCamera(cam, extent)
//   orbitByPixels(cam, dx, dy) / orbitBySteps(cam, sx, sy)
//   panByPixels(cam, dx, dy, viewportPx) / panBySteps(cam, sx, sz, extent)
//   zoomByWheel(cam, deltaY, extent) / zoomBySteps(cam, notches, extent)
//   zoomByPinch(cam, prevDistPx, nextDistPx, extent)
//   atZoomLimit(cam, extent) / atPanLimit(cam, extent) / atOrbitLimit(cam)
//   beginDrag(x,y) / advanceDrag(d,x,y) / isGesture(d)
//   touchDistance(a, b)
//
// THE MULTIPLIER VALUES ARE DELIBERATELY NOT ASSERTED. design.md OQ-2 leaves
// the default framing, zoom range and pan bound open for playtesting. What
// this suite pins is the SHAPE the requirement fixes: that they are single
// configured multipliers, that they scale off the served `extent`, that the
// clamps hold, and that reset returns to them.
//
// VACUITY NOTE (per describe block, inline). The global one: every "X is
// unchanged" assertion is paired with a "Y did change" assertion, so a stub
// returning its input camera unchanged fails every block.

import {
  DRAG_THRESHOLD_PX,
  defaultCamera,
  isDefaultCamera,
  zoomRange,
  panBound,
  pickRadius,
  clampCamera,
  orbitByPixels,
  orbitBySteps,
  panByPixels,
  panBySteps,
  zoomByWheel,
  zoomBySteps,
  zoomByPinch,
  atZoomLimit,
  atPanLimit,
  atOrbitLimit,
  beginDrag,
  advanceDrag,
  isGesture,
  touchDistance,
  type SpaceCamera,
} from './space-camera'

// Two systems of very different scale — the whole point of scaling off the
// served `extent`. The compact number is the recorded wire sample's own
// `extent` (backend/testdata/.../interior-read.json).
const COMPACT_EXTENT = 658.7081316032265
const SPRAWLING_EXTENT = COMPACT_EXTENT * 7

const VIEWPORT = { width: 1200, height: 800 }

describe('space-camera — default framing scales off the served extent', () => {
  // Scenario: The framing scales with the system's served extent
  it('Scenario: The framing scales with the system\'s served extent', () => {
    const a = defaultCamera(COMPACT_EXTENT)
    const b = defaultCamera(SPRAWLING_EXTENT)

    // One configured multiplier each, applied to each system's own extent.
    const ratio = SPRAWLING_EXTENT / COMPACT_EXTENT
    expect(b.distance / a.distance).toBeCloseTo(ratio, 9)
    expect(zoomRange(SPRAWLING_EXTENT).min / zoomRange(COMPACT_EXTENT).min).toBeCloseTo(ratio, 9)
    expect(zoomRange(SPRAWLING_EXTENT).max / zoomRange(COMPACT_EXTENT).max).toBeCloseTo(ratio, 9)
    expect(panBound(SPRAWLING_EXTENT) / panBound(COMPACT_EXTENT)).toBeCloseTo(ratio, 9)
    expect(pickRadius(SPRAWLING_EXTENT) / pickRadius(COMPACT_EXTENT)).toBeCloseTo(ratio, 9)

    // ...and the values genuinely differ, so a constant implementation that
    // ignored `extent` fails here rather than passing the ratio check by
    // returning 0/0 or 1/1.
    expect(b.distance).not.toBeCloseTo(a.distance, 3)
    expect(a.distance).toBeGreaterThan(0)
    expect(panBound(COMPACT_EXTENT)).toBeGreaterThan(0)
    expect(pickRadius(COMPACT_EXTENT)).toBeGreaterThan(0)
  })

  it('SDET-added: default framing is centred on the star (the origin)', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    expect(c.target).toEqual({ x: 0, y: 0, z: 0 })
    expect(isDefaultCamera(c, COMPACT_EXTENT)).toBe(true)
  })

  it('SDET-added: the default distance lies inside the configured zoom range', () => {
    for (const extent of [COMPACT_EXTENT, SPRAWLING_EXTENT]) {
      const { min, max } = zoomRange(extent)
      const c = defaultCamera(extent)
      expect(min).toBeLessThan(max)
      expect(c.distance).toBeGreaterThanOrEqual(min)
      expect(c.distance).toBeLessThanOrEqual(max)
    }
  })

  it('SDET-added: a moved camera is not the default framing', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    expect(isDefaultCamera(zoomBySteps(c, 1, COMPACT_EXTENT), COMPACT_EXTENT)).toBe(false)
    expect(isDefaultCamera(panBySteps(c, 1, 0, COMPACT_EXTENT), COMPACT_EXTENT)).toBe(false)
    expect(isDefaultCamera(orbitBySteps(c, 1, 0), COMPACT_EXTENT)).toBe(false)
  })
})

describe('space-camera — orbit', () => {
  // Scenario: Primary-button drag orbits the camera
  it('Scenario: Primary-button drag orbits the camera (angle changes, pan target does not)', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    const o = orbitByPixels(c, 120, 40)
    expect(o.yaw, 'a horizontal drag must change the yaw').not.toBe(c.yaw)
    expect(o.target, 'orbiting must not translate the pan target').toEqual(c.target)
    expect(o.distance, 'orbiting must not dolly').toBe(c.distance)
  })

  it('SDET-added: orbit pitch clamps, and the clamp is reported', () => {
    let c = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 500; i++) c = orbitBySteps(c, 0, 1)
    const top = c
    expect(atOrbitLimit(top)).not.toBeNull()
    const further = orbitBySteps(top, 0, 1)
    expect(further.pitch, 'pitch must stop at the clamp').toBe(top.pitch)

    let d = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 500; i++) d = orbitBySteps(d, 0, -1)
    expect(atOrbitLimit(d)).not.toBeNull()
    expect(orbitBySteps(d, 0, -1).pitch).toBe(d.pitch)

    // Away from the clamp, no at-limit state.
    expect(atOrbitLimit(defaultCamera(COMPACT_EXTENT))).toBeNull()
  })

  it('SDET-added: yaw wraps rather than clamping, so the camera can circle the system', () => {
    let c = defaultCamera(COMPACT_EXTENT)
    const start = c.yaw
    for (let i = 0; i < 400; i++) c = orbitBySteps(c, 1, 0)
    expect(Number.isFinite(c.yaw)).toBe(true)
    // A full circuit must be reachable: some intermediate yaw differs from
    // the start, and the value never runs away to infinity.
    expect(Math.abs(c.yaw)).toBeLessThan(1e6)
    expect(c.yaw).not.toBe(start)
  })
})

describe('space-camera — pan', () => {
  // Scenario: Secondary-button drag pans the camera's target
  it('Scenario: Secondary-button drag pans the camera\'s target', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    const p = panByPixels(c, 60, 20, VIEWPORT)
    expect(p.target, 'the pan target must translate').not.toEqual(c.target)
    expect(p.yaw, 'panning must not change the viewing angle').toBe(c.yaw)
    expect(p.pitch).toBe(c.pitch)
    expect(p.distance).toBe(c.distance)
  })

  // Scenario: Pan clamps at the configured bound
  it('Scenario: Pan clamps at the configured bound (driven by drag)', () => {
    let c = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 2000; i++) c = panByPixels(c, 500, 0, VIEWPORT)
    const bound = panBound(COMPACT_EXTENT)
    const radial = Math.hypot(c.target.x, c.target.y, c.target.z)
    expect(radial, 'the pan target must stay inside the configured bound').toBeLessThanOrEqual(bound + 1e-9)
    expect(radial, 'the drag must actually have reached the bound, not stalled at the origin').toBeGreaterThan(
      bound * 0.5,
    )
    expect(atPanLimit(c, COMPACT_EXTENT)).toBe(true)

    const further = panByPixels(c, 500, 0, VIEWPORT)
    // "does not move" is asserted as a distance, not as bit-equality: a
    // clamp that renormalizes onto the bound may differ in the last ULP, and
    // failing a correct implementation for that would be a false alarm.
    expect(
      Math.hypot(further.target.x - c.target.x, further.target.y - c.target.y, further.target.z - c.target.z),
      'panning past the bound must not move the target',
    ).toBeLessThan(1e-6)
    expect(Math.hypot(further.target.x, further.target.y, further.target.z)).toBeLessThanOrEqual(bound + 1e-9)
  })

  // Scenario: Pan clamps at the configured bound (keyboard half — the same
  // scenario names "by secondary-button drag or by keyboard pan")
  it('Scenario: Pan clamps at the configured bound (driven by keyboard)', () => {
    let c = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 2000; i++) c = panBySteps(c, 1, 0, COMPACT_EXTENT)
    const bound = panBound(COMPACT_EXTENT)
    expect(Math.hypot(c.target.x, c.target.y, c.target.z)).toBeLessThanOrEqual(bound + 1e-9)
    expect(atPanLimit(c, COMPACT_EXTENT)).toBe(true)
    expect(panBySteps(c, 1, 0, COMPACT_EXTENT).target).toEqual(c.target)
  })

  // Scenario: Pan keys translate the camera's target
  it('Scenario: Pan keys translate the camera\'s target', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    const p = panBySteps(c, 1, 0, COMPACT_EXTENT)
    expect(p.target).not.toEqual(c.target)
    expect(p.yaw, 'the viewing angle is unchanged by a pan key').toBe(c.yaw)
    expect(p.pitch).toBe(c.pitch)

    // Scenario: A keyboard-only player can pan to a point away from the star
    // — the pure half. At default framing the target IS the star, which
    // `space.BuildCurve`'s endpoint-clearance guard always rejects; one pan
    // step must move it a real distance away, not an epsilon.
    const moved = Math.hypot(p.target.x, p.target.y, p.target.z)
    expect(moved, 'one keyboard pan step must move meaningfully off the star').toBeGreaterThan(
      COMPACT_EXTENT / 1000,
    )
  })

  it('SDET-added: one keyboard pan step scales with the system, like every other camera figure', () => {
    const a = panBySteps(defaultCamera(COMPACT_EXTENT), 1, 0, COMPACT_EXTENT).target
    const b = panBySteps(defaultCamera(SPRAWLING_EXTENT), 1, 0, SPRAWLING_EXTENT).target
    expect(Math.hypot(b.x, b.y, b.z) / Math.hypot(a.x, a.y, a.z)).toBeCloseTo(
      SPRAWLING_EXTENT / COMPACT_EXTENT,
      9,
    )
  })

  it('SDET-added: atPanLimit is false at the default framing', () => {
    expect(atPanLimit(defaultCamera(COMPACT_EXTENT), COMPACT_EXTENT)).toBe(false)
  })
})

describe('space-camera — zoom', () => {
  // Scenario: Wheel gesture zooms the camera
  it('Scenario: Wheel gesture zooms the camera', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    const inward = zoomByWheel(c, -100, COMPACT_EXTENT)
    const outward = zoomByWheel(c, 100, COMPACT_EXTENT)
    expect(inward.distance).toBeLessThan(c.distance)
    expect(outward.distance).toBeGreaterThan(c.distance)
  })

  // Scenario: Zooming keeps the current pan target fixed on screen
  it('Scenario: Zooming keeps the current pan target fixed on screen', () => {
    // The camera dollies along the view direction toward/away from its pan
    // target: the target is unchanged in world space and the viewing angle
    // is unchanged, so its screen position cannot move. A zoom that
    // translated the target (an anchor-under-cursor zoom) fails here.
    const c = panBySteps(defaultCamera(COMPACT_EXTENT), 2, 1, COMPACT_EXTENT)
    const z = zoomByWheel(c, -100, COMPACT_EXTENT)
    expect(z.target).toEqual(c.target)
    expect(z.yaw).toBe(c.yaw)
    expect(z.pitch).toBe(c.pitch)
    expect(z.distance, 'the zoom must actually have changed the distance').not.toBe(c.distance)
  })

  // Scenario: Zoom clamps at the configured bounds
  it('Scenario: Zoom clamps at the configured bounds', () => {
    const { min, max } = zoomRange(COMPACT_EXTENT)

    let inward = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 500; i++) inward = zoomByWheel(inward, -100, COMPACT_EXTENT)
    expect(inward.distance).toBeCloseTo(min, 9)
    expect(atZoomLimit(inward, COMPACT_EXTENT)).toBe('min')
    expect(zoomByWheel(inward, -100, COMPACT_EXTENT).distance).toBe(inward.distance)

    let outward = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 500; i++) outward = zoomByWheel(outward, 100, COMPACT_EXTENT)
    expect(outward.distance).toBeCloseTo(max, 9)
    expect(atZoomLimit(outward, COMPACT_EXTENT)).toBe('max')
    expect(zoomByWheel(outward, 100, COMPACT_EXTENT).distance).toBe(outward.distance)

    expect(atZoomLimit(defaultCamera(COMPACT_EXTENT), COMPACT_EXTENT)).toBeNull()
  })

  // Scenario: Zoom keys zoom the camera
  it('Scenario: Zoom keys zoom the camera', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    expect(zoomBySteps(c, 1, COMPACT_EXTENT).distance).toBeLessThan(c.distance)
    expect(zoomBySteps(c, -1, COMPACT_EXTENT).distance).toBeGreaterThan(c.distance)
    let clamped = c
    for (let i = 0; i < 500; i++) clamped = zoomBySteps(clamped, 1, COMPACT_EXTENT)
    expect(atZoomLimit(clamped, COMPACT_EXTENT)).toBe('min')
  })
})

describe('space-camera — touch pinch', () => {
  // Scenario: Pinching outward zooms in and inward zooms out
  it('Scenario: Pinching outward zooms in and inward zooms out', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    expect(zoomByPinch(c, 100, 200, COMPACT_EXTENT).distance).toBeLessThan(c.distance)
    expect(zoomByPinch(c, 200, 100, COMPACT_EXTENT).distance).toBeGreaterThan(c.distance)
  })

  // Scenario: Pinch zoom keeps the centred point fixed on screen
  it('Scenario: Pinch zoom keeps the centred point fixed on screen', () => {
    // Explicitly NOT anchored on the pinch midpoint: the pan target is
    // unchanged in world space and the angle is unchanged, so the centred
    // point cannot move. This scenario was dropped from the port and is
    // restored here (proposal, `board-view` retirement bullet).
    const c = panBySteps(defaultCamera(COMPACT_EXTENT), 3, -2, COMPACT_EXTENT)
    const z = zoomByPinch(c, 120, 300, COMPACT_EXTENT)
    expect(z.target).toEqual(c.target)
    expect(z.yaw).toBe(c.yaw)
    expect(z.pitch).toBe(c.pitch)
    expect(z.distance).not.toBe(c.distance)
  })

  // Scenario: Pinch zoom respects the same clamp as wheel zoom
  it('Scenario: Pinch zoom respects the same clamp as wheel zoom', () => {
    const { min, max } = zoomRange(COMPACT_EXTENT)
    let c = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 300; i++) c = zoomByPinch(c, 100, 140, COMPACT_EXTENT)
    expect(c.distance).toBeCloseTo(min, 9)
    let d = defaultCamera(COMPACT_EXTENT)
    for (let i = 0; i < 300; i++) d = zoomByPinch(d, 140, 100, COMPACT_EXTENT)
    expect(d.distance).toBeCloseTo(max, 9)
  })

  it('SDET-added: touchDistance is the plain euclidean distance between two touch points', () => {
    expect(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 12)
    expect(touchDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
  })

  it('SDET-added: a degenerate zero-distance pinch does not produce NaN or Infinity', () => {
    const c = defaultCamera(COMPACT_EXTENT)
    for (const z of [zoomByPinch(c, 0, 100, COMPACT_EXTENT), zoomByPinch(c, 100, 0, COMPACT_EXTENT), zoomByPinch(c, 0, 0, COMPACT_EXTENT)]) {
      expect(Number.isFinite(z.distance)).toBe(true)
      expect(z.distance).toBeGreaterThan(0)
    }
  })
})

describe('space-camera — the 8 CSS pixel click/gesture threshold', () => {
  // Scenario: A sub-threshold pointer press-release still resolves as a
  // click  /  Scenario: Movement exactly at the tap threshold resolves as an
  // orbit  (the pure predicate; the DOM halves live in SpaceStage.test.tsx
  // and the touch e2e)
  it('Scenario: Movement exactly at the tap threshold resolves as an orbit (the threshold is inclusive on the gesture side)', () => {
    expect(DRAG_THRESHOLD_PX).toBe(8)

    const at7 = advanceAndTrack(0, 0, 7, 0)
    expect(isGesture(at7), '7px is a click').toBe(false)

    const at8 = advanceAndTrack(0, 0, 8, 0)
    expect(isGesture(at8), 'exactly 8px is a GESTURE, not a click').toBe(true)

    const at9 = advanceAndTrack(0, 0, 9, 0)
    expect(isGesture(at9), '9px is a gesture').toBe(true)
  })

  it('SDET-added: the threshold is on total displacement, not on a single axis', () => {
    // 6px in x and 6px in y is 8.49px of travel — a gesture. An
    // implementation testing `|dx| >= 8 || |dy| >= 8` reports a click here.
    expect(isGesture(advanceAndTrack(0, 0, 6, 6))).toBe(true)
    // 5 + 5 is 7.07px — a click.
    expect(isGesture(advanceAndTrack(0, 0, 5, 5))).toBe(false)
  })

  it('SDET-added: a pointer that wanders past the threshold and returns is still a gesture', () => {
    // The tracker must be sticky on the maximum travel, not on the
    // press-to-release delta: a drag that ends where it began is still a
    // drag, and treating it as a click would change the selection under a
    // player who was orbiting.
    const d = beginDrag(0, 0)
    advanceDrag(d, 40, 0)
    advanceDrag(d, 0, 0)
    expect(isGesture(d)).toBe(true)
  })

  it('SDET-added: advanceDrag reports the incremental delta, not the cumulative one', () => {
    const d = beginDrag(100, 100)
    expect(advanceDrag(d, 110, 100)).toEqual({ dx: 10, dy: 0 })
    expect(advanceDrag(d, 115, 105)).toEqual({ dx: 5, dy: 5 })
  })
})

describe('space-camera — clamping is total', () => {
  it('SDET-added: clampCamera brings any out-of-range camera inside every bound', () => {
    const wild: SpaceCamera = {
      yaw: 99,
      pitch: 99,
      distance: 1e12,
      target: { x: 1e9, y: 1e9, z: 1e9 },
    }
    const c = clampCamera(wild, COMPACT_EXTENT)
    const { min, max } = zoomRange(COMPACT_EXTENT)
    expect(c.distance).toBeGreaterThanOrEqual(min)
    expect(c.distance).toBeLessThanOrEqual(max)
    expect(Math.hypot(c.target.x, c.target.y, c.target.z)).toBeLessThanOrEqual(panBound(COMPACT_EXTENT) + 1e-9)
    expect(atOrbitLimit(c)).not.toBeNull()
  })

  it('SDET-added: clampCamera is idempotent', () => {
    const once = clampCamera(
      { yaw: 3, pitch: 99, distance: 1e12, target: { x: 1e9, y: 0, z: 0 } },
      COMPACT_EXTENT,
    )
    const twice = clampCamera(once, COMPACT_EXTENT)
    // Compared to a tolerance for the same last-ULP reason as the pan clamp
    // above: a second pass must change nothing a player could perceive.
    expect(twice.yaw).toBeCloseTo(once.yaw, 9)
    expect(twice.pitch).toBeCloseTo(once.pitch, 9)
    expect(twice.distance).toBeCloseTo(once.distance, 6)
    expect(
      Math.hypot(twice.target.x - once.target.x, twice.target.y - once.target.y, twice.target.z - once.target.z),
    ).toBeLessThan(1e-6)
  })
})

// --- helpers -----------------------------------------------------------

function advanceAndTrack(x0: number, y0: number, x1: number, y1: number) {
  const d = beginDrag(x0, y0)
  advanceDrag(d, x1, y1)
  return d
}


it('frames the fleet in front of the star from slightly above, with a finite origin fallback', () => {
  for (const position of [{ x: 50, y: 2, z: 10 }, { x: -30, y: 0, z: -40 }]) {
    const camera = fleetCamera(100, 'fleet', position)
    const basis = viewBasisOf(camera, { width: 1200, height: 900 })
    expect(camera.target).toEqual(position)
    expect(camera.followFleetId).toBe('fleet')
    const outward = { x: basis.eye.x - position.x, y: basis.eye.y - position.y, z: basis.eye.z - position.z }
    const alignment = (outward.x * position.x + outward.y * position.y + outward.z * position.z) / (camera.distance * Math.hypot(position.x, position.y, position.z))
    expect(alignment).toBeGreaterThan(0.97)
    expect(basis.eye.y).toBeGreaterThan(position.y)
  }
  const origin = fleetCamera(100, 'fleet', { x: 0, y: 0, z: 0 })
  expect(Number.isFinite(origin.yaw) && Number.isFinite(origin.pitch)).toBe(true)
})

it('orbits around a selected object without recentering, changing distance or moving its screen position', () => {
  const camera = { ...defaultCamera(100), target: { x: 8, y: 2, z: -3 }, followFleetId: 'fleet' }
  const pivot = { x: 14, y: -2, z: 5 }
  const before = viewBasisOf(camera, { width: 390, height: 844 })
  const rotated = orbitByPixels(camera, 35, -20, pivot)
  const after = viewBasisOf(rotated, { width: 390, height: 844 })
  const dot = (basis: typeof before, axis: typeof before.right) => (pivot.x - basis.eye.x) * axis.x + (pivot.y - basis.eye.y) * axis.y + (pivot.z - basis.eye.z) * axis.z
  for (const axis of ['right', 'up', 'forward'] as const) expect(dot(after, after[axis])).toBeCloseTo(dot(before, before[axis]), 10)
  expect(rotated.distance).toBe(camera.distance)
  expect(rotated.target).not.toEqual(pivot)
  expect(rotated.followFleetId).toBeUndefined()
  expect(orbitByPixels(camera, 0, 0, pivot)).toEqual(camera)
  expect(orbitByPixels(camera, 10, 0).target).toEqual(camera.target)
  expect(orbitByPixels(camera, 10, 0).followFleetId).toBe('fleet')
})
