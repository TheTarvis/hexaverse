// Glyph geometry — the render-side projection that turns a body's or fleet's
// (elements, worldTime) into a smoothly-glided SVG point (#0007: "quantize the
// simulation, interpolate the picture"). The LOGICAL cell is lib/board's job (the
// Go-pinned golden — orbState/shipPos); this module only interpolates the picture
// between logical cells so motion reads smooth, including the ring wrap-around.
// Pure and presentational: no clock, no fetch.
//
// Every function here takes the board's `Schedule` explicitly (design.md,
// schedule-threading Decision): it is what resolves a ring's slot count, so
// nothing that projects or folds can be computed without it.

import {
  boardLegBurn,
  cellKey,
  cellToPoint,
  neighbors,
  lerpPoint,
  orbState,
  ringCells,
  shipPos,
  stateAt,
  type Burn,
  type Cell,
  type MovementState,
  type Orbit,
  type Point,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'

// The single core cell — ring 0 carries exactly one slot (the star's).
const CORE_CELL: Cell = { ring: 0, slot: 0 }

// orbitGlidePixel — a body's glided screen point at worldTime: its logical ring
// cell (orbState) slid toward the next cell in its direction of travel, so it
// tracks the ring continuously. Consecutive ring cells are neighbours and the
// last wraps to the first, so the wrap-around glides straight through with no
// special case. A huge-period ("motion off") body sits still.
export function orbitGlidePixel(orbit: Orbit, worldTime: number, s: Schedule): Point {
  // One step is one SLOT on this ring, not a fixed six-per-ring: under the
  // banded schedule a ring's slot count varies, so the cell-crossing cadence is
  // period/slots(ring) rather than period/(6·ring).
  const cell = orbState(orbit, worldTime, s)
  const steps = orbit.ring > 0 ? ringCells(orbit.ring, s).length : 0
  if (steps === 0 || orbit.period <= 0) return cellToPoint(cell, s)
  const oneStep = orbit.period / steps // world-ms to cross one ring cell
  const next = orbState(orbit, worldTime + oneStep, s)
  // No advance this step (e.g. a huge-period "motion off" body) → snap to the
  // cell centre exactly, no sub-pixel drift.
  if (next.ring === cell.ring && next.slot === cell.slot) return cellToPoint(cell, s)
  const prog = worldTime / oneStep
  const frac = ((prog % 1) + 1) % 1
  return lerpPoint(cellToPoint(cell, s), cellToPoint(next, s), frac)
}

// burnGlidePixel — a fleet's glided screen point along its burn path: linear
// progress by elapsed-fraction of the burn window, interpolated between adjacent
// path cells. Clamped to the endpoints outside the window.
export function burnGlidePixel(burn: Burn, worldTime: number, s: Schedule): Point {
  const n = burn.path.length
  if (n === 0) return { x: 0, y: 0 }
  if (n === 1 || worldTime <= burn.startTime || burn.arriveTime <= burn.startTime) {
    return cellToPoint(burn.path[0], s)
  }
  if (worldTime >= burn.arriveTime) return cellToPoint(burn.path[n - 1], s)
  const frac = (worldTime - burn.startTime) / (burn.arriveTime - burn.startTime)
  const cont = frac * (n - 1)
  const i0 = Math.floor(cont)
  const i1 = Math.min(i0 + 1, n - 1)
  return lerpPoint(cellToPoint(burn.path[i0], s), cellToPoint(burn.path[i1], s), cont - i0)
}

// featureLogicalCell — a feature's integer board cell at worldTime (selection,
// readouts, targeting). Star/fixed → the core cell; orbiting → orbState;
// parented (moon) → the parent's logical cell; otherwise its stored footprint
// cell.
export function featureLogicalCell(
  f: BoardFeature,
  worldTime: number,
  s: Schedule,
  parentCell?: Cell,
): Cell {
  if (f.fixed) return CORE_CELL
  if (f.orbit) return orbState(f.orbit, worldTime, s)
  if (f.parentId && parentCell) return parentCell
  return f.footprint[0] ?? CORE_CELL
}

// featureGlidePixel — a feature's glided screen point. Moons ride their parent's
// glided point (with a small per-index offset so they don't sit exactly on top).
export function featureGlidePixel(
  f: BoardFeature,
  worldTime: number,
  s: Schedule,
  parentPixel?: Point,
  moonIndex = 0,
): Point {
  if (f.fixed) return cellToPoint(CORE_CELL, s)
  if (f.orbit) return orbitGlidePixel(f.orbit, worldTime, s)
  if (f.parentId && parentPixel) {
    const angle = (Math.PI / 3) * moonIndex
    return { x: parentPixel.x + Math.cos(angle) * 14, y: parentPixel.y + Math.sin(angle) * 14 }
  }
  return cellToPoint(f.footprint[0] ?? CORE_CELL, s)
}

// featureMaps — every feature's glided pixel and logical hex at worldTime,
// resolved in two passes so moons ride their parent (parents are always
// non-parented, so pass 1 covers them). The one shared implementation behind
// the scene layers: whoever draws features must position them through this so
// a moon and its parent never disagree between layers.
export function featureMaps(
  features: BoardFeature[],
  worldTime: number,
  s: Schedule,
): { pixelById: Map<string, Point>; cellById: Map<string, Cell> } {
  const pixelById = new Map<string, Point>()
  const cellById = new Map<string, Cell>()
  const moonIndex = new Map<string, number>()
  for (const f of features) {
    if (f.parentId) continue
    pixelById.set(f.id, featureGlidePixel(f, worldTime, s))
    cellById.set(f.id, featureLogicalCell(f, worldTime, s))
  }
  for (const f of features) {
    if (!f.parentId) continue
    const i = moonIndex.get(f.parentId) ?? 0
    moonIndex.set(f.parentId, i + 1)
    pixelById.set(f.id, featureGlidePixel(f, worldTime, s, pixelById.get(f.parentId), i))
    cellById.set(f.id, featureLogicalCell(f, worldTime, s, cellById.get(f.parentId)))
  }
  return { pixelById, cellById }
}

// Every fleet helper below positions from the EFFECTIVE state (stateAt): a
// payload burn whose arrival passes while it sits in the query cache IS the
// coast (or dock) it settled into, from the instant it arrives. Deriving from
// the raw wire state froze an arrived ship on its last path hex until the next
// refetch — the ship sat still while the whole system turned around it.

// fleetDockedParentId — the feature a fleet rides at worldTime, if any: its
// stored dock, or the dock a finished dock-on-arrive burn has settled into.
// Components resolve parent hex/pixel through this, never from raw state.
export function fleetDockedParentId(fleet: Fleet, worldTime: number, s: Schedule): string | undefined {
  const eff = stateAt(fleet.state, worldTime, s)
  return eff.mode === 'docked' ? eff.docked?.parentId : undefined
}

// fleetLogicalCell — a fleet's integer board cell at worldTime. Docked rides the
// resolved parent cell; coast/burn come from shipPos (the golden).
export function fleetLogicalCell(fleet: Fleet, worldTime: number, s: Schedule, parentCell?: Cell): Cell {
  const eff = stateAt(fleet.state, worldTime, s)
  if (eff.mode === 'docked') return parentCell ?? fleet.position
  return shipPos(eff, worldTime, s).cell
}

// fleetOnBoard reports whether a fleet has a cell on THIS system's board at
// worldTime — false once a trip passes its departure gate (it's out on a lane
// now, the galaxy view's to draw). Callers must check it before positioning a
// fleet: shipPos's off-board answer is the core cell, which would otherwise
// plant the ship on the star.
export function fleetOnBoard(fleet: Fleet, worldTime: number, s: Schedule): boolean {
  const eff = stateAt(fleet.state, worldTime, s)
  if (eff.mode === 'docked') return true
  return shipPos(eff, worldTime, s).ok
}

// fleetGlidePixel — a fleet's glided screen point. Coast glides on its orbit,
// burn along its path, docked rides the parent feature's glided point, and a
// trip's leg 0 glides along the board leg exactly as a burn does. The fold is
// what lets an arriving ship hand off seamlessly from the burn glide to the
// coast glide: the settled orbit passes through the meet hex at the arrival
// instant, so the pixel never jumps.
export function fleetGlidePixel(
  fleet: Fleet,
  worldTime: number,
  s: Schedule,
  parentPixel?: Point,
): Point {
  const eff: MovementState = stateAt(fleet.state, worldTime, s)
  if (eff.mode === 'docked') return parentPixel ?? cellToPoint(fleet.position, s)
  if (eff.mode === 'burn' && eff.burn) return burnGlidePixel(eff.burn, worldTime, s)
  if (eff.mode === 'coast' && eff.coast) return orbitGlidePixel(eff.coast, worldTime, s)
  if (eff.mode === 'laneTransit' && eff.laneTransit) {
    const leg = boardLegBurn(eff.laneTransit)
    if (leg) return burnGlidePixel(leg, worldTime, s)
  }
  return cellToPoint(shipPos(eff, worldTime, s).cell, s)
}

// fleetScenePixel — a fleet's glided screen point resolved against the full
// feature list: the one-fleet equivalent of BoardScene's two-pass pixel map,
// for layers outside the scene (the scan sweep rides the fleet) that must
// pivot exactly where the glyph draws. A moon parent rides ITS parent with the
// same sibling offset BoardScene assigns (moon index = position among the
// parent's children).
export function fleetScenePixel(
  fleet: Fleet,
  features: BoardFeature[],
  worldTime: number,
  s: Schedule,
): Point {
  const parentId = fleetDockedParentId(fleet, worldTime, s)
  const parent = parentId ? features.find((f) => f.id === parentId) : undefined
  let parentPixel: Point | undefined
  if (parent) {
    if (parent.parentId) {
      const grand = features.find((f) => f.id === parent.parentId)
      const grandPixel = grand ? featureGlidePixel(grand, worldTime, s) : undefined
      const moonIndex = features
        .filter((f) => f.parentId === parent.parentId)
        .findIndex((f) => f.id === parent.id)
      parentPixel = featureGlidePixel(parent, worldTime, s, grandPixel, Math.max(moonIndex, 0))
    } else {
      parentPixel = featureGlidePixel(parent, worldTime, s)
    }
  }
  return fleetGlidePixel(fleet, worldTime, s, parentPixel)
}

// sensorBubbleCells — the deduped union of every cell within `radius` hops of
// any centre: the live ambient-sensor footprint the board draws around own
// units (#0006 AmbientRadius).
//
// On the hex lattice this was a translation — one precomputed disc offset to
// each centre. A polar lattice admits no such translation (cells cannot be
// added), so this is a bounded multi-source BFS: the `Within` form, matching
// Go's board.Within.
//
// It must NOT be written as "scan the board, keep cells with distance <= r":
// `distance` is itself an unbounded BFS with per-call Set and string-key
// allocation, so that shape costs a full lattice traversal per cell per centre,
// every frame. This runs in the size of the RESULT instead — a radius-3 disc is
// a few dozen cells no matter how big the board is.
export function sensorBubbleCells(
  centers: Cell[],
  radius: number,
  maxRing: number,
  s: Schedule,
): Cell[] {
  const seen = new Set<string>()
  const out: Cell[] = []
  let frontier: Cell[] = []
  for (const c of centers) {
    if (c.ring > maxRing) continue
    const k = cellKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
    frontier.push(c)
  }
  for (let step = 0; step < radius; step++) {
    const next: Cell[] = []
    for (const c of frontier) {
      for (const nb of neighbors(c, s)) {
        if (nb.ring > maxRing) continue
        const k = cellKey(nb)
        if (seen.has(k)) continue
        seen.add(k)
        out.push(nb)
        next.push(nb)
      }
    }
    frontier = next
  }
  return out
}

// headingDeg — the compass heading (SVG degrees, 0 = +x) from a to b; 0 when the
// two points coincide. Used to point a fleet's hull along its motion.
export function headingDeg(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}
