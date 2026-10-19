import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bodyFocusCamera, bodyFocusTarget, DEFAULT_BODY_FOCUS, orbitFrame } from './body-camera-focus'
import { defaultCamera } from './space-camera'
import { drawRadiusFor, TAN_HALF_FOV } from './space-projection'
import { buildSceneModel } from './space-scene'
import type { SceneMark } from './space-scene'

const scene = buildSceneModel({ interior: null, fleets: [], worldTimeMs: 0, reducedMotion: false, selection: null, log: () => {} })
const body: SceneMark = { id: 'planet', kind: 'body', radius: 2, position: { x: 50, y: 0, z: 0 }, pickable: true, selected: false }

describe('body camera framing', () => {
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
