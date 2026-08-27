// SPIKE — pure signature/shadow math for /spike/stealth.
//
// The detection-asymmetry half of the fog design (docs/plans/continous_space/
// README.md, "Fog, stealth & intel"): BURNS ARE LOUD, PARKED IS QUIET. Every
// fleet has a signature radius set by what its drive is doing — a flip-and-
// burn plume is a beacon detectable far beyond any passive bubble, a
// station-keep trim plume is a small steady tell, rails/point are near-dark.
// The three ranges are the tuning dials of the whole stealth game, so they
// are parameters here, never baked-in constants. The shadow half: planets
// (and the star) occlude — shadow wedges from an observer, and orbit arcs
// painted visible-vs-eclipsed, the hiding economy made visual.
//
// Everything is 2D — the top-down ecliptic projection (x, z; y dropped).
// Pure math only: no React/DOM, no Date.now/Math.random, fixed sample counts.
// Reuses ../space-3d/sim and ../intel/intel read-only.

import {
  bodyPosition,
  burnSpeed,
  insertionRadius,
  resolveShip,
  shipPosition,
  stationKeepRate,
} from '../space-3d/sim'
import type { ShipState, SystemDef, Vec3 } from '../space-3d/sim'
import { fmtTime, patrolState } from '../intel/intel'
import type { Patrol } from '../intel/intel'

// --- 2D projection -----------------------------------------------------------

export interface P2 {
  x: number
  z: number
}

export const project = (v: Vec3): P2 => ({ x: v.x, z: v.z })
export const d2 = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z)

// The view's world half-extent: just past the outermost planet orbit.
export function systemExtent(system: SystemDef): number {
  let max = 40
  for (const body of system.bodies) {
    if (body.kind === 'planet' && body.orbit) max = Math.max(max, body.orbit.radius)
  }
  return max * 1.12
}

// --- signatures --------------------------------------------------------------

// The tuning dials — the ambush-vs-telegraph balance lives entirely here.
export interface Dials {
  plumeRange: number // how far a full burn plume is detectable
  trimRange: number // how far a station-keep trim plume is detectable
  bubbleRadius: number // the observer's passive detection bubble
}

export const DEFAULT_DIALS: Dials = { plumeRange: 120, trimRange: 12, bubbleRadius: 30 }

// Rails/point: engines off. Near-zero, not zero — nothing is perfectly dark.
export const DARK_SIGNATURE = 2

// How far this ship's drive can be seen right now. Burns scale with current
// speed (the plume peaks at the flip), with a floor so lighting the drive is
// ALWAYS an event; a trim plume is steady; a dark ship is DARK_SIGNATURE.
export function signatureRadius(system: SystemDef, state: ShipState, t: number, dials: Dials): number {
  const resolved = resolveShip(system, state, t)
  if (resolved.mode === 'burn') {
    const burn = resolved.burn
    const peak = (burn.accel * (burn.arrive - burn.depart)) / 2
    const ratio = peak > 1e-9 ? burnSpeed(burn, t) / peak : 1
    return dials.plumeRange * (0.3 + 0.7 * ratio)
  }
  if (resolved.at.kind === 'stationkeep') return dials.trimRange
  return DARK_SIGNATURE
}

export type ContactMode = 'burn' | 'orbit' | 'stationkeep' | 'point'

export interface Contact {
  detected: boolean
  viaBubble: boolean // close-range detection, regardless of loudness
  signature: number
  range: number
  mode: ContactMode
  pos: P2
}

// The detection rule: you see a fleet when it is inside your bubble OR you
// are inside its signature — max(bubble, signature). Loud ships are visible
// far beyond any passive sensor.
export function contact(system: SystemDef, patrol: Patrol, observer: P2, t: number, dials: Dials): Contact {
  const state = patrolState(patrol, t)
  const resolved = resolveShip(system, state, t)
  const pos = project(shipPosition(system, state, t))
  const range = d2(observer, pos)
  const signature = signatureRadius(system, state, t, dials)
  return {
    detected: range <= Math.max(dials.bubbleRadius, signature),
    viaBubble: range <= dials.bubbleRadius,
    signature,
    range,
    mode: resolved.mode === 'burn' ? 'burn' : resolved.at.kind,
    pos,
  }
}

// --- the event log fold ------------------------------------------------------

export interface StealthEvent {
  at: number
  text: string
}

export interface WatchState {
  detected: boolean
}

export const emptyWatch = (): WatchState => ({ detected: false })

// Same rationale as the intel spike's sweep: a whole burn can start and
// finish between two ticks, and lighting a drive MUST be logged. Fixed
// samples across the interval; the real backend owes a closed-form answer.
const SWEEP_SAMPLES = 24

const detectionLabel = (c: Contact): string => {
  if (c.viaBubble) return 'contact entered passive bubble'
  if (c.mode === 'burn') return 'contact burning — bearing acquired'
  if (c.mode === 'stationkeep') return 'contact trim plume detected'
  return 'contact detected at close range'
}

export function stepWatch(
  system: SystemDef,
  patrol: Patrol,
  observer: P2,
  dials: Dials,
  watch: WatchState,
  t: number,
  prevT: number = t
): { watch: WatchState; events: StealthEvent[] } {
  const events: StealthEvent[] = []
  let detected = watch.detected
  const span = Math.max(t - prevT, 0)
  const times =
    span > 0 ? Array.from({ length: SWEEP_SAMPLES + 1 }, (_, i) => prevT + (span * i) / SWEEP_SAMPLES) : [t]
  for (const ts of times) {
    const c = contact(system, patrol, observer, ts, dials)
    if (c.detected && !detected) {
      detected = true
      events.push({ at: ts, text: `${fmtTime(ts)} — ${detectionLabel(c)}` })
    } else if (!c.detected && detected) {
      detected = false
      events.push({ at: ts, text: `${fmtTime(ts)} — contact went dark` })
    }
  }
  return { watch: { detected }, events }
}

// --- occlusion ---------------------------------------------------------------

export interface Disc {
  id: string
  center: P2
  r: number
}

// What casts shadows: the star and the planets (moons/stations are too small
// to matter at this scale).
export function occluders(system: SystemDef, t: number): Disc[] {
  const out: Disc[] = []
  for (const body of system.bodies) {
    if (body.kind !== 'star' && body.kind !== 'planet') continue
    out.push({ id: body.id, center: project(bodyPosition(system, body.id, t)), r: body.size })
  }
  return out
}

// Is `point` hidden from `observer` behind any disc? Segment-vs-circle with
// the crossing required strictly between the endpoints, so a parking-orbit
// sample grazing its own host's rim doesn't self-occlude.
export function isOccluded(observer: P2, point: P2, discs: Disc[]): boolean {
  for (const disc of discs) {
    if (d2(point, disc.center) < disc.r) return true // inside the body
    if (d2(observer, disc.center) < disc.r) return true // observer blind inside a body
    const dx = point.x - observer.x
    const dz = point.z - observer.z
    const len2 = dx * dx + dz * dz
    if (len2 < 1e-12) continue
    const u = ((disc.center.x - observer.x) * dx + (disc.center.z - observer.z) * dz) / len2
    if (u <= 1e-6 || u >= 1 - 1e-6) continue
    const cx = observer.x + u * dx
    const cz = observer.z + u * dz
    if (Math.hypot(disc.center.x - cx, disc.center.z - cz) < disc.r) return true
  }
  return false
}

// --- shadow wedges -----------------------------------------------------------

// The occluded region behind one disc, as a drawable quad: the two tangent
// points, extended along the tangent directions out to `extent` (past the
// view edge). Null when the observer is inside the disc.
export interface Wedge {
  id: string
  points: P2[] // [nearA, farA, farB, nearB]
}

export function shadowWedges(observer: P2, discs: Disc[], extent: number): Wedge[] {
  const wedges: Wedge[] = []
  for (const disc of discs) {
    const d = d2(observer, disc.center)
    if (d <= disc.r + 1e-6) continue
    const theta = Math.atan2(disc.center.z - observer.z, disc.center.x - observer.x)
    const alpha = Math.asin(Math.min(disc.r / d, 1))
    const tangentLen = Math.sqrt(Math.max(d * d - disc.r * disc.r, 0))
    const at = (angle: number, len: number): P2 => ({
      x: observer.x + len * Math.cos(angle),
      z: observer.z + len * Math.sin(angle),
    })
    wedges.push({
      id: disc.id,
      points: [at(theta - alpha, tangentLen), at(theta - alpha, extent), at(theta + alpha, extent), at(theta + alpha, tangentLen)],
    })
  }
  return wedges
}

// --- orbit-arc eclipse painting ----------------------------------------------

export interface ArcRun {
  eclipsed: boolean
  points: P2[]
}

export interface OrbitVisibility {
  runs: ArcRun[]
  eclipsedFraction: number
}

const ARC_SAMPLES = 96

// The parking orbit around `bodyId`, sampled at fixed count and classified
// visible-vs-eclipsed from the observer — "you're hidden for this 40% of
// your orbit". The host body itself occludes (that IS the eclipse).
export function parkingOrbitVisibility(
  system: SystemDef,
  bodyId: string,
  observer: P2,
  t: number
): OrbitVisibility {
  const body = system.bodies.find((b) => b.id === bodyId)
  if (!body) return { runs: [], eclipsedFraction: 0 }
  const center = project(bodyPosition(system, bodyId, t))
  const radius = insertionRadius(body)
  const discs = occluders(system, t)

  const runs: ArcRun[] = []
  let eclipsedCount = 0
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const angle = (i / ARC_SAMPLES) * Math.PI * 2
    const point: P2 = { x: center.x + radius * Math.cos(angle), z: center.z + radius * Math.sin(angle) }
    const eclipsed = isOccluded(observer, point, discs)
    if (eclipsed) eclipsedCount++
    const run = runs[runs.length - 1]
    if (run && run.eclipsed === eclipsed) run.points.push(point)
    else runs.push({ eclipsed, points: [point] })
  }
  return { runs, eclipsedFraction: eclipsedCount / ARC_SAMPLES }
}

// --- the station-keep marker -------------------------------------------------

export interface MarkerInfo {
  inShadow: boolean
  bodyId: string
  bodyName: string
  drain: number // Δv/s to hold this spot in the nearest body's frame
}

// A held spot: whose frame you'd station-keep in (nearest body), what it
// costs per second, and whether the observer can even see you there.
export function markerInfo(system: SystemDef, marker: P2, observer: P2, t: number): MarkerInfo {
  let nearest = system.bodies[0]
  let best = Infinity
  for (const body of system.bodies) {
    const d = d2(marker, project(bodyPosition(system, body.id, t)))
    if (d < best) {
      best = d
      nearest = body
    }
  }
  return {
    inShadow: isOccluded(observer, marker, occluders(system, t)),
    bodyId: nearest.id,
    bodyName: nearest.name,
    drain: stationKeepRate(system, nearest.id),
  }
}
