import { describe, it, expect } from 'vitest'
import { projectToScreen, unprojectToViewPlane } from '@/lib/space/draw'
import { viewBasisOf, TAN_HALF_FOV } from './space-projection'
import { defaultCamera, panBySteps, orbitBySteps } from './space-camera'

// Implementer-authored (openspec build-production-space-view). The basis is
// what keeps a DRAWN mark and its DOM hit target in the same place, and what
// makes a click resolve to the point the player aimed at — so the property
// that matters is the ROUND TRIP: project a world point, unproject the
// resulting pixel, get the same point back.

const EXTENT = 658.7081316032265
const VIEWPORT = { width: 1200, height: 900 }

describe('space-projection — the camera basis', () => {
  it('is orthonormal and looks at the pan target', () => {
    const camera = orbitBySteps(panBySteps(defaultCamera(EXTENT), 2, 1, EXTENT), 3, -1)
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
    const camera = orbitBySteps(panBySteps(defaultCamera(EXTENT), -1, 1, EXTENT), 2, 1)
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
