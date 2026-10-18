import { describe, it, expect } from 'vitest'
import { projectToScreen, unprojectToViewPlane } from '@/lib/space/draw'
import { viewBasisOf, TAN_HALF_FOV, projectMarks, hitTargetTransform, OFFSCREEN_PX } from './space-projection'
import { defaultCamera, panBySteps } from './space-camera'
import type { SceneMark } from './space-scene'

// Implementer-authored (openspec build-production-space-view). The basis is
// what keeps a DRAWN mark and its DOM hit target in the same place, and what
// makes a click resolve to the point the player aimed at — so the property
// that matters is the ROUND TRIP: project a world point, unproject the
// resulting pixel, get the same point back.

const EXTENT = 658.7081316032265
const VIEWPORT = { width: 1200, height: 900 }

describe('space-projection — the camera basis', () => {
  it('is orthonormal and looks at the pan target', () => {
    const camera = { ...panBySteps(defaultCamera(EXTENT), 2, 1, EXTENT), yaw: 0.75, pitch: 0.67 }
    const basis = viewBasisOf(camera, VIEWPORT)
    const dot = (a: typeof basis.right, b: typeof basis.right) => a.x * b.x + a.y * b.y + a.z * b.z
    expect(dot(basis.right, basis.up)).toBeCloseTo(0, 9)
    expect(dot(basis.right, basis.forward)).toBeCloseTo(0, 9)
    expect(dot(basis.up, basis.forward)).toBeCloseTo(0, 9)
    for (const v of [basis.right, basis.up, basis.forward]) {
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9)
    }
    // The eye sits one camera distance from the target, along -forward.
    const toTarget = {
      x: camera.target.x - basis.eye.x,
      y: camera.target.y - basis.eye.y,
      z: camera.target.z - basis.eye.z,
    }
    expect(dot(toTarget, basis.forward)).toBeCloseTo(camera.distance, 6)
  })

  it('projects the pan target to the centre of the viewport', () => {
    const camera = panBySteps(defaultCamera(EXTENT), 1, 2, EXTENT)
    const screen = projectToScreen(camera.target, viewBasisOf(camera, VIEWPORT))
    expect(screen.x).toBeCloseTo(VIEWPORT.width / 2, 6)
    expect(screen.y).toBeCloseTo(VIEWPORT.height / 2, 6)
    expect(screen.onScreen).toBe(true)
  })

  it('round-trips a point on the pick plane through screen space', () => {
    const camera = { ...panBySteps(defaultCamera(EXTENT), -1, 1, EXTENT), yaw: 0.7, pitch: 0.77 }
    const basis = viewBasisOf(camera, VIEWPORT)
    for (const [px, py] of [
      [300, 200],
      [900, 700],
      [601, 451],
    ]) {
      const world = unprojectToViewPlane(px, py, basis, camera.target)
      const back = projectToScreen(world, basis)
      expect(back.x).toBeCloseTo(px, 6)
      expect(back.y).toBeCloseTo(py, 6)
    }
  })

  it('reports a position behind the eye as off screen rather than mirrored', () => {
    const camera = defaultCamera(EXTENT)
    const basis = viewBasisOf(camera, VIEWPORT)
    const behind = {
      x: basis.eye.x - basis.forward.x * EXTENT,
      y: basis.eye.y - basis.forward.y * EXTENT,
      z: basis.eye.z - basis.forward.z * EXTENT,
    }
    const screen = projectToScreen(behind, basis)
    expect(screen.onScreen).toBe(false)
    expect(screen.depth).toBeLessThanOrEqual(0)
  })

  it('exposes one field of view, shared by the picking basis and the renderer', () => {
    expect(TAN_HALF_FOV).toBeGreaterThan(0)
    expect(viewBasisOf(defaultCamera(EXTENT), VIEWPORT).tanHalfFov).toBe(TAN_HALF_FOV)
  })
})

// RED-PHASE ADDITION — task 4.1 (impl contract §5): `projectMarks` and
// `hitTargetTransform`, extracted from `SpaceLayers`' render so the transform
// loop can call the SAME projection React's coarse render used to.

function mark(over: Partial<SceneMark> = {}): SceneMark {
  return { id: 'm', kind: 'body', position: { x: 0, y: 0, z: 0 }, radius: 1, pickable: true, selected: false, ...over }
}

describe('projectMarks', () => {
  it('returns one entry per scene mark, in scene order, each { mark, screen: projectToScreen(mark.position, basis) }', () => {
    const camera = defaultCamera(EXTENT)
    const basis = viewBasisOf(camera, VIEWPORT)
    const a = mark({ id: 'a', position: { x: 10, y: 0, z: 0 } })
    const b = mark({ id: 'b', position: { x: -10, y: 0, z: 0 } })
    const result = projectMarks({ marks: [a, b] }, basis)
    expect(result).toHaveLength(2)
    expect(result[0]!.mark).toBe(a)
    expect(result[1]!.mark).toBe(b)
    expect(result[0]!.screen).toEqual(projectToScreen(a.position, basis))
    expect(result[1]!.screen).toEqual(projectToScreen(b.position, basis))
  })

  it('returns an empty array for an empty scene', () => {
    const basis = viewBasisOf(defaultCamera(EXTENT), VIEWPORT)
    expect(projectMarks({ marks: [] }, basis)).toEqual([])
  })

  it('is pure — the same scene and basis project identically on repeated calls', () => {
    const basis = viewBasisOf(defaultCamera(EXTENT), VIEWPORT)
    const scene = { marks: [mark({ id: 'a', position: { x: 5, y: 1, z: -2 } })] }
    expect(projectMarks(scene, basis)).toEqual(projectMarks(scene, basis))
  })
})

describe('hitTargetTransform', () => {
  it('places an on-screen point at its x/y, centred', () => {
    expect(hitTargetTransform({ x: 12.5, y: 40, onScreen: true })).toBe(
      'translate3d(12.5px, 40px, 0px) translate(-50%, -50%)',
    )
  })

  it('parks an off-screen point at the sentinel, centred', () => {
    expect(hitTargetTransform({ x: 900, y: 900, onScreen: false })).toBe(
      `translate3d(${OFFSCREEN_PX}px, ${OFFSCREEN_PX}px, 0px) translate(-50%, -50%)`,
    )
  })

  it('parks a point behind the eye (onScreen false with a non-positive depth) at the sentinel', () => {
    const camera = defaultCamera(EXTENT)
    const basis = viewBasisOf(camera, VIEWPORT)
    const behind = {
      x: basis.eye.x - basis.forward.x * EXTENT,
      y: basis.eye.y - basis.forward.y * EXTENT,
      z: basis.eye.z - basis.forward.z * EXTENT,
    }
    const screen = projectToScreen(behind, basis)
    expect(screen.onScreen).toBe(false)
    expect(hitTargetTransform(screen)).toBe(
      `translate3d(${OFFSCREEN_PX}px, ${OFFSCREEN_PX}px, 0px) translate(-50%, -50%)`,
    )
  })

  it('parks an undefined screen point at the sentinel (a mark absent from the frame)', () => {
    expect(hitTargetTransform(undefined)).toBe(
      `translate3d(${OFFSCREEN_PX}px, ${OFFSCREEN_PX}px, 0px) translate(-50%, -50%)`,
    )
  })

  it('parks a non-finite screen point at the sentinel', () => {
    expect(hitTargetTransform({ x: NaN, y: NaN, onScreen: false })).toBe(
      `translate3d(${OFFSCREEN_PX}px, ${OFFSCREEN_PX}px, 0px) translate(-50%, -50%)`,
    )
  })

  it('jsdom round-trips the transform string verbatim, so a direct string comparison against a written style is valid', () => {
    const el = document.createElement('div')
    const str = hitTargetTransform({ x: 12.5, y: 40, onScreen: true })
    el.style.transform = str
    expect(el.style.transform).toBe(str)
  })
})
