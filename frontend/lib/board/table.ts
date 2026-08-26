// The pinned coordinate table — the client loader (openspec
// board-tactical-math, "A Pinned Coordinate Table Grounds Board Geometry").
//
// For each distinct slot count in the pinned Isotropic schedule family and
// each slot below it, the fixed-point (x, y) of that slot's angle at unit
// radius, scaled by 2^16 and rounded ONCE at record time. A cell's center is
// ring × entry. The table is generated only by the fixture-recording flow —
// the sole place its trigonometry ever executes — committed as data, and
// LOADED here, never recomputed. fixtures/board/coordinate-table.json is the
// canonical artifact; this module's coordtable.json copy is asserted
// byte-identical to it by fixtures.test.ts. All runtime geometry over table
// values is exact integer arithmetic (BigInt where squares exceed 2^53) — no
// runtime trig, no runtime sqrt.

import coordTable from './coordtable.json'

// TABLE_SCALE is the pinned fixed-point scale: 2^16 table units per unit
// radius. Squared quantities (occluder radii, beam half-widths) are
// expressed in squared table units.
export const TABLE_SCALE = 65536

interface CoordTableFile {
  scale: number
  slotCounts: { slots: number; points: [number, number][] }[]
}

const table = new Map<number, [number, number][]>()
{
  const f = coordTable as CoordTableFile
  if (f.scale !== TABLE_SCALE) {
    throw new Error(`board: coordinate table scale ${f.scale} != pinned TABLE_SCALE ${TABLE_SCALE}`)
  }
  for (const e of f.slotCounts) {
    if (e.points.length !== e.slots) {
      throw new Error(`board: coordinate table slot count ${e.slots} carries ${e.points.length} points`)
    }
    table.set(e.slots, e.points)
  }
}

// tablePoints returns the pinned unit-radius points for a slot count. Throws
// on a slot count outside the pinned family — a schedule this game does not
// ship.
export function tablePoints(slots: number): [number, number][] {
  const pts = table.get(slots)
  if (!pts) throw new Error(`board: slot count ${slots} is outside the pinned coordinate table's family`)
  return pts
}

// cellCenter returns a cell's pinned integer board coordinates: ring × the
// slot's unit-radius table entry, in table units (Go: board.CellCenter).
export function cellCenter(c: { ring: number; slot: number }, slots: number): [number, number] {
  if (c.ring <= 0) return [0, 0]
  const p = tablePoints(slots)[c.slot % slots]
  return [c.ring * p[0], c.ring * p[1]]
}
