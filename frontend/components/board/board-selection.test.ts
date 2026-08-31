// RED-phase suite for board-view ADDED "Board Picking Resolves to the
// Feature, Cell, or Lane Gate Under the Pointer" (8.3) and MODIFIED
// "Toggle-to-Deselect Single Selection" (8.10) — the pure hit-test + toggle
// decision, decoupled from the DOM/SVG/canvas layer it drives (BoardStage's
// click handler, BoardOverlay's per-glyph onClick).
//
// Contract this test pins for `components/board/board-selection.ts` (does
// not exist yet):
//
//   export type BoardSelection =
//     | { kind: 'feature'; id: string }
//     | { kind: 'gate'; destSystemId: string }
//     | { kind: 'cell'; cell: Cell }
//     | null
//
//   export interface PickableFeature { id: string; parentId?: string; pixel: Point; hitRadius: number }
//   export interface PickableGate { destSystemId: string; pixel: Point; hitRadius: number }
//   export interface PickInput {
//     point: Point          // the clicked point, in board-pixel space
//     features: PickableFeature[]
//     gates: PickableGate[]
//     radius: number        // the board's outer ring (rim)
//     schedule: Schedule
//   }
//
//   // resolvePick hit-tests `point` against features and gates (features win
//   // over gates; among features, a child wins over its overlapping parent —
//   // the board's documented draw order), falling back to the containing
//   // cell, or null when the point falls outside the lattice altogether.
//   export function resolvePick(input: PickInput): BoardSelection
//
//   // toggleSelection: re-picking the current selection clears it; picking
//   // something else (or null, i.e. outside the lattice) replaces/clears it.
//   export function toggleSelection(current: BoardSelection, picked: BoardSelection): BoardSelection
//
// The board draws NO fleet layer after this change (design.md Decision 12),
// so `BoardSelection` structurally has no 'fleet' variant — a fleet can
// never be a member of this type, not merely "never picked in practice".

import { describe, it, expect } from 'vitest'
import { RADIAL_UNIT, cellToPoint, schedule as boardSchedule, type Cell } from '@/lib/board'
import { resolvePick, toggleSelection, type BoardSelection, type PickableFeature, type PickableGate } from './board-selection'

const RADIUS = 4
const SCHEDULE = boardSchedule(RADIUS)
const HIT_R = RADIAL_UNIT * 0.5

function featureAt(id: string, cell: Cell, opts: Partial<PickableFeature> = {}): PickableFeature {
  return { id, pixel: cellToPoint(cell, SCHEDULE), hitRadius: HIT_R, ...opts }
}

function gateAt(destSystemId: string, cell: Cell): PickableGate {
  return { destSystemId, pixel: cellToPoint(cell, SCHEDULE), hitRadius: RADIAL_UNIT * 0.4 }
}

const PLANET_CELL: Cell = { ring: 2, slot: 0 }
const MOON_CELL = PLANET_CELL // the moon draws exactly on its parent's cell (a tight orbit) — the overlap case
const GATE_CELL: Cell = { ring: RADIUS, slot: 1 }
const BARE_CELL: Cell = { ring: 3, slot: 2 }

function baseInput() {
  return {
    features: [featureAt('planet-1', PLANET_CELL), featureAt('moon-1', MOON_CELL, { parentId: 'planet-1' })],
    gates: [gateAt('sys-far', GATE_CELL)],
    radius: RADIUS,
    schedule: SCHEDULE,
  }
}

describe('resolvePick — board-view ADDED "Board Picking Resolves to the Feature, Cell, or Lane Gate Under the Pointer"', () => {
  // Scenario: Clicking a feature mark selects that feature
  it('selects a feature clicked within its drawn mark', () => {
    const picked = resolvePick({
      point: cellToPoint(PLANET_CELL, SCHEDULE),
      features: [featureAt('planet-1', PLANET_CELL)],
      gates: [],
      radius: RADIUS,
      schedule: SCHEDULE,
    })
    expect(picked).toEqual<BoardSelection>({ kind: 'feature', id: 'planet-1' })
  })

  // Scenario: Clicking a lane-gate mark selects that gate
  it('selects a lane gate clicked within its drawn mark', () => {
    const picked = resolvePick({ ...baseInput(), features: [], point: cellToPoint(GATE_CELL, SCHEDULE) })
    expect(picked).toEqual<BoardSelection>({ kind: 'gate', destSystemId: 'sys-far' })
  })

  // Scenario: Clicking the lattice away from any mark selects the hex
  it('selects the containing bare cell when the click is not over any mark', () => {
    const picked = resolvePick({ ...baseInput(), features: [], gates: [], point: cellToPoint(BARE_CELL, SCHEDULE) })
    expect(picked).toEqual<BoardSelection>({ kind: 'cell', cell: BARE_CELL })
  })

  // Scenario: A selected bare hex is visibly marked on the board — this is a
  // rendering fact (a stroked wedge keyed on `selection.kind === 'cell'`),
  // proved by construction here: `resolvePick` returns a `{kind:'cell', cell}`
  // value distinct from `null`, which is exactly the signal BoardOverlay's
  // existing `selectedCell &&` render guard needs. No separate DOM assertion
  // is meaningful at this pure level; see BoardOverlay's own test for the
  // rendered stroke.
  it('returns a non-null, cell-kind selection for a bare-hex pick (the render guard input)', () => {
    const picked = resolvePick({ ...baseInput(), features: [], gates: [], point: cellToPoint(BARE_CELL, SCHEDULE) })
    expect(picked?.kind).toBe('cell')
  })

  // Scenario: An overlapping child mark wins over its parent
  it('picks the child feature over its overlapping parent', () => {
    const picked = resolvePick({ ...baseInput(), gates: [], point: cellToPoint(PLANET_CELL, SCHEDULE) })
    expect(picked).toEqual<BoardSelection>({ kind: 'feature', id: 'moon-1' })
  })

  // Scenario: Clicking outside the lattice clears the selection
  it('returns null for a point outside the lattice', () => {
    const far = { x: (RADIUS + 5) * RADIAL_UNIT, y: 0 }
    const picked = resolvePick({ ...baseInput(), point: far })
    expect(picked).toBeNull()
  })

  // Draw-order tiebreak: a feature wins over a gate at the same point.
  it('picks a feature over a co-located lane gate — features draw above gates', () => {
    const picked = resolvePick({
      point: cellToPoint(GATE_CELL, SCHEDULE),
      features: [featureAt('planet-2', GATE_CELL)],
      gates: [gateAt('sys-far', GATE_CELL)],
      radius: RADIUS,
      schedule: SCHEDULE,
    })
    expect(picked).toEqual<BoardSelection>({ kind: 'feature', id: 'planet-2' })
  })
})

describe('toggleSelection — board-view MODIFIED "Toggle-to-Deselect Single Selection"', () => {
  // Scenario: Re-selecting the same feature deselects it
  it('clears the selection when the same feature is picked again', () => {
    const current: BoardSelection = { kind: 'feature', id: 'planet-1' }
    expect(toggleSelection(current, { kind: 'feature', id: 'planet-1' })).toBeNull()
  })

  // Scenario: Selecting a hex replaces a feature selection
  it('replaces a feature selection with a picked cell', () => {
    const current: BoardSelection = { kind: 'feature', id: 'planet-1' }
    const cell: Cell = { ring: 1, slot: 0 }
    expect(toggleSelection(current, { kind: 'cell', cell })).toEqual<BoardSelection>({ kind: 'cell', cell })
  })

  // Scenario: Clicking board background clears the selection
  it('clears the selection when the pick is null (background/outside click)', () => {
    const current: BoardSelection = { kind: 'feature', id: 'planet-1' }
    expect(toggleSelection(current, null)).toBeNull()
  })

  // Re-picking the same gate/cell also deselects — the toggle rule is
  // generic across all three selection kinds, not feature-only.
  it('deselects a re-picked gate and a re-picked cell identically', () => {
    const gateSel: BoardSelection = { kind: 'gate', destSystemId: 'sys-far' }
    expect(toggleSelection(gateSel, { kind: 'gate', destSystemId: 'sys-far' })).toBeNull()

    const cell: Cell = { ring: 2, slot: 3 }
    const cellSel: BoardSelection = { kind: 'cell', cell }
    expect(toggleSelection(cellSel, { kind: 'cell', cell: { ring: 2, slot: 3 } })).toBeNull()
  })

  // Nothing selected, picking null stays null (no spurious selection).
  it('stays empty when nothing is selected and the click misses everything', () => {
    expect(toggleSelection(null, null)).toBeNull()
  })
})
