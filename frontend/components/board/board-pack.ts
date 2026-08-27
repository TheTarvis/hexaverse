// board-pack — the pure pack functions that turn fogged domain reads into the
// canvas contract (port-board-to-webgl-renderer, "the plumbing/decision rule").
// EVERY decision the WebGL board renders — band → treatment, type → colour/
// radius, own/foreign fork, formation, star tint — is made here, outside
// webgl/, where it is vitest-assertable with no rendering context. The GL
// modules consume the named records these functions return and re-derive
// nothing.

import {
  cellToPoint,
  cellWedge,
  RADIAL_UNIT,
  ringCells,
  schedule as boardSchedule,
} from '@/lib/board'
import type { BoardFeature, FogBand, SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import {
  bandForRing,
  BAND_STYLE,
  FEATURE_STYLE,
  FOG_TREATMENT,
  HULL,
  ORBIT_RING,
  ORBIT_RING_HILITE,
  SIGNAL,
  starTint,
  THRUSTER,
  VOID,
  type BandBounds,
} from './board-palette'
import { boardToWorld } from './use-board-projection'
import type {
  BoardTheme,
  PackedBody,
  PackedFleetInstance,
  PackedLatticeTile,
  PackedRing,
  PackedScene,
  Rgb,
} from './webgl/contract'

// How big each body family draws, in board units (RADIAL_UNIT = 34): a rocky
// planet sits comfortably inside its cell, a gas giant overflows it slightly —
// bodies are objects in space, not tile contents. Typed Record<FeatureType, …>
// so a new feature type is a compile error here, never an `undefined` render.
export const DRAW_RADIUS: Record<BoardFeature['type'], number> = {
  star: 52,
  gas_giant: 20,
  rocky: 11,
  ice: 10,
  belt: 3.5,
  moon: 6,
  anomaly: 12,
  ruin: 9,
  nebula: 14,
  gravity_well: 12,
  debris: 3.5,
  radiation: 12,
  station: 8,
}

// srgbToLinear — one sRGB channel (0..1) → linear light. The GL pipeline works
// in linear space and converts back to sRGB on output, so every colour that
// crosses the canvas contract MUST be linearised here. Feeding raw sRGB
// fractions through three's numeric Color path (which assumes linear) washes
// the whole scene out — the gamma gets applied twice on the way back.
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// hex colour string (#rrggbb) → LINEAR [r,g,b] floats, ready for shader
// uniforms/attributes. rgba() strings are not accepted here on purpose — pack
// functions resolve from the palette's hex constants only.
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ]
}

// A stable per-body surface-noise seed from the feature id — deterministic
// across sessions (the band-treatment determinism scenario: same feature, same
// band, identical render, every session).
export function seedFromId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10_000) / 100
}

// fogQuadFor — the band → shader-treatment decision, with the spec'd fallback:
// a band that is absent or unrecognised receives the most restrictive
// (`astronomical`) treatment rather than throwing.
export function fogQuadFor(band: string | undefined): PackedBody['fog'] {
  const t =
    band === 'visible' || band === 'remembered' || band === 'astronomical'
      ? FOG_TREATMENT[band as FogBand]
      : FOG_TREATMENT.astronomical
  return { dim: t.dim, chroma: t.chroma, breakUp: t.breakUp, wireOnly: t.wireOnly ? 1 : 0 }
}

// packBodyInstance — one fogged feature → its resolved body instance. The
// renderer consumes this without re-deriving any part of the mapping.
export function packBodyInstance(f: BoardFeature): PackedBody {
  return {
    id: f.id,
    color: hexToRgb(FEATURE_STYLE[f.type].color),
    radius: DRAW_RADIUS[f.type],
    seed: seedFromId(f.id),
    banded: f.type === 'gas_giant' ? 1 : 0,
    fog: fogQuadFor(f.band),
  }
}

// sortFeaturesForDraw — the documented within-layer draw order: non-parented
// bodies first (stable id order), then children (moons), so a child always
// draws above its parent. The frame packer emits positions in this same order.
export function sortFeaturesForDraw(features: BoardFeature[]): BoardFeature[] {
  const parents = features.filter((f) => !f.parentId && f.type !== 'star')
  const children = features.filter((f) => !!f.parentId && f.type !== 'star')
  const byId = (a: BoardFeature, b: BoardFeature) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return [...parents.sort(byId), ...children.sort(byId)]
}

// packLatticeTiles — every cell's centre (GL space), ring-band tint, and the
// annular-sector bounds the shader carves it out of its quad with.
//
// The wedge bounds are resolved HERE, not in the shader: which cells exist,
// how many slots a ring carries, and where a ring sits radially are all
// schedule decisions, and the decision rule keeps them outside webgl/. The
// shader receives four numbers and an SDF to evaluate.
export function packLatticeTiles(radius: number, bounds?: BandBounds): PackedLatticeTile[] {
  const s = boardSchedule(radius)
  const out: PackedLatticeTile[] = []
  for (let ring = 0; ring <= radius; ring++) {
    for (const c of ringCells(ring, s)) {
      const p = boardToWorld(cellToPoint(c, s))
      const w = cellWedge(c, s)
      // Board angles run with screen-down y; world angles run with y up. The
      // centre point is already flipped, so its own world angle IS the flipped
      // angCenter — taking it from the point avoids reasoning about the sign.
      const angCenter = ring <= 0 ? 0 : Math.atan2(p.y, p.x)
      // The quad must bound the wedge in both axes. Radially it spans one unit;
      // angularly it spans a chord of 2·rOuter·sin(angHalf), which grows with
      // ring where the hex's fixed apothem did not.
      const arcHalf = w.rOuter * Math.sin(Math.min(w.angHalf, Math.PI / 2))
      const half = Math.max(RADIAL_UNIT / 2, arcHalf) + RADIAL_UNIT * 0.15
      out.push({
        x: p.x,
        y: p.y,
        tint: hexToRgb(BAND_STYLE[bandForRing(ring, bounds)].tint),
        rInner: w.rInner,
        rOuter: w.rOuter,
        angCenter,
        angHalf: w.angHalf,
        half,
      })
    }
  }
  return out
}

// packRings — the occupied orbit rings as closed GL-space polylines. Occupancy
// comes from each feature's own ring (orbit ring, or its footprint's), which is
// constant for the life of the board read.
export function packRings(features: BoardFeature[], radius: number): PackedRing[] {
  const occupied = new Set<number>()
  for (const f of features) {
    if (f.type === 'star' || f.fixed) continue
    if (f.orbit) occupied.add(f.orbit.ring)
    else if (f.footprint[0]) occupied.add(f.footprint[0].ring)
  }
  const s = boardSchedule(radius)
  return [...occupied]
    .filter((r) => r > 0 && r <= radius)
    .sort((a, b) => a - b)
    .map((ring) => {
      const points: number[] = []
      for (const c of ringCells(ring, s)) {
        const p = boardToWorld(cellToPoint(c, s))
        points.push(p.x, p.y)
      }
      return { ring, points }
    })
}

// rgba-string constants can't feed shader uniforms; the orbit-ring tints are
// re-expressed here from their palette values (150,180,220 / SIGNAL cyan).
const ORBIT_RING_MATCH = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/

function rgbaToTheme(rgba: string): { tint: Rgb; opacity: number } {
  const m = ORBIT_RING_MATCH.exec(rgba)
  if (!m) return { tint: [1, 1, 1], opacity: 1 }
  return {
    tint: [
      srgbToLinear(Number(m[1]) / 255),
      srgbToLinear(Number(m[2]) / 255),
      srgbToLinear(Number(m[3]) / 255),
    ],
    opacity: Number(m[4]),
  }
}

export function packBoardTheme(): BoardTheme {
  return {
    signal: hexToRgb(SIGNAL),
    thruster: hexToRgb(THRUSTER),
    hull: hexToRgb(HULL),
    orbitRing: rgbaToTheme(ORBIT_RING),
    orbitRingHilite: rgbaToTheme(ORBIT_RING_HILITE),
  }
}

// createPackedScene — the full static scene for a board read, every decision
// resolved. Bodies are in sortFeaturesForDraw order; the star packs separately
// (it is the light source, not an instanced body).
export function createPackedScene(board: SystemBoard): PackedScene {
  const star = board.features.find((f) => f.type === 'star')
  return {
    radius: board.radius,
    clearColor: hexToRgb(VOID),
    latticeTiles: packLatticeTiles(board.radius),
    bodies: sortFeaturesForDraw(board.features).map(packBodyInstance),
    star: star ? { radius: DRAW_RADIUS.star, tint: hexToRgb(starTint(board.starClass)) } : null,
    rings: packRings(board.features, board.radius),
    theme: packBoardTheme(),
  }
}

// formationOffsets — hull slots for an own fleet's roster, in fleet-local
// space (+y forward): a leader, then staggered wingman pairs behind. Pure and
// exported so the formation is assertable without a renderer.
export function formationOffsets(count: number): { dx: number; dy: number }[] {
  const n = Math.max(1, count)
  const out: { dx: number; dy: number }[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out.push({ dx: 0, dy: 0 })
      continue
    }
    const pair = Math.ceil(i / 2)
    const side = i % 2 === 1 ? -1 : 1
    out.push({ dx: side * pair * (RADIAL_UNIT * 0.28), dy: -pair * (RADIAL_UNIT * 0.32) })
  }
  return out
}

// A foreign fleet's mark is derived from its position ALONE: one centred slot,
// constant across all foreign fleets regardless of any field of the read —
// size/instance-count/formation invariance is the confidentiality property
// (`Foreign Fleets Render as Contact Marks Only`).
const FOREIGN_FORMATION: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }]

// packFleetInstance — the own/foreign fork, decided here, outside any
// renderer. Own fleets draw one hull per roster ship (a rosterless own fleet
// draws a single hull); foreign fleets draw the constant contact mark.
export function packFleetInstance(fleet: Fleet): PackedFleetInstance {
  if (!fleet.own) {
    return { id: fleet.id, audience: 1, formation: FOREIGN_FORMATION }
  }
  return {
    id: fleet.id,
    audience: 0,
    formation: formationOffsets(fleet.roster?.ships.length ?? 1),
  }
}
