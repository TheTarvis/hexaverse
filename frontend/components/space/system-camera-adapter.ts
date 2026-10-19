import * as THREE from 'three'
import { MapCameraRig, type CameraIntent } from '@/components/map/map-camera-rig'
import { PITCH_MAX, PITCH_MIN, panBound, zoomRange, type SpaceCamera } from './space-camera'
import { TAN_HALF_FOV, viewBasisOf } from './space-projection'

/** Coordinate/limit adapter only: gestures, damping and keyboard live in MapCameraRig. */
export function createSystemCameraAdapter(host: HTMLElement, extent: number, initial: SpaceCamera, callbacks: {
  onChange: (camera: SpaceCamera) => void
  onRest?: (camera: SpaceCamera) => void
  onHome: () => void
  onConfirm: () => void
}) {
  const camera = new THREE.PerspectiveCamera(Math.atan(TAN_HALF_FOV) * 360 / Math.PI, 1, 0.01, Math.max(10000, extent * 100))
  const range = zoomRange(extent)
  let current = initial, lastRequested = initial, stepping = false
  let focusRequest: SpaceCamera['focusRequest']
  let liveBody = initial
  const bodyPose = () => liveBody.followBodyId || liveBody.focusPoint ? { position: liveBody.focusPoint ?? liveBody.target,
    rotation: liveBody.followRotation ? new THREE.Quaternion().copy(liveBody.followRotation) : undefined } : null
  const stable = (value: number, previous: number) => Math.abs(value - previous) <= Math.max(1, Math.abs(previous)) * 1e-12 ? previous : value
  const read = (): SpaceCamera => {
    const offset = camera.position.clone().sub(rig.controls.target)
    const distance = offset.length()
    return { ...current, target: { x: stable(rig.controls.target.x, current.target.x), y: stable(rig.controls.target.y, current.target.y), z: stable(rig.controls.target.z, current.target.z) }, distance: stable(distance, current.distance),
      yaw: stable(Math.atan2(offset.x, offset.z), current.yaw), pitch: stable(Math.asin(THREE.MathUtils.clamp(offset.y / Math.max(distance, 1e-9), -1, 1)), current.pitch) }
  }
  const changed = () => {
    if (stepping) return
    current = read()
    lastRequested = current
    callbacks.onChange(current)
  }
  const intent = (kind: CameraIntent) => {
    if (kind === 'pan') current = { ...current, followFleetId: undefined, followBodyId: undefined, focusPoint: undefined }
  }
  const rig = new MapCameraRig(camera, host, host, null, false, {
    up: new THREE.Vector3(0, 1, 0), minDistance: range.min, maxDistance: range.max,
    minPolarAngle: Math.PI / 2 - PITCH_MAX, maxPolarAngle: Math.PI / 2 - PITCH_MIN,
    maxTargetRadius: panBound(extent), keyPanDistance: extent * 0.05,
    onIntent: intent, onChange: changed, onRest: () => callbacks.onRest?.(read()), onHome: callbacks.onHome, onConfirm: callbacks.onConfirm,
  })
  const sync = (requested: SpaceCamera) => {
    current = requested
    const basis = viewBasisOf(requested, { width: host.clientWidth || 1, height: host.clientHeight || 1 })
    camera.position.set(basis.eye.x, basis.eye.y, basis.eye.z)
    rig.controls.target.set(requested.target.x, requested.target.y, requested.target.z)
    camera.lookAt(rig.controls.target)
    camera.updateMatrixWorld()
  }
  sync(initial.focusRequest?.from ? { ...initial, ...initial.focusRequest.from } : initial)
  return {
    rig,
    /** Runs after live fleet-follow resolution and before projection/picking publication. */
    step(resolved: SpaceCamera, advance = true, requested = resolved) {
      stepping = true
      try {
        liveBody = resolved
        rig.controls.minDistance = resolved.minDistance ?? range.min
        rig.controls.maxTargetRadius = Math.max(panBound(extent), Math.hypot(resolved.target.x, resolved.target.y, resolved.target.z))
        if (requested.followBodyId || requested.focusPoint) {
          current = resolved
          if (requested.focusRequest !== focusRequest) {
            focusRequest = requested.focusRequest
            if (requested.focusRequest?.from) sync({ ...resolved, ...requested.focusRequest.from })
            rig.follow(bodyPose, requested.distance, requested.focusRequest?.durationMs ?? 600)
          }
          lastRequested = requested
        } else if (requested !== lastRequested) { rig.stopFollowing(); rig.clearMotion(); sync(resolved); lastRequested = requested }
        else if (requested.followFleetId) {
          const offset = camera.position.clone().sub(rig.controls.target)
          if (offset.length() < resolved.distance) offset.setLength(resolved.distance)
          rig.controls.target.set(resolved.target.x, resolved.target.y, resolved.target.z)
          camera.position.copy(rig.controls.target).add(offset)
        }
        if (advance) rig.update()
        current = read()
        return current
      } finally { stepping = false }
    },
    dispose: () => rig.dispose(),
  }
}
