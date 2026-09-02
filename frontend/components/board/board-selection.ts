// board-selection — the pure hit-test + toggle decision behind board-view
// ADDED "Board Picking Resolves to the Feature, Cell, or Lane Gate Under the
// Pointer" (8.3) and MODIFIED "Toggle-to-Deselect Single Selection" (8.10),
// decoupled from the DOM/SVG/canvas layer that drives it (BoardStage's click
// handler, BoardOverlay's per-glyph onClick).
//
// The board draws NO fleet layer after this change (design.md Decision 12),
// so `BoardSelection` structurally has no 'fleet' variant — a fleet can never
// be a member of this type.

import { pointToCell, RADIAL_UNIT, type Cell, type Point, type Schedule } from '@/lib/board'

export type BoardSelection =
  | { kind: 'feature'; id: string }
  | { kind: 'cell'; cell: Cell }
  | null

export interface PickableFeature {
  id: string
  parentId?: string
  pixel: Point
  hitRadius: number
}

export interface PickableGate {
  destSystemId: string
  pixel: Point
  hitRadius: number
}

export interface PickInput {
  // The clicked point, in board-pixel space.
  point: Point
  features: PickableFeature[]
  gates: PickableGate[]
  // The board's outer ring (rim) — a click past it clears the selection.
  radius: number
  schedule: Schedule
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// hitFeature — the topmost feature mark containing `point`. A child (its
// `parentId` set) always outranks an overlapping parent, matching the
// board's documented draw order (a moon draws above its parent).
function hitFeature(point: Point, features: PickableFeature[]): PickableFeature | null {
  let best: PickableFeature | null = null
  for (const f of features) {
    if (distance(point, f.pixel) > f.hitRadius) continue
    if (best && !f.parentId && best.parentId) continue
    best = f
  }
  return best
}

function hitGate(point: Point, gates: PickableGate[]): PickableGate | null {
  for (const g of gates) {
    if (distance(point, g.pixel) <= g.hitRadius) return g
  }
  return null
}

// resolvePick hit-tests `point` against features and gates (features win
// over gates; among features, a child wins over its overlapping parent),
// falling back to the containing cell, or null when the point falls outside
// the lattice altogether. A gate hit folds into the SAME 'feature'-shaped
// selection as any other body (replace-observation-with-sightings tasks.md
// 4.12 — gates ARE bodies, `docs/plans/continous_space/decisions.md`), named
// by its "gate-"+destSystemId convention id — the same id `attachedTo`
// reports on arrival. There is no dedicated 'gate' kind.
export function resolvePick(input: PickInput): BoardSelection {
  const { point, features, gates, radius, schedule } = input

  const feature = hitFeature(point, features)
  if (feature) return { kind: 'feature', id: feature.id }

  const gate = hitGate(point, gates)
  if (gate) return { kind: 'feature', id: `gate-${gate.destSystemId}` }

  // pointToCell CLAMPS to the rim, so a point outside the lattice comes back
  // as a rim cell rather than as "outside" — comparing the clamped cell's
  // ring against the board's radius, plus a raw-distance check against the
  // rim's outer edge, is what distinguishes the two.
  const cell = pointToCell(point, schedule)
  if (cell.ring > radius) return null
  const rimOuter = (radius + 0.5) * RADIAL_UNIT
  if (Math.hypot(point.x, point.y) > rimOuter) return null
  return { kind: 'cell', cell }
}

// toggleSelection: re-picking the current selection clears it; picking
// something else (or null, i.e. outside the lattice) replaces/clears it.
export function toggleSelection(current: BoardSelection, picked: BoardSelection): BoardSelection {
  if (!picked) return null
  if (!current || current.kind !== picked.kind) return picked

  if (current.kind === 'feature' && picked.kind === 'feature') {
    return current.id === picked.id ? null : picked
  }
  if (current.kind === 'cell' && picked.kind === 'cell') {
    return current.cell.ring === picked.cell.ring && current.cell.slot === picked.cell.slot
      ? null
      : picked
  }
  return picked
}
