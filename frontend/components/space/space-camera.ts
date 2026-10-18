// System framing, legal bounds and selection threshold. All camera input lives
// in the shared map-camera-rig; this module contains no gesture implementation.

export interface SpaceCamera {
  /** Live fleet pivot, resolved by the transform loop. */
  followFleetId?: string

  /** Rotation about the world Y axis, radians. */
  yaw: number
  /** Elevation above the ecliptic, radians, clamped. */
  pitch: number
  /** Eye distance from the pan target, scene units. */
  distance: number
  /** The point the camera looks at — the pan target. */
  target: { x: number; y: number; z: number }
}

/** Pointer travel, in CSS pixels, at which a press becomes a gesture. */
export const DRAG_THRESHOLD_PX = 8

// --- the configured multipliers (OQ-2: values open) ---------------------

// Under half the extent: the inner system fills the frame and the outer
// lane gates — at roughly the extent itself — start off-screen.
export const DEFAULT_DISTANCE_MULT = 0.45
export const ZOOM_MIN_MULT = 0.08
export const ZOOM_MAX_MULT = 6
export const PAN_BOUND_MULT = 1.5
// The pickable disc is the system's own served extent: a point beyond it is
// not a place this system can be commanded to, so a click out there CLEARS
// the selection rather than naming a target in the void.
export const PICK_RADIUS_MULT = 1

export const PITCH_MIN = -1.45
export const PITCH_MAX = 1.45
// A raised three-quarter default: the ecliptic reads as a plane in
// perspective, the inner system fills the frame, and the outer lane gates
// sit off-screen — which is what the off-screen reach affordance exists for.
export const DEFAULT_YAW = 0.6
export const DEFAULT_PITCH = 0.72

/** Extent-scaled step used only to predict directional limit announcements. */
export const KEY_PAN_STEP_MULT = 0.05

const TWO_PI = Math.PI * 2

function wrapAngle(a: number): number {
  const wrapped = a % TWO_PI
  if (wrapped > Math.PI) return wrapped - TWO_PI
  if (wrapped <= -Math.PI) return wrapped + TWO_PI
  return wrapped
}

function clampNumber(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function radius(t: { x: number; y: number; z: number }): number {
  return Math.hypot(t.x, t.y, t.z)
}

// --- framing derived from the served extent -----------------------------

export function defaultCamera(extent: number): SpaceCamera {
  return {
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    distance: extent * DEFAULT_DISTANCE_MULT,
    target: { x: 0, y: 0, z: 0 },
  }
}

/** Start behind the fleet, looking inward toward the star, slightly above its plane. */
export function fleetCamera(extent: number, fleetId: string, position: SpaceCamera['target']): SpaceCamera {
  const horizontal = Math.hypot(position.x, position.z)
  return {
    ...clampCamera({
      ...defaultCamera(extent),
      yaw: horizontal > 0 ? Math.atan2(position.x, position.z) : DEFAULT_YAW,
      pitch: Math.atan2(position.y, horizontal) + 0.2,
      distance: extent * 0.3,
      target: { ...position },
    }, extent),
    followFleetId: fleetId,
  }
}

export function zoomRange(extent: number): { min: number; max: number } {
  return { min: extent * ZOOM_MIN_MULT, max: extent * ZOOM_MAX_MULT }
}

export function panBound(extent: number): number {
  return extent * PAN_BOUND_MULT
}

export function pickRadius(extent: number): number {
  return extent * PICK_RADIUS_MULT
}

export function isDefaultCamera(camera: SpaceCamera, extent: number): boolean {
  const d = defaultCamera(extent)
  return (
    Math.abs(camera.yaw - d.yaw) < 1e-9 &&
    Math.abs(camera.pitch - d.pitch) < 1e-9 &&
    Math.abs(camera.distance - d.distance) < 1e-9 &&
    radius(camera.target) < 1e-9
  )
}

// --- the camera's screen basis ------------------------------------------

function rightVector(camera: SpaceCamera) {
  return { x: Math.cos(camera.yaw), y: 0, z: -Math.sin(camera.yaw) }
}

function screenUpVector(camera: SpaceCamera) {
  return {
    x: -Math.sin(camera.pitch) * Math.sin(camera.yaw),
    y: Math.cos(camera.pitch),
    z: -Math.sin(camera.pitch) * Math.cos(camera.yaw),
  }
}

// A pan is REFUSED, rather than slid a hair sideways, once it would leave
// the bound and the target is already on it: the clamp reports the same
// point rather than a last-ULP-different one, so a player holding a pan key
// at the limit sees a genuinely stationary camera instead of a shimmering
// one (`system-space-view`: *Pan clamps at the configured bound*).
function clampTarget(
  previous: { x: number; y: number; z: number },
  next: { x: number; y: number; z: number },
  bound: number,
): { x: number; y: number; z: number } {
  const r = radius(next)
  if (r <= bound) return next
  const scale = bound / r
  const slid = { x: next.x * scale, y: next.y * scale, z: next.z * scale }
  const moved = Math.hypot(slid.x - previous.x, slid.y - previous.y, slid.z - previous.z)
  if (radius(previous) >= bound * (1 - 1e-12) && moved <= bound * 1e-9) return previous
  return slid
}

/** Which pitch clamp the camera is resting on, or null. */
export function atOrbitLimit(camera: SpaceCamera): 'min' | 'max' | null {
  if (camera.pitch <= PITCH_MIN + 1e-12) return 'min'
  if (camera.pitch >= PITCH_MAX - 1e-12) return 'max'
  return null
}

// --- pan -----------------------------------------------------------------

function panBy(camera: SpaceCamera, alongRight: number, alongUp: number, bound: number): SpaceCamera {
  const right = rightVector(camera)
  const up = screenUpVector(camera)
  const next = {
    x: camera.target.x + right.x * alongRight + up.x * alongUp,
    y: camera.target.y + right.y * alongRight + up.y * alongUp,
    z: camera.target.z + right.z * alongRight + up.z * alongUp,
  }
  return { ...camera, followFleetId: undefined, target: clampTarget(camera.target, next, bound) }
}

export function panBySteps(
  camera: SpaceCamera,
  stepsRight: number,
  stepsUp: number,
  extent: number,
): SpaceCamera {
  const step = extent * KEY_PAN_STEP_MULT
  return panBy(camera, stepsRight * step, stepsUp * step, panBound(extent))
}

export function atPanLimit(camera: SpaceCamera, extent: number): boolean {
  return radius(camera.target) >= panBound(extent) * (1 - 1e-9)
}

/** Which zoom clamp the camera is resting on, or null. */
export function atZoomLimit(camera: SpaceCamera, extent: number): 'min' | 'max' | null {
  const { min, max } = zoomRange(extent)
  if (camera.distance <= min * (1 + 1e-12)) return 'min'
  if (camera.distance >= max * (1 - 1e-12)) return 'max'
  return null
}

// --- total clamp ---------------------------------------------------------

export function clampCamera(camera: SpaceCamera, extent: number): SpaceCamera {
  const { min, max } = zoomRange(extent)
  const bound = panBound(extent)
  return {
    ...camera,
    yaw: wrapAngle(camera.yaw),
    pitch: clampNumber(camera.pitch, PITCH_MIN, PITCH_MAX),
    distance: clampNumber(camera.distance, min, max),
    target: clampTarget(camera.target, camera.target, bound),
  }
}

// --- the click/gesture threshold ----------------------------------------

export interface DragTracker {
  startX: number
  startY: number
  lastX: number
  lastY: number
  /** The GREATEST travel from the press point seen so far — sticky. */
  maxTravelPx: number
}

export function beginDrag(x: number, y: number): DragTracker {
  return { startX: x, startY: y, lastX: x, lastY: y, maxTravelPx: 0 }
}

/** Advance the tracker, returning the INCREMENTAL delta since the last move. */
export function advanceDrag(tracker: DragTracker, x: number, y: number): { dx: number; dy: number } {
  const dx = x - tracker.lastX
  const dy = y - tracker.lastY
  tracker.lastX = x
  tracker.lastY = y
  const travel = Math.hypot(x - tracker.startX, y - tracker.startY)
  if (travel > tracker.maxTravelPx) tracker.maxTravelPx = travel
  return { dx, dy }
}

/**
 * Whether the pointer has travelled far enough for the press to be a
 * gesture rather than a click. Measured on TOTAL displacement (a 6px/6px
 * diagonal is 8.49px and so a gesture), and STICKY on the greatest travel
 * seen — a drag that wanders out and returns is still a drag, and treating
 * it as a click would change the selection under a player who was orbiting.
 * The threshold is inclusive: movement of exactly 8 CSS pixels is a gesture.
 */
export function isGesture(tracker: DragTracker): boolean {
  return tracker.maxTravelPx >= DRAG_THRESHOLD_PX
}
