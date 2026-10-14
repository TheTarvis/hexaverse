// The DRAWN-STATE MODEL the space view hands its renderer (openspec change
// `build-production-space-view`, `system-space-view`: *Own-Fleet Position,
// Burn Curve, and Arrival Ghost Render Continuously*, *Foreign Contacts
// Render at Their Served Position*, *A Non-Star Position at the Origin Is
// Omitted From the Scene, Not Drawn Atop the Star*, *Belt Members Render as
// Decorative Detail, Never as Separate Pickable Bodies*, *Space View
// Respects Reduced-Motion Preference*).
//
// WHY THIS EXISTS AS A PURE FUNCTION. A WebGL bitmap is not a testable
// surface. What IS testable — and where every one of those requirements can
// actually break — is WHICH entities are in the scene, at what positions,
// pickable or not, selected or not, plus what was deliberately omitted and
// why. Computing that here, once per frame, keeps the renderer a dumb
// consumer and every rule assertable.
//
// NOTHING HERE IS RULE-BEARING. Every position is either a served value or
// a `lib/space/draw` evaluation of served elements at a served time. No
// displayed number is ever computed from a position produced here
// (`system-space-view`: *No displayed value is derived from a drawn
// position*).

import {
  bezierPointAt,
  burnDrawParam,
  drawDriftPosition,
  drawOrbitPosition,
  drawParkPosition,
  isDrawOrigin,
  vecAdd,
  type DrawOrbitElements,
  type DrawVec3,
} from '@/lib/space/draw'
import {
  PARK_KIND_ORBIT,
  PARK_KIND_POINT,
  PARK_KIND_STATIONKEEP,
  type Burn,
  type Drift,
  type Park,
  type Vec3,
} from '@/lib/types/fleet'
import type { Sighting } from '@/lib/types/sighting'
import type { SystemSpace } from '@/lib/types/system-space'
import type { SpaceSelection } from './space-selection'

// 'sighting' — a SIGHTING GHOST (add-scan-and-sightings-surface), the mark
// a target-naming pile record draws. NOT THE SAME MARK CLASS as 'ghost'
// below, which is a BURN's arrival preview — a completely different thing
// this file already drew before this change existed
// (link8b-impl-contract.md §1.9: the single most likely silent defect in
// this change's client half). A sighting ghost is highlighted, never
// selected — it is never a member of `selection` and never pickable.
export type SceneMarkKind =
  | 'star'
  | 'body'
  | 'belt'
  | 'gate'
  | 'fleet'
  | 'contact'
  | 'ghost'
  | 'sighting'
  | 'point-selection'

export interface SceneMark {
  /** Optional disclosed display name; current interior reads use identifiers. */
  name?: string
  id: string
  kind: SceneMarkKind
  position: DrawVec3
  radius: number
  pickable: boolean
  selected: boolean
  /** Contacts only — the disclosed emission state. */
  emitting?: boolean
  scanning?: boolean
  /**
   * Contacts, sighting ghosts and DRIFTING own fleets — the SERVED velocity,
   * carried so the facts surface can DISPLAY a heading and speed (and the
   * renderer can draw a heading streak). It is never integrated here:
   * neither a contact nor a sighting drifts between reads, and a drifting
   * fleet's position comes from `drawDriftPosition`, not from this field.
   */
  velocity?: DrawVec3
  /**
   * Own fleets only — the served `space.ShipMode` (0 burn, 1 parked,
   * 2 drift). Decorative and informational: it tints the mark and labels
   * the facts card, and bears on no rule.
   */
  fleetMode?: 0 | 1 | 2
  /** Stable parked camera pivot and local orbital envelope; never gameplay state. */
  followAnchor?: { id: string; position: DrawVec3; radius: number }
  /** Own fleets under a burn only — the burn's served `ArriveMs`, for the facts card's countdown. */
  arriveMs?: number
  /** Sighting ghosts only — the record's `asOf`, for its label. */
  asOf?: number
  /**
   * Bodies, belts, the star and lane gates — the SERVED feature type
   * (`rocky`, `gas_giant`, `ice`, `moon`, `station`, …; `gate` for a lane
   * gate). Decorative only: it picks a palette and a silhouette in the
   * renderer and bears on no rule.
   */
  bodyType?: string
  /** The star only — the interior's served spectral class, for its tint. */
  starClass?: string
  /**
   * Sighting ghosts only — the record's SERVED `id`, carried separately
   * from `mark.id` (which is `sighting-${record.id}`, mirroring
   * `contact-${index}`). The DOM test id and the row<->ghost cross-
   * highlight both address a ghost by THIS field — a single prefix over
   * the record id (link8b-impl-contract.md §1.9: `sighting-mark-${record.id}`)
   * — never by re-deriving it from `mark.id`.
   */
  recordId?: string
}

export interface SceneCurve {
  fleetId: string
  controlPoints: DrawVec3[]
  /**
   * Where along the curve the fleet's mark is drawn right now — the same
   * `burnDrawParam` the mark itself uses, so the renderer can dim the
   * traversed half of the path and brighten what is still ahead.
   */
  param: number
}

export interface SceneBeltField {
  bodyId: string
  center: DrawVec3
  memberCount: number
  /**
   * The belt's served orbital elements and its parent's drawn position:
   * the decorative particle ring is scattered along this orbit, in the
   * parent's frame. Decorative only — no member is ever a mark.
   */
  elements: DrawOrbitElements
  ringCenter: DrawVec3
}

/**
 * A body's orbit, drawn as a faint ring in its parent's frame — depth
 * reference and structure, nothing more. Sampled by the renderer from the
 * SAME served elements the body's position is drawn from, so the ring and
 * the body it carries can never disagree.
 */
export interface SceneOrbitRing {
  bodyId: string
  parentId: string
  bodyType: string
  elements: DrawOrbitElements
  parentPosition: DrawVec3
}

export interface SceneOmission {
  id: string
  reason: 'origin' | 'no-position'
}

export interface SceneModel {
  marks: SceneMark[]
  curves: SceneCurve[]
  beltFields: SceneBeltField[]
  orbitRings: SceneOrbitRing[]
  /** ALWAYS the live world time — positions never freeze. */
  positionTimeMs: number
  /** FROZEN under a reduced-motion preference — decoration only. */
  decorativeTimeMs: number
  omissions: SceneOmission[]
}

/**
 * The scene's view of a fleet: everything it needs to place a mark, and
 * nothing more. Deliberately looser than `Fleet` in one respect — `Mode` is
 * a plain number here — so a caller holding a decoded wire payload (whose
 * `Mode` is whatever the server wrote) can be drawn without being narrowed
 * first. Every `Fleet` is a `SceneFleet`.
 */
export interface SceneFleet {
  id: string
  systemId?: string
  attachedTo?: string
  position?: Vec3
  jump?: unknown
  state?: {
    Mode: number
    Burn?: Burn | null
    Park?: Park | null
    Drift?: Drift | null
  } | null
}

export interface SceneInput {
  interior: SystemSpace | null | undefined
  fleets: SceneFleet[]
  worldTimeMs: number
  reducedMotion: boolean
  selection: SpaceSelection | null
  /** The diagnostic sink the origin rule requires — injected, so it is assertable. */
  log: (message: string, detail?: unknown) => void
  /**
   * The corporation's sighting pile, ALREADY filtered server-side to the
   * open system (add-scan-and-sightings-surface, `sighting-records`: *The
   * Pile Read Filters To One System On Request*). This function performs NO
   * systemId filtering of its own — it draws whatever it is handed, exactly
   * as it does for every other mark class. Defaults to `[]`.
   */
  sightings?: Sighting[]
}

const FLEET_MARK_RADIUS = 0.6
const CONTACT_MARK_RADIUS = 0.6
const POINT_MARK_RADIUS = 0.5

/** Belt members are decorative: a fixed count per belt, seeded by its id. */
const BELT_MEMBERS_MIN = 420
const BELT_MEMBERS_SPREAD = 240

function toDraw(v: Vec3 | undefined | null): DrawVec3 | null {
  if (!v) return null
  if (typeof v.X !== 'number' || typeof v.Y !== 'number' || typeof v.Z !== 'number') return null
  return { x: v.X, y: v.Y, z: v.Z }
}

/**
 * A stable, id-seeded member count so a belt's decorative field does not
 * jitter between frames or between refetches.
 */
function beltMemberCount(bodyId: string): number {
  let hash = 2166136261
  for (let i = 0; i < bodyId.length; i++) {
    hash ^= bodyId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return BELT_MEMBERS_MIN + (Math.abs(hash) % BELT_MEMBERS_SPREAD)
}

interface BodyLike {
  type?: string
  id: string
  size: number
  space: Vec3
  orbitElements?: { parentId: string; radius: number; periodMs: number; phase: number; inclination: number; node: number }
}

/** Follow the outermost disclosed non-star host, never its nested revolutions. */
function parkedFollowAnchor(fleet: SceneFleet, bodies: Map<string, BodyLike>, positionOf: (id: string) => DrawVec3): SceneMark['followAnchor'] {
  const park = fleet.state?.Mode === 1 ? fleet.state.Park : null
  if (!park || park.Kind === PARK_KIND_POINT) return undefined
  let body = bodies.get(park.BodyId)
  if (!body || body.type === 'star') return undefined
  let radius = Math.max(0, park.Radius ?? 0) + Math.hypot(park.Offset?.X ?? 0, park.Offset?.Y ?? 0, park.Offset?.Z ?? 0)
  const visited = new Set<string>()
  while (body.orbitElements) {
    visited.add(body.id)
    const parent = bodies.get(body.orbitElements.parentId)
    if (!parent || parent.type === 'star' || visited.has(parent.id)) break
    radius += Math.max(0, body.orbitElements.radius)
    body = parent
  }
  const position = positionOf(body.id)
  if (isDrawOrigin(position)) return undefined
  return { id: body.id, position, radius: Math.max(body.size, radius + FLEET_MARK_RADIUS) }
}

/**
 * A body's ABSOLUTE drawn position: its parent's drawn position plus its own
 * drawn local offset, composed recursively exactly as the server composes
 * it. A body with no elements (the star) sits at its served position.
 */
function absolutePosition(
  id: string,
  bodies: Map<string, BodyLike>,
  worldTimeMs: number,
  seen: Set<string>,
): DrawVec3 {
  const body = bodies.get(id)
  if (!body) return { x: 0, y: 0, z: 0 }
  if (seen.has(id)) return { x: 0, y: 0, z: 0 }
  seen.add(id)
  if (!body.orbitElements) return toDraw(body.space) ?? { x: 0, y: 0, z: 0 }
  return vecAdd(
    absolutePosition(body.orbitElements.parentId, bodies, worldTimeMs, seen),
    drawOrbitPosition(body.orbitElements, worldTimeMs),
  )
}

function selectionMatches(selection: SpaceSelection | null, bodyId: string): boolean {
  return !!selection && selection.bodyId === bodyId
}

export function buildSceneModel(input: SceneInput): SceneModel {
  const { interior, fleets, worldTimeMs, reducedMotion, selection, log, sightings } = input
  const marks: SceneMark[] = []
  const curves: SceneCurve[] = []
  const beltFields: SceneBeltField[] = []
  const orbitRings: SceneOrbitRing[] = []
  const omissions: SceneOmission[] = []

  const empty: SceneModel = {
    marks: [],
    curves: [],
    beltFields: [],
    orbitRings: [],
    positionTimeMs: worldTimeMs,
    // A frozen decorative clock is a CONSTANT, not a captured instant: two
    // reads at different world times must agree.
    decorativeTimeMs: reducedMotion ? 0 : worldTimeMs,
    omissions: [],
  }
  if (!interior) return empty

  // --- the body table, gates included (a gate IS a body) ------------------
  const bodies = new Map<string, BodyLike>()
  for (const f of interior.features ?? []) bodies.set(f.id, f as BodyLike)
  // A gate's `id` is SERVED and required, never reconstructed from
  // `destSystemId`: it is the string a burn order names.
  const gates = interior.laneGates ?? []
  for (const g of gates) bodies.set(g.id, g as unknown as BodyLike)

  const positionOf = (id: string, atMs: number = worldTimeMs) =>
    absolutePosition(id, bodies, atMs, new Set())

  const omitOrigin = (id: string, what: string) => {
    omissions.push({ id, reason: 'origin' })
    log(
      `${what} ${id} resolved to the scene origin and was omitted rather than drawn atop the star`,
      { id },
    )
  }

  // --- bodies --------------------------------------------------------------
  for (const feature of interior.features ?? []) {
    const kind: SceneMarkKind =
      feature.type === 'star' ? 'star' : feature.type === 'belt' ? 'belt' : 'body'
    const position = positionOf(feature.id)
    if (kind !== 'star' && isDrawOrigin(position)) {
      omitOrigin(feature.id, 'body')
      continue
    }
    marks.push({
      id: feature.id,
      name: feature.name,
      kind,
      position,
      radius: feature.size,
      pickable: kind !== 'star',
      selected: selectionMatches(selection, feature.id),
      bodyType: feature.type,
      ...(kind === 'star' && interior.starClass ? { starClass: interior.starClass } : {}),
    })
    const elements = feature.orbitElements
    if (kind === 'belt' && elements) {
      beltFields.push({
        bodyId: feature.id,
        center: position,
        memberCount: beltMemberCount(feature.id),
        elements,
        ringCenter: positionOf(elements.parentId),
      })
    } else if (elements) {
      orbitRings.push({
        bodyId: feature.id,
        parentId: elements.parentId,
        bodyType: feature.type,
        elements,
        parentPosition: positionOf(elements.parentId),
      })
    }
  }

  // --- lane gates ----------------------------------------------------------
  for (const gate of gates) {
    const position = positionOf(gate.id)
    if (isDrawOrigin(position)) {
      omitOrigin(gate.id, 'lane gate')
      continue
    }
    marks.push({
      id: gate.id,
      kind: 'gate',
      position,
      radius: gate.size,
      pickable: true,
      selected: selectionMatches(selection, gate.id),
      bodyType: 'gate',
    })
    if (gate.orbitElements) {
      orbitRings.push({
        bodyId: gate.id,
        parentId: gate.orbitElements.parentId,
        bodyType: 'gate',
        elements: gate.orbitElements,
        parentPosition: positionOf(gate.orbitElements.parentId),
      })
    }
  }

  // --- own fleets ----------------------------------------------------------
  for (const fleet of fleets ?? []) {
    const resolved = fleetPosition(fleet, positionOf, worldTimeMs)
    if (!resolved) {
      omissions.push({ id: fleet.id, reason: 'no-position' })
      log(`fleet ${fleet.id} reported no position and was omitted from the scene`, { id: fleet.id })
      continue
    }
    if (isDrawOrigin(resolved)) {
      omitOrigin(fleet.id, 'fleet')
      continue
    }
    const mode = fleet.state?.Mode
    const fleetMode: 0 | 1 | 2 | undefined = mode === 0 || mode === 1 || mode === 2 ? mode : undefined
    const burn = mode === 0 ? fleet.state?.Burn : null
    const followAnchor = parkedFollowAnchor(fleet, bodies, positionOf)
    const driftVelocity = mode === 2 ? toDraw(fleet.state?.Drift?.Velocity) : null
    marks.push({
      id: fleet.id,
      kind: 'fleet',
      position: resolved,
      radius: FLEET_MARK_RADIUS,
      // A fleet is NEVER a member of `SpaceSelection` (it is not a burn
      // target), so it stays unpickable here. It does have its own
      // affordance in the stage — clicking its mark makes it the acting
      // fleet and hovering it shows its facts — but that is separate state,
      // never a selection.
      pickable: false,
      selected: false,
      ...(followAnchor ? { followAnchor } : {}),
      ...(fleetMode !== undefined ? { fleetMode } : {}),
      ...(burn ? { arriveMs: burn.ArriveMs } : {}),
      ...(driftVelocity ? { velocity: driftVelocity } : {}),
    })

    if (burn) {
      const controlPoints = curveControlPoints(burn.Curve)
      if (controlPoints.length > 0) {
        curves.push({
          fleetId: fleet.id,
          controlPoints,
          param: burnDrawParam(burn.DepartMs, burn.ArriveMs, worldTimeMs),
        })
      }
      const ghost = ghostPosition(burn, positionOf)
      if (ghost) {
        marks.push({
          id: `ghost-${fleet.id}`,
          kind: 'ghost',
          position: ghost,
          radius: FLEET_MARK_RADIUS,
          pickable: false,
          selected: false,
        })
      }
    }
  }

  // --- foreign contacts ----------------------------------------------------
  ;(interior.contacts ?? []).forEach((contact, index) => {
    // FROZEN at the served position. Integrating it forward from `velocity`
    // would place a foreign ship at a point the server never disclosed.
    const position = toDraw(contact.position)
    if (!position) return
    const id = `contact-${index}`
    if (isDrawOrigin(position)) {
      omitOrigin(id, 'contact')
      return
    }
    marks.push({
      id,
      kind: 'contact',
      position,
      radius: CONTACT_MARK_RADIUS,
      pickable: false,
      selected: false,
      emitting: !!contact.emitting,
      scanning: !!contact.scanning,
      ...(toDraw(contact.velocity) ? { velocity: toDraw(contact.velocity) as DrawVec3 } : {}),
    })
  })

  // --- sighting ghosts -------------------------------------------------
  // add-scan-and-sightings-surface, `system-space-view`: *A Sighting Ghost
  // Renders at Its Frozen Position, Never a Predicted One*. NO systemId
  // filtering here (the caller's job — see `SceneInput.sightings`'s own
  // doc comment); NO velocity integration (the stored velocity is carried
  // on the mark for DISPLAY only); a clean-sweep record draws nothing at
  // all (it names no target and carries no position); an origin position
  // is omitted through the SAME sink every other mark class uses.
  for (const record of sightings ?? []) {
    if (record.cleanSweep) continue
    const position = toDraw(record.position)
    if (!position) continue
    if (isDrawOrigin(position)) {
      omitOrigin(record.id, 'sighting')
      continue
    }
    marks.push({
      id: `sighting-${record.id}`,
      kind: 'sighting',
      position,
      radius: CONTACT_MARK_RADIUS,
      // A sighting ghost is highlighted, never selected: it is never
      // pickable through the space view's exhaustive picking rule, and
      // `selected` stays permanently false — it holds no member of
      // `selection` at all (`system-space-view`: *A Ghost Is Not a Member
      // of the Space View's Selection...*).
      pickable: false,
      selected: false,
      asOf: record.asOf,
      recordId: record.id,
      ...(toDraw(record.velocity) ? { velocity: toDraw(record.velocity) as DrawVec3 } : {}),
    })
  }

  // --- a selected bare point is VISIBLY marked -----------------------------
  // A point in vacuum has no body mark to highlight and no intrinsic
  // outline, so without a mark of its own the selection is invisible and the
  // player commits a burn to a target they cannot see.
  if (selection?.point) {
    const p = selection.point as DrawVec3
    const point: DrawVec3 =
      typeof p.x === 'number'
        ? { x: p.x, y: p.y, z: p.z }
        : (toDraw(selection.point as Vec3) ?? { x: 0, y: 0, z: 0 })
    marks.push({
      id: 'point-selection',
      kind: 'point-selection',
      position: point,
      radius: POINT_MARK_RADIUS,
      pickable: false,
      selected: true,
    })
  }

  return {
    marks,
    curves,
    beltFields,
    orbitRings,
    positionTimeMs: worldTimeMs,
    decorativeTimeMs: reducedMotion ? 0 : worldTimeMs,
    omissions,
  }
}

/**
 * The six served control points, in draw space.
 *
 * THE WIRE SHAPE IS AN OBJECT, NOT AN ARRAY. `space.Curve` is a Go struct
 * with fields `P0, C1, C2, C3, C4, P5` and no json tags, so a fleet read
 * serves it as `{"P0":{"X":..},"C1":..,...,"P5":..}`. (The flat 18-number
 * array is the PERSISTENCE codec's shape — `codec_state.go` — and never
 * reaches the client.) Accepting only an array here was the defect that
 * froze every burning fleet at its served position until arrival: the
 * curve failed to parse, the mark fell back to the frozen read position,
 * and the fleet "teleported" at the arrival refetch. Both shapes are
 * accepted so a fixture written either way still draws.
 */
const CURVE_WIRE_KEYS = ['P0', 'C1', 'C2', 'C3', 'C4', 'P5'] as const

function curveControlPoints(curve: unknown): DrawVec3[] {
  if (!curve || typeof curve !== 'object') return []
  const points: DrawVec3[] = []
  if (Array.isArray(curve)) {
    for (const raw of curve) {
      const p = toDraw(raw as Vec3)
      if (p) points.push(p)
    }
    return points
  }
  const record = curve as Record<string, unknown>
  for (const key of CURVE_WIRE_KEYS) {
    const p = toDraw(record[key] as Vec3)
    if (!p) return []
    points.push(p)
  }
  return points
}

/**
 * The arrival ghost sits at the TARGET's position AT `arriveMs` — not at the
 * target's position now. A moving target drawn where it currently is would
 * tell the player the wrong thing about where they will end up.
 */
function ghostPosition(
  burn: Burn,
  positionOf: (id: string, atMs?: number) => DrawVec3,
): DrawVec3 | null {
  const target = burn.Target
  if (target?.BodyId) return positionOf(target.BodyId, burn.ArriveMs)
  const point = toDraw(target?.Point ?? null)
  if (point) return point
  return toDraw(burn.Intercept)
}

/**
 * A fleet's drawn position, from its OWN served state: a burn evaluated at
 * its curve parameter, a park composed onto its host, or a drift. The served
 * `position` is the fallback for a state the client cannot resolve — never
 * the primary, because it is frozen at the read's world time while the scene
 * advances continuously.
 */
function fleetPosition(
  fleet: SceneFleet,
  positionOf: (id: string, atMs?: number) => DrawVec3,
  worldTimeMs: number,
): DrawVec3 | null {
  const state = fleet.state
  const served = toDraw(fleet.position)

  if (state?.Mode === 0 && state.Burn) {
    const controlPoints = curveControlPoints(state.Burn.Curve)
    if (controlPoints.length > 0) {
      // BY CURVE PARAMETER, never by arc length; past the served arrival it
      // freezes at the intercept until a refetch replaces the state.
      const u = burnDrawParam(state.Burn.DepartMs, state.Burn.ArriveMs, worldTimeMs)
      return bezierPointAt(controlPoints, u)
    }
    return served
  }

  if (state?.Mode === 1 && state.Park) {
    const park = state.Park
    const local = drawParkPosition(
      {
        kind: (park.Kind === PARK_KIND_STATIONKEEP
          ? PARK_KIND_STATIONKEEP
          : park.Kind === PARK_KIND_POINT
            ? PARK_KIND_POINT
            : PARK_KIND_ORBIT) as 0 | 1 | 2,
        bodyId: park.BodyId,
        radius: park.Radius,
        periodMs: park.PeriodMs,
        phase: park.Phase,
        epochMs: park.EpochMs,
        offset: toDraw(park.Offset) ?? { x: 0, y: 0, z: 0 },
        point: toDraw(park.Point) ?? { x: 0, y: 0, z: 0 },
      },
      worldTimeMs,
    )
    // A point park is already absolute; an orbit or station-keep park is
    // relative to its host body, which is itself moving.
    if (park.Kind === PARK_KIND_POINT) return local
    return vecAdd(positionOf(park.BodyId), local)
  }

  if (state?.Mode === 2 && state.Drift) {
    const drift = state.Drift
    const anchor = toDraw(drift.Anchor)
    const velocityPerSecond = toDraw(drift.Velocity)
    if (!anchor || !velocityPerSecond) return served
    // The served velocity is per SECOND and both stamps are world
    // milliseconds; `drawDriftPosition` owns that conversion.
    return drawDriftPosition({ anchor, velocityPerSecond, epochMs: drift.EpochMs }, worldTimeMs)
  }

  return served
}
