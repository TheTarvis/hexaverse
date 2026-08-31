// Glyph geometry — the render-side projection that turns a body's (elements,
// worldTime) into a smoothly-glided SVG point (#0007: "quantize the
// simulation, interpolate the picture"). The LOGICAL cell is lib/board's job
// (the Go-pinned golden — orbState); this module only interpolates the
// picture between logical cells so motion reads smooth, including the ring
// wrap-around. Pure and presentational: no clock, no fetch.
//
// The board draws no fleet layer after migrate-fleet-to-continuous-burns
// (design.md Decision 12: a fleet has no board cell any more, only a
// continuous-space position) — this module carries feature/body geometry
// only. The fleet-position helpers that used to live here (burnGlidePixel,
// fleetDockedParentId, fleetLogicalCell, fleetOnBoard, fleetGlidePixel,
// fleetScenePixel, sensorBubbleCells) have no successor; see tasks.md 8.1/8.7.
//
// Every function here takes the board's `Schedule` explicitly (design.md,
// schedule-threading Decision): it is what resolves a ring's slot count, so
// nothing that projects or folds can be computed without it.

import { cellToPoint, lerpPoint, orbState, ringCells, type Cell, type Orbit, type Point, type Schedule } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'

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

// headingDeg — the compass heading (SVG degrees, 0 = +x) from a to b; 0 when the
// two points coincide.
export function headingDeg(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}
