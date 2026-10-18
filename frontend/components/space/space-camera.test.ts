import { describe, expect, it } from 'vitest'
import { advanceDrag, atOrbitLimit, atPanLimit, atZoomLimit, beginDrag, clampCamera, defaultCamera, fleetCamera, isDefaultCamera, isGesture, panBound, panBySteps, pickRadius, zoomRange } from './space-camera'
import { viewBasisOf } from './space-projection'
describe('System framing and limits (input belongs to shared MapCameraRig)', () => {
  it('scales framing, legal pick radius and zoom range with served extent', () => {
    for (const extent of [100, 650, 1400]) {
      expect(defaultCamera(extent).distance).toBe(extent * 0.45)
      expect(pickRadius(extent)).toBe(extent)
      expect(zoomRange(extent)).toEqual({ min: extent * 0.08, max: extent * 6 })
      expect(isDefaultCamera(defaultCamera(extent), extent)).toBe(true)
    }
  })
  it('clamps framing and exposes actionable limit announcements', () => {
    const state = clampCamera({ ...defaultCamera(100), distance: 10000, pitch: 10, target: { x: 10000, y: 0, z: 0 } }, 100)
    expect(atZoomLimit(state, 100)).toBe('max'); expect(atOrbitLimit(state)).toBe('max'); expect(atPanLimit(state, 100)).toBe(true)
    expect(Math.hypot(state.target.x, state.target.y, state.target.z)).toBeCloseTo(panBound(100))
    expect(panBySteps(defaultCamera(100), 1, 0, 100).target.x).toBeGreaterThan(0)
  })
  it('frames behind a followed fleet toward the star and handles an origin fleet', () => {
    for (const position of [{ x: 20, y: 3, z: -10 }, { x: -20, y: -3, z: 10 }, { x: 0, y: 0, z: 0 }]) {
      const camera = fleetCamera(100, 'fleet', position), basis = viewBasisOf(camera, { width: 390, height: 844 })
      expect(camera.followFleetId).toBe('fleet'); expect(camera.target).toEqual(position)
      expect(Number.isFinite(basis.eye.x + basis.eye.y + basis.eye.z)).toBe(true)
      expect(basis.eye.y).toBeGreaterThan(position.y)
    }
  })
})
describe('selection drag threshold, independent of camera gestures', () => {
  it('uses total sticky displacement so out-and-back drags cannot select', () => {
    const tracker = beginDrag(100, 100)
    advanceDrag(tracker, 104, 100); expect(isGesture(tracker)).toBe(false)
    advanceDrag(tracker, 108, 100); expect(isGesture(tracker)).toBe(true)
    advanceDrag(tracker, 100, 100); expect(isGesture(tracker)).toBe(true)
  })
  it('counts diagonal movement and returns incremental deltas', () => {
    const tracker = beginDrag(0, 0)
    expect(advanceDrag(tracker, 6, 6)).toEqual({ dx: 6, dy: 6 }); expect(isGesture(tracker)).toBe(true)
    expect(advanceDrag(tracker, 8, 10)).toEqual({ dx: 2, dy: 4 })
  })
})
