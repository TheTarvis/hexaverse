import * as THREE from 'three'
import { drawOrbitPosition, type DrawOrbitElements } from '@/lib/space/draw'
import type { SpaceCamera } from './space-camera'
import { drawRadiusFor, TAN_HALF_FOV } from './space-projection'
import type { SceneMark, SceneModel } from './space-scene'

export interface BodyFocusSettings {
  /** Fraction of the smaller viewport dimension occupied by a body's diameter. */
  framing: number
  /** Empty-space viewing distance in scene units; defaults to 8% of system extent. */
  pointDistance?: number
  durationMs: number
  orientation: 'steady' | 'orbit'
}
export const DEFAULT_BODY_FOCUS: BodyFocusSettings = { framing: 1 / 3, durationMs: 600, orientation: 'steady' }

export function bodyFocusTarget(scene: SceneModel, mark: SceneMark) {
  const belt = scene.beltFields.find(field => field.bodyId === mark.id)
  return belt ? { position: belt.ringCenter, radius: belt.elements.radius + drawRadiusFor(mark, 0) } : { position: mark.position, radius: mark.radius }
}

export function bodyFocusCamera(camera: SpaceCamera, scene: SceneModel, mark: SceneMark, extent: number, width: number, height: number, settings = DEFAULT_BODY_FOCUS): SpaceCamera {
  const isPoint = mark.kind === 'point-selection'
  const framing = Math.max(0.05, Math.min(0.9, settings.framing))
  const target = bodyFocusTarget(scene, mark)
  const radius = mark.kind === 'belt' ? target.radius : drawRadiusFor(mark, extent)
  const halfAngle = Math.atan(TAN_HALF_FOV * Math.min(1, Math.max(1, width) / Math.max(1, height)) * framing)
  return {
    ...camera,
    followFleetId: undefined,
    followBodyId: isPoint ? undefined : mark.id,
    focusPoint: isPoint ? { ...mark.position } : undefined,
    followOrientation: isPoint ? 'steady' : settings.orientation,
    focusRequest: { durationMs: Math.max(0, settings.durationMs),
      from: { yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance, target: { ...camera.target } } },
    minDistance: isPoint ? 0.02 : Math.max(0.02, radius * 1.05),
    distance: isPoint ? Math.max(0.02, settings.pointDistance ?? extent * 0.08) : radius / Math.sin(halfAngle),
    target: { ...target.position },
  }
}

/** Orbital basis: radial, tangent, normal. Uses the same served orbit as drawing. */
export function orbitFrame(elements: DrawOrbitElements, time: number): THREE.Quaternion | undefined {
  if (!(elements.radius > 0) || !(elements.periodMs > 0)) return undefined
  const radial = new THREE.Vector3().copy(drawOrbitPosition(elements, time)).normalize()
  const tangent = new THREE.Vector3().copy(drawOrbitPosition(elements, time + elements.periodMs / 4)).normalize()
  const normal = new THREE.Vector3().crossVectors(radial, tangent).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(radial, tangent, normal))
}
