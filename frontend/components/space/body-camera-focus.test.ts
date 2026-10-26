import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bodyFocusCamera, bodyFocusTarget, DEFAULT_BODY_FOCUS, orbitFrame } from './body-camera-focus'
import { defaultCamera } from './space-camera'
import { drawRadiusFor, TAN_HALF_FOV } from './space-projection'
import { buildSceneModel } from './space-scene'
import { viewBasisOf } from './space-projection'
import type { SceneMark } from './space-scene'

const scene = buildSceneModel({ interior: null, fleets: [], worldTimeMs: 0, reducedMotion: false, selection: null, log: () => {} })
const body: SceneMark = { id: 'planet', kind: 'body', radius: 2, position: { x: 50, y: 0, z: 0 }, pickable: true, selected: false }

describe('body camera framing', () => {
  it.each([-0.4, 0.25, 1])('preserves both orbit angle and a player tilt of %s', pitch => {
    const initial = { ...defaultCamera(500), pitch }
    const star = { ...body, id: 'sun', kind: 'star' as const, position: { x: 0, y: 0, z: 0 } }
    const focused = bodyFocusCamera(initial, { ...scene, marks: [star, body] }, body, 500, 1200, 900)
    expect(focused.pitch).toBe(pitch)
    expect(focused.yaw).toBe(initial.yaw)
  })
  it('preserves the full viewing direction for targets on either side of the star', () => {
    const star = { ...body, id: 'sun', kind: 'star' as const, position: { x: 10, y: 3, z: -5 } }
    for (const position of [{ x: 50, y: 0, z: 20 }, { x: -50, y: 10, z: -20 }]) {
      const mark = { ...body, position }
      const camera = bodyFocusCamera(defaultCamera(500), { ...scene, marks: [star, mark] }, mark, 500, 1200, 900)
      const basis = viewBasisOf(camera, { width: 1200, height: 900 })
      const offset = new THREE.Vector3().copy(basis.eye).sub(position).normalize()
      const original = viewBasisOf(defaultCamera(500), { width: 1200, height: 900 })
      expect(offset.dot(new THREE.Vector3().copy(original.eye).normalize())).toBeCloseTo(1)
      expect(basis.eye.y).toBeGreaterThan(position.y)
      expect(camera.pitch).toBeCloseTo(defaultCamera(500).pitch)
      expect(camera.focusRequest?.alignView).toBeUndefined()
    }
  })
  it('retains the viewing angle for a star, empty point or a target without a sun direction', () => {
    const initial = defaultCamera(500)
    const star = { ...body, kind: 'star' as const }
    for (const mark of [star, { ...body, kind: 'point-selection' as const }, body]) {
      const camera = bodyFocusCamera(initial, { ...scene, marks: [star] }, mark, 500, 1200, 900)
      expect(camera.yaw).toBe(initial.yaw)
      expect(camera.pitch).toBe(initial.pitch)
      expect(camera.focusRequest?.alignView).toBeUndefined()
    }
  })
  it.each([[1200, 900], [390, 844]])('frames rendered size to one third on a %s × %s viewport', (width, height) => {
    const camera = bodyFocusCamera(defaultCamera(500), scene, body, 500, width, height)
    const radius = drawRadiusFor(body, 500)
    const projectedDiameter = radius * height / (Math.sqrt(camera.distance ** 2 - radius ** 2) * TAN_HALF_FOV)
    expect(projectedDiameter / Math.min(width, height)).toBeCloseTo(1 / 3)
    expect(camera.minDistance).toBeLessThan(500 * 0.08)
    expect(camera.followBodyId).toBe(body.id)
    expect(camera.yaw).toBe(defaultCamera(500).yaw)
  })
  it('uses the belt ring center and full orbital extent', () => {
    const belt = { ...body, kind: 'belt' as const }
    const center = { x: 0, y: 0, z: 0 }
    const beltScene = { ...scene, beltFields: [{ bodyId: body.id, center: body.position, ringCenter: center, memberCount: 20, elements: { parentId: 'star', radius: 100, periodMs: 1000, phase: 0, inclination: 0, node: 0 } }] }
    expect(bodyFocusTarget(beltScene, belt).position).toEqual(center)
    const camera = bodyFocusCamera(defaultCamera(500), beltScene, belt, 500, 1200, 900, DEFAULT_BODY_FOCUS)
    expect(camera.distance).toBeGreaterThan(400)
  })
  it('rotates the orbital frame around an inclined orbit and ignores absent orbits', () => {
    const orbit = { parentId: 'star', radius: 10, periodMs: 1000, phase: 0, inclination: 0.4, node: 0.6 }
    const start = orbitFrame(orbit, 0)!, end = orbitFrame(orbit, 250)!
    const delta = end.clone().multiply(start.clone().invert())
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(delta).length()).toBeCloseTo(1)
    expect(start.angleTo(end)).toBeCloseTo(Math.PI / 2)
    expect(orbitFrame({ ...orbit, radius: 0 }, 0)).toBeUndefined()
  })
})

it('frames a location at a tunable distance without following a body or scaling the marker', () => {
  const point = { ...body, id: 'point-selection', kind: 'point-selection' as const, radius: 0.5 }
  const focus = bodyFocusCamera(defaultCamera(500), scene, point, 500, 1200, 900, { ...DEFAULT_BODY_FOCUS, pointDistance: 30 })
  expect(focus.focusPoint).toEqual(point.position)
  expect(focus.followBodyId).toBeUndefined()
  expect(focus.distance).toBe(30)
  expect(bodyFocusCamera(defaultCamera(500), scene, point, 500, 1200, 900).distance).toBe(40)
})
