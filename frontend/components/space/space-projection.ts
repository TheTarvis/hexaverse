// The camera -> view-basis seam (openspec change
// `build-production-space-view`). `lib/space/draw.ts` owns the projection
// arithmetic and knows nothing about a camera; this module derives the
// basis a `SpaceCamera` implies, so the pure draw math stays free of view
// state and the camera stays free of projection math.

import type { DrawVec3, DrawViewBasis } from '@/lib/space/draw'
import type { SpaceCamera } from './space-camera'

/** The vertical field of view, as tan(fov / 2). */
export const TAN_HALF_FOV = Math.tan((70 * Math.PI) / 360)

export function viewBasisOf(
  camera: SpaceCamera,
  viewport: { width: number; height: number },
): DrawViewBasis {
  const cosP = Math.cos(camera.pitch)
  const sinP = Math.sin(camera.pitch)
  const sinY = Math.sin(camera.yaw)
  const cosY = Math.cos(camera.yaw)

  // The eye sits on the orbit sphere around the pan target; the view
  // direction is the way back down to it.
  const away: DrawVec3 = { x: cosP * sinY, y: sinP, z: cosP * cosY }
  const eye: DrawVec3 = {
    x: camera.target.x + away.x * camera.distance,
    y: camera.target.y + away.y * camera.distance,
    z: camera.target.z + away.z * camera.distance,
  }
  return {
    eye,
    forward: { x: -away.x, y: -away.y, z: -away.z },
    right: { x: cosY, y: 0, z: -sinY },
    up: { x: -sinP * sinY, y: cosP, z: -sinP * cosY },
    widthPx: viewport.width,
    heightPx: viewport.height,
    tanHalfFov: TAN_HALF_FOV,
  }
}
