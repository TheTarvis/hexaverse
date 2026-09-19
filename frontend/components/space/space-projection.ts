// The camera -> view-basis seam (openspec change
// `build-production-space-view`). `lib/space/draw.ts` owns the projection
// arithmetic and knows nothing about a camera; this module derives the
// basis a `SpaceCamera` implies, so the pure draw math stays free of view
// state and the camera stays free of projection math.

import { projectToScreen, type DrawScreenPoint, type DrawVec3, type DrawViewBasis } from '@/lib/space/draw'
import type { SpaceCamera } from './space-camera'
import type { SceneMark, SceneModel } from './space-scene'

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

// --- the transform loop's projection surface (openspec change
// `fix-world-time-render-loop`, task 4.1) — extracted from `SpaceLayers`'
// render so the transform loop can call the SAME projection React's coarse
// render used to.

/** One scene mark, projected to screen space. */
export interface ProjectedMark {
  mark: SceneMark
  screen: DrawScreenPoint
}

/**
 * Pure. One entry per scene mark, in scene order:
 * `{ mark, screen: projectToScreen(mark.position, basis) }`.
 */
export function projectMarks(scene: Pick<SceneModel, 'marks'>, basis: DrawViewBasis): ProjectedMark[] {
  return scene.marks.map((mark) => ({ mark, screen: projectToScreen(mark.position, basis) }))
}

/** The off-screen sentinel a hit target's `translate3d` parks at — replaces
 * today's `left: -9999px` sentinel. */
export const OFFSCREEN_PX = -9999

/**
 * A hit target's ENTIRE placement, centring included. Off-screen, behind
 * the eye, non-finite, or undefined (a mark absent from the published
 * frame) all park at the same sentinel.
 */
export function hitTargetTransform(
  screen: Pick<DrawScreenPoint, 'x' | 'y' | 'onScreen'> | undefined,
): string {
  const onScreen =
    !!screen && screen.onScreen && Number.isFinite(screen.x) && Number.isFinite(screen.y)
  const x = onScreen ? screen!.x : OFFSCREEN_PX
  const y = onScreen ? screen!.y : OFFSCREEN_PX
  return `translate3d(${x}px, ${y}px, 0px) translate(-50%, -50%)`
}
