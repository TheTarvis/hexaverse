// Draw math for the continuous-space system view (openspec change
// `build-production-space-view`, tasks.md 1.4–1.8).
//
// SCOPE — exactly four kinds of pure function live here (design.md
// Decision 1): a position from a served orbital element set, a position
// from a served park or drift, a served quintic Bézier evaluated at a
// parameter `u`, and the vector helpers those need. Nothing here decides a
// rule-bearing value: `backend/space` is the sole authority for every one
// of those (`space-kinematics`: *Every Rule-Bearing Value of This
// Capability Is Computed Only in the Authoritative Implementation*).
//
// DELIBERATELY ABSENT, and never to be added (tasks.md 1.7 — the six
// functions `frontend/app/spike/space-3d/sim.ts` carried and this module
// does not port):
//
//   arcTable · arcParam · burnProgress · burnSpeed · resolveShip ·
//   stationKeepRate
//
// A burning fleet's mark advances by CURVE PARAMETER (`burnDrawParam`),
// never by arc length: there is no arc-length inversion, no speed profile,
// no flight time, no intercept solve and no settled park in this module.
// Any displayed number — arrival, remaining duration, delta-v, fuel cost,
// distance, affordability, stranding — comes from the server's own read or
// preview, never from a position drawn here (`system-space-view`: *No
// displayed value is derived from a drawn position*).
//
// NAMING — every export is subject-prefixed and draw-scoped. Compared
// CASE-INSENSITIVELY, no name here may equal any top-level function name in
// `backend/space`, exported or not; `fixtures/space/mirror-map.json`'s
// `sharedNames` allowlist stays empty and a collision is always resolved by
// renaming the TypeScript (`cross-stack-determinism`: *A lower-camel twin
// of an authoritative Go export fails the check*). That reserved set
// includes the obvious spellings — `add`, `sub`, `scale`, `point`,
// `position`, `velocity`, `speed`, `length`, `stateAt`, `bernsteinPoint`,
// `floorMod`, `resolvePosition` and their siblings — which is why the
// helpers below read the way they do.
//
// ANGLES — a served phase, inclination and node are SUB-TURNS: integers in
// [0, 2^20), never radians. The advance is the same truncating integer
// arithmetic the server performs (reduce the elapsed time onto [0, period)
// FIRST, then multiply by 2^20 and divide), so the drawn angle index is
// bit-identical to the server's; only the final cosine/sine differ, by
// ~1e-13 against the server's pinned table, which is invisible at any
// drawn scale.

/** A position or displacement in the drawn scene's continuous R³. */
export interface DrawVec3 {
  x: number
  y: number
  z: number
}

/** A body's served orbital element set (interior read wire shape). */
export interface DrawOrbitElements {
  parentId: string
  radius: number
  periodMs: number
  phase: number
  inclination: number
  node: number
}

/** The served park kinds: 0 = orbit, 1 = station-keep, 2 = point. */
export type DrawParkKind = 0 | 1 | 2

/** A fleet's served park (fleet read wire shape, lower-cased at the seam). */
export interface DrawPark {
  kind: DrawParkKind
  bodyId: string
  radius: number
  periodMs: number
  phase: number
  epochMs: number
  offset: DrawVec3
  point: DrawVec3
}

/**
 * A fleet's served free drift, in the server's own units. `epochMs` is a
 * world-millisecond stamp and `velocityPerSecond` is the served velocity PER
 * SECOND — the unit is in the field name so a per-millisecond rate cannot be
 * passed by mistake. `drawDriftPosition` owns the ms→s conversion; no caller
 * pre-scales.
 */
export interface DrawDrift {
  anchor: DrawVec3
  velocityPerSecond: DrawVec3
  epochMs: number
}

/** Sub-turns in one full revolution — the served angle unit's modulus. */
const SUB_TURNS_PER_TURN = 1 << 20

/** Component-wise sum. Neither operand is mutated. */
export function vecAdd(a: DrawVec3, b: DrawVec3): DrawVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

/** Component-wise difference. Neither operand is mutated. */
export function vecSub(a: DrawVec3, b: DrawVec3): DrawVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

/** `v` scaled by `s`. The operand is not mutated. */
export function vecScale(v: DrawVec3, s: number): DrawVec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

/** Reduce `a` onto [0, n) with floor semantics (JS `%` truncates). */
function drawWrapInto(a: number, n: number): number {
  const m = a % n
  return m < 0 ? m + n : m
}

/** Reduce a sub-turn value onto [0, 2^20). */
function drawWrapAngle(v: number): number {
  return drawWrapInto(v, SUB_TURNS_PER_TURN)
}

/** Cosine and sine of a sub-turn index. */
function drawTrigOf(subTurns: number): { c: number; s: number } {
  const radians = (2 * Math.PI * drawWrapAngle(subTurns)) / SUB_TURNS_PER_TURN
  return { c: Math.cos(radians), s: Math.sin(radians) }
}

/**
 * The advanced sub-turn index of a periodic element set at `worldTimeMs`,
 * measured from `epochMs`. A non-positive period is motionless at its
 * stored phase and performs no division.
 */
function drawAngleIndexAt(
  phase: number,
  periodMs: number,
  epochMs: number,
  worldTimeMs: number,
): number {
  if (periodMs <= 0) return drawWrapAngle(phase)
  const elapsed = worldTimeMs - epochMs
  const withinPeriod = drawWrapInto(elapsed, periodMs)
  const advance = Math.floor((withinPeriod * SUB_TURNS_PER_TURN) / periodMs)
  return drawWrapAngle(phase + advance)
}

/**
 * A body's drawn offset from its PARENT at `worldTimeMs` — the local half
 * only. Absolute placement is the caller's recursive sum of this offset
 * over the parent chain, exactly as the server composes it.
 */
export function drawOrbitPosition(
  elements: DrawOrbitElements,
  worldTimeMs: number,
): DrawVec3 {
  const idx = drawAngleIndexAt(elements.phase, elements.periodMs, 0, worldTimeMs)
  const { c, s } = drawTrigOf(idx)
  const planarX = elements.radius * c
  const planarZ = elements.radius * s

  // Tilt about the line of nodes, then swing the tilted plane about Y —
  // the server's own sign convention (`backend/space/orbit.go`).
  const incl = drawTrigOf(elements.inclination)
  const y = -planarZ * incl.s
  const tiltedZ = planarZ * incl.c

  const node = drawTrigOf(elements.node)
  return {
    x: planarX * node.c - tiltedZ * node.s,
    y,
    z: planarX * node.s + tiltedZ * node.c,
  }
}

/**
 * A parked fleet's drawn position at `worldTimeMs`: HOST-RELATIVE for an
 * orbit or station-keep park (the caller adds the host body's own drawn
 * position), ABSOLUTE for a point park. An orbit park is planar — no
 * inclination, no node — and advances from the park's own epoch.
 */
export function drawParkPosition(park: DrawPark, worldTimeMs: number): DrawVec3 {
  switch (park.kind) {
    case 2:
      return { x: park.point.x, y: park.point.y, z: park.point.z }
    case 1:
      return { x: park.offset.x, y: park.offset.y, z: park.offset.z }
    default: {
      const idx = drawAngleIndexAt(park.phase, park.periodMs, park.epochMs, worldTimeMs)
      const { c, s } = drawTrigOf(idx)
      return { x: park.radius * c, y: 0, z: park.radius * s }
    }
  }
}

/**
 * A drifting fleet's absolute drawn position: the stored anchor displaced by
 * the stored per-second velocity over the elapsed time since the stored
 * epoch. Both stamps are world MILLISECONDS and the velocity is per SECOND,
 * so the conversion lives here — the server's own `anchor + velocity ×
 * (t − epoch)/1000`. The elapsed term is signed: a time before the epoch
 * displaces backward.
 */
export function drawDriftPosition(drift: DrawDrift, worldTimeMs: number): DrawVec3 {
  const elapsedSeconds = (worldTimeMs - drift.epochMs) / 1000
  return vecAdd(drift.anchor, vecScale(drift.velocityPerSecond, elapsedSeconds))
}

/**
 * The served transfer curve evaluated at parameter `u` in [0, 1] — a
 * Bézier of whatever degree the served control-point count implies (the
 * server serves six, a quintic), by de Casteljau. Both endpoints are
 * interpolated exactly.
 */
export function bezierPointAt(controlPoints: DrawVec3[], u: number): DrawVec3 {
  if (controlPoints.length === 0) return { x: 0, y: 0, z: 0 }
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u
  if (t === 0) {
    const first = controlPoints[0]
    return { x: first.x, y: first.y, z: first.z }
  }
  if (t === 1) {
    const last = controlPoints[controlPoints.length - 1]
    return { x: last.x, y: last.y, z: last.z }
  }
  let level = controlPoints.map((p) => ({ x: p.x, y: p.y, z: p.z }))
  while (level.length > 1) {
    const next: DrawVec3[] = []
    for (let i = 0; i + 1 < level.length; i++) {
      next.push(vecAdd(level[i], vecScale(vecSub(level[i + 1], level[i]), t)))
    }
    level = next
  }
  return level[0]
}

/**
 * Where along its served curve a burning fleet's mark is drawn:
 * `(now − depart) / (arrive − depart)`, clamped to [0, 1]. Past the served
 * arrival the parameter FREEZES at 1 — the mark sits at the served
 * intercept until a refetch replaces the state; the client never settles a
 * burn itself (`system-space-view`: *A burn past its served arrival
 * freezes at the intercept until a refetch*). A degenerate window yields 1
 * rather than a non-finite value.
 */
export function burnDrawParam(departMs: number, arriveMs: number, nowMs: number): number {
  const span = arriveMs - departMs
  if (!(span > 0)) return 1
  const u = (nowMs - departMs) / span
  if (!(u > 0)) return 0
  return u >= 1 ? 1 : u
}

/**
 * Whether a drawn position is EXACTLY the scene origin. Exact equality is
 * the requirement's own word: a tolerance would omit legitimately
 * near-star bodies (`system-space-view`: *A Non-Star Position at the
 * Origin Is Omitted From the Scene, Not Drawn Atop the Star*).
 */
export function isDrawOrigin(p: DrawVec3): boolean {
  return p.x === 0 && p.y === 0 && p.z === 0
}

// --- screen projection ---------------------------------------------------
//
// The fourth kind of function this module admits (design.md Decision 1):
// world -> screen and back. It takes a plain VIEW BASIS rather than a
// camera, so nothing in `lib/space` depends on a component's camera type;
// `components/space/space-projection.ts` derives the basis from the camera.

/** An eye position and its orthonormal screen basis, plus the viewport. */
export interface DrawViewBasis {
  eye: DrawVec3
  /** Unit vector pointing to the right of the screen. */
  right: DrawVec3
  /** Unit vector pointing up the screen. */
  up: DrawVec3
  /** Unit vector along the view direction (away from the eye). */
  forward: DrawVec3
  widthPx: number
  heightPx: number
  /** tan(fov / 2), vertical. */
  tanHalfFov: number
}

export interface DrawScreenPoint {
  x: number
  y: number
  /** Distance along the view direction; non-positive is behind the eye. */
  depth: number
  onScreen: boolean
}

function drawDot(a: DrawVec3, b: DrawVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/**
 * Project a world position to CSS pixels within the viewport. A position at
 * or behind the eye reports `onScreen: false` with a depth at or below
 * zero — the caller must not draw or place a hit target for it.
 */
export function projectToScreen(p: DrawVec3, basis: DrawViewBasis): DrawScreenPoint {
  const v = vecSub(p, basis.eye)
  const depth = drawDot(v, basis.forward)
  const halfW = basis.widthPx / 2
  const halfH = basis.heightPx / 2
  if (!(depth > 1e-9)) return { x: NaN, y: NaN, depth, onScreen: false }
  const aspect = basis.widthPx / Math.max(1, basis.heightPx)
  const x = halfW + (drawDot(v, basis.right) / (depth * basis.tanHalfFov * aspect)) * halfW
  const y = halfH - (drawDot(v, basis.up) / (depth * basis.tanHalfFov)) * halfH
  return {
    x,
    y,
    depth,
    onScreen: x >= 0 && x <= basis.widthPx && y >= 0 && y <= basis.heightPx,
  }
}

/**
 * The world position under a screen point, on the plane through
 * `planeThrough` perpendicular to the view direction — the view's own pick
 * plane, which is always defined (an ecliptic plane is not: a level camera
 * sends the ray parallel to it).
 */
export function unprojectToViewPlane(
  screenX: number,
  screenY: number,
  basis: DrawViewBasis,
  planeThrough: DrawVec3,
): DrawVec3 {
  const halfW = basis.widthPx / 2
  const halfH = basis.heightPx / 2
  const aspect = basis.widthPx / Math.max(1, basis.heightPx)
  const ndcX = (screenX - halfW) / halfW
  const ndcY = (halfH - screenY) / halfH
  const depth = drawDot(vecSub(planeThrough, basis.eye), basis.forward)
  const centre = vecAdd(basis.eye, vecScale(basis.forward, depth))
  return vecAdd(
    centre,
    vecAdd(
      vecScale(basis.right, ndcX * basis.tanHalfFov * aspect * depth),
      vecScale(basis.up, ndcY * basis.tanHalfFov * depth),
    ),
  )
}
