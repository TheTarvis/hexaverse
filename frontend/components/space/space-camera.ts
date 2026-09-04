// The space view's PURE camera model — no React, no DOM (openspec change
// `build-production-space-view`, `system-space-view`: *Space View Camera
// Orbit, Pan, and Zoom*, *...Touch Pinch-Zoom*, *...Is Keyboard-Operable*,
// *...Manual Recenter*). Every gesture is `(camera, input) -> camera`, so
// the whole camera is testable without a canvas, exactly as
// `components/board/board-camera.ts` was for the board view this replaces.
//
// IT LIVES HERE, NOT IN `lib/space/`. That directory admits only pure draw
// math and its name guard polices it (tasks.md 1.4/1.5); a camera is view
// state, not draw math.
//
// EVERY DISTANCE IS A MULTIPLE OF THE SERVED CONTINUOUS `extent`. The
// default framing, the zoom clamps, the pan bound, the keyboard pan step
// and the maximum pick radius are each ONE configured multiplier applied to
// the interior read's own `extent` — never an absolute scene constant, and
// never the retired board `radius`, whose producer is gone
// (`system-space-view`: *The framing scales with the system's served
// extent*). Their VALUES are design.md OQ-2, open for playtesting; their
// SHAPE is the requirement.

export interface SpaceCamera {
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

export const DEFAULT_DISTANCE_MULT = 1
export const ZOOM_MIN_MULT = 0.08
export const ZOOM_MAX_MULT = 6
export const PAN_BOUND_MULT = 1.5
// The pickable disc is the system's own served extent: a point beyond it is
// not a place this system can be commanded to, so a click out there CLEARS
// the selection rather than naming a target in the void.
export const PICK_RADIUS_MULT = 1

export const PITCH_MIN = -1.45
export const PITCH_MAX = 1.45
// A high, near-overhead default: the ecliptic reads as a plane, the inner
// system fills the frame, and the outer lane gates sit off-screen — which
// is what the off-screen reach affordance exists for.
export const DEFAULT_YAW = 0.6
export const DEFAULT_PITCH = 1.3

/** Radians of orbit per arrow-key press. */
export const KEY_ORBIT_STEP = 0.05
/** Fraction of the system's extent translated per pan-key press. */
export const KEY_PAN_STEP_MULT = 0.05
/** Multiplicative distance change per zoom-key press. */
export const KEY_ZOOM_FACTOR = 0.9

/** Radians of orbit per CSS pixel of primary drag. */
const ORBIT_RADIANS_PER_PX = 0.006
/** Distance change per wheel notch, as an exponential rate. */
const WHEEL_ZOOM_RATE = 0.0015

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

// --- orbit ---------------------------------------------------------------

function orbitBy(camera: SpaceCamera, dYaw: number, dPitch: number): SpaceCamera {
  return {
    ...camera,
    yaw: wrapAngle(camera.yaw + dYaw),
    pitch: clampNumber(camera.pitch + dPitch, PITCH_MIN, PITCH_MAX),
  }
}

export function orbitByPixels(camera: SpaceCamera, dx: number, dy: number): SpaceCamera {
  return orbitBy(camera, dx * ORBIT_RADIANS_PER_PX, dy * ORBIT_RADIANS_PER_PX)
}

export function orbitBySteps(camera: SpaceCamera, stepsX: number, stepsY: number): SpaceCamera {
  return orbitBy(camera, stepsX * KEY_ORBIT_STEP, stepsY * KEY_ORBIT_STEP)
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
  return { ...camera, target: clampTarget(camera.target, next, bound) }
}

export function panByPixels(
  camera: SpaceCamera,
  dx: number,
  dy: number,
  viewportPx: { width: number; height: number },
  extent?: number,
): SpaceCamera {
  // World units per pixel at the pan target's depth. Dragging moves the
  // scene with the pointer, so the target travels the other way.
  const perPixel = camera.distance / Math.max(1, viewportPx.height)
  const bound = panBound(extent ?? camera.distance / DEFAULT_DISTANCE_MULT)
  return panBy(camera, -dx * perPixel, dy * perPixel, bound)
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

// --- zoom ----------------------------------------------------------------

// Zoom DOLLIES along the view direction toward the pan target: the target
// is unchanged in world space and the viewing angle is unchanged, so the
// centred point cannot move on screen — which is what both the wheel and
// the pinch requirements demand, and why neither anchors under the cursor
// or on the pinch midpoint.
function zoomTo(camera: SpaceCamera, distance: number, extent: number): SpaceCamera {
  const { min, max } = zoomRange(extent)
  return { ...camera, distance: clampNumber(distance, min, max) }
}

export function zoomByWheel(camera: SpaceCamera, deltaY: number, extent: number): SpaceCamera {
  return zoomTo(camera, camera.distance * Math.exp(deltaY * WHEEL_ZOOM_RATE), extent)
}

export function zoomBySteps(camera: SpaceCamera, notches: number, extent: number): SpaceCamera {
  return zoomTo(camera, camera.distance * Math.pow(KEY_ZOOM_FACTOR, notches), extent)
}

export function zoomByPinch(
  camera: SpaceCamera,
  previousDistancePx: number,
  nextDistancePx: number,
  extent: number,
): SpaceCamera {
  // A degenerate (zero-separation) pinch has no ratio to apply — it must
  // never produce a NaN or a zero distance.
  if (!(previousDistancePx > 0) || !(nextDistancePx > 0)) return camera
  return zoomTo(camera, camera.distance * (previousDistancePx / nextDistancePx), extent)
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

export function touchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
