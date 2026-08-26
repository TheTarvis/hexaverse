// Fleet movement state + computed position — the client mirror of
// backend/board/ship.go.
//
// A fleet stores one movement field with three shapes (coast | burn | docked);
// no per-tick position is persisted — the live cell is computed from
// (state, worldTime), quantized to the integer logical cell. The pixel glide
// between cells is a render concern that lives with the renderer, NOT here:
// this module only ever returns logical cells, keeping continuous motion out
// of the rules.

import { type Schedule, slotsForRing } from '@/lib/polar'
import type { Cell } from './board'
import { canon } from './board'
import type { Orbit } from './orbit'
import { orbState, orbitThrough } from './orbit'
import { orbitPeriod } from './tuning'

// Mode is the fleet's movement-state discriminator. coast/burn/docked are board
// tier (#0004); laneTransit/laneHold are graph tier (#0008).
export type Mode = 'coast' | 'burn' | 'docked' | 'laneTransit' | 'laneHold'

// Target is a burn destination — a cell OR a feature to intercept (exactly one).
export interface Target {
  cell?: Cell
  featureId?: string
}

// Burn is the volatile state: an arc path traversed over real time.
export interface Burn {
  path: Cell[]
  startTime: number
  arriveTime: number
  target: Target
  dockOnArrive?: string
}

// Docked rides a parent feature; its live cell is the parent's, resolved by
// the caller (which holds the interior).
export interface Docked {
  parentId: string
}

// BoardLeg is leg 0 of a trip — the burn from the fleet's current position to
// the departure gate cell, inside the one trip action (#0008).
export interface BoardLeg {
  path: Cell[]
  startTime: number
  gateEta: number
}

// LaneTransit is the graph-tier crossing (#0008): an optional board leg, then a
// route of systemIds with cumulative arrival stamps (legEtas[i] is when the
// fleet reaches route[i]; legEtas[0] is the gate ETA). Position is computed
// piecewise.
export interface LaneTransit {
  boardLeg?: BoardLeg
  route: string[]
  legEtas: number[]
  departTime: number
  arriveTime: number
  entryGate: Cell
  onward?: string[]
}

// LaneHold is a fleet parked mid-lane after a cancel — a frozen fraction
// between two systems, visible until re-ordered (#0008).
export interface LaneHold {
  from: string
  to: string
  fraction: number
}

// MovementState is the fleet's single movement field, one shape at a time.
export interface MovementState {
  mode: Mode
  coast?: Orbit
  burn?: Burn
  docked?: Docked
  laneTransit?: LaneTransit
  laneHold?: LaneHold
}

// laneFraction returns which lane a transit is on at time t and how far along
// it (0..1), as route indices from→to — the client mirror of
// board.LaneFraction. Before the gate ETA it reports the first lane at
// fraction 0; past arrival, the last lane at fraction 1. ok is false when the
// transit has fewer than two systems.
export function laneFraction(
  lt: LaneTransit,
  t: number,
): { from: number; to: number; frac: number; ok: boolean } {
  const n = lt.route.length
  if (n < 2 || lt.legEtas.length !== n) return { from: 0, to: 0, frac: 0, ok: false }
  if (t <= lt.legEtas[0]) return { from: 0, to: 1, frac: 0, ok: true }
  for (let i = 0; i < n - 1; i++) {
    const start = lt.legEtas[i]
    const end = lt.legEtas[i + 1]
    if (t < end) {
      if (end <= start) return { from: i, to: i + 1, frac: 0, ok: true }
      return { from: i, to: i + 1, frac: (t - start) / (end - start), ok: true }
    }
  }
  return { from: n - 2, to: n - 1, frac: 1, ok: true }
}

// boardLegBurn views a trip's leg 0 as a #0004 burn — the same shape the board
// draws and positions any other burn with, so the run to the departure gate
// needs no second code path. Null when the trip has no board leg.
export function boardLegBurn(lt: LaneTransit): Burn | null {
  if (!lt.boardLeg || lt.boardLeg.path.length === 0) return null
  return {
    path: lt.boardLeg.path,
    startTime: lt.boardLeg.startTime,
    arriveTime: lt.boardLeg.gateEta,
    target: { cell: lt.boardLeg.path[lt.boardLeg.path.length - 1] },
  }
}

// burnPos returns the fleet's quantized cell along its burn path at time t —
// Go: board.BurnPos. The index is computed from elapsed and total burn time
// in exact integer arithmetic (round-half-up), so it is identical across the
// seam and across build targets; no float anywhere (openspec
// board-tactical-math, "Computed Ship Board Position"). Clamped to the
// endpoints outside the burn window.
export function burnPos(b: Burn, t: number): Cell {
  const n = b.path.length
  if (n === 0) return { ring: 0, slot: 0 }
  if (t <= b.startTime || b.arriveTime <= b.startTime) return b.path[0]
  if (t >= b.arriveTime) return b.path[n - 1]
  const elapsed = Math.trunc(t) - Math.trunc(b.startTime)
  const total = Math.trunc(b.arriveTime) - Math.trunc(b.startTime)
  // round-half-up in pure integers: ⌊(2·elapsed·(n−1) + total) / (2·total)⌋.
  // Magnitudes stay well below 2^53 for any real burn window.
  let idx = Math.floor((2 * elapsed * (n - 1) + total) / (2 * total))
  if (idx < 0) idx = 0
  if (idx > n - 1) idx = n - 1
  return b.path[idx]
}

// coastAt returns the resting state a fleet settles into on cell c at world
// time `at` (Go: board.CoastAt): a free prograde orbit on c's ring,
// back-solved to pass through c, paced by the world's one orbital law. `at`
// is load-bearing — pass the arrival/settle time, never a bare zero.
//
// The anchor snaps to the NEAREST ring-cell window boundary (see the Go side
// for the full why): the renderer glides every orbit by the absolute window
// fraction, so a mid-window anchor draws a freshly settled ship up to a full
// cell prograde of its halt cell. Snapping bounds the visual discontinuity to
// half a cell either side.
export function coastAt(c: Cell, at: number, s: Schedule): MovementState {
  const cc = canon(c, s)
  const period = orbitPeriod(cc.ring)
  const slots = slotsForRing(cc.ring, s)
  return { mode: 'coast', coast: orbitThrough(cc, snapToCellBoundary(at, period, slots), period, 1, s) }
}

// snapToCellBoundary — Go: board.snapToCellBoundary, integer math mirrored
// exactly (a ring advances a cell every period/slots).
function snapToCellBoundary(at: number, period: number, slots: number): number {
  if (slots <= 1 || period <= 0) return at
  const oneStep = Math.trunc(period / slots)
  if (oneStep <= 0) return at
  const k = Math.floor((Math.trunc(at) + Math.trunc(oneStep / 2)) / oneStep)
  return k * oneStep
}

// stateAt returns the state the fleet is IN at time t (Go: board.StateAt): the
// stored/wire state with any completed kinematics folded forward. A burn past
// its arriveTime IS its settled state — docked onto its target, or coasting the
// local orbit anchored at the arrival instant. The server's persisted doc (and
// therefore the payload a poll delivered a moment ago) is a cache of this fold;
// deriving anything from a raw past-ETA burn shows a ship frozen on its last
// path cell while the system turns around it.
//
// Lane transit is deliberately NOT folded: a lane arrival moves the fleet to
// another system and reveals what's there — facts only the server's resolve may
// establish. A due transit reads unchanged until a refetch delivers the truth.
export function stateAt(st: MovementState, t: number, s: Schedule): MovementState {
  if (st.mode !== 'burn' || !st.burn || st.burn.path.length === 0 || t < st.burn.arriveTime) return st
  const b = st.burn
  if (b.dockOnArrive) return { mode: 'docked', docked: { parentId: b.dockOnArrive } }
  return coastAt(b.path[b.path.length - 1], b.arriveTime, s)
}

// shipPos returns the fleet's computed board cell. ok=false whenever the fleet
// has no cell on the current system's board: docked (parent's cell), parked
// mid-lane, or out on a lane past the departure gate. During a trip's board
// leg the fleet is still on the origin board burning to the gate, so its burn
// cell is returned.
//
// It evaluates the EFFECTIVE state (stateAt), so a wire burn whose arrival has
// passed answers as the coast it settled into — a caller that forgets to fold
// still gets the right position — and a due dock-on-arrive answers ok=false
// (its cell is the parent's, which has moved on since the burn ended).
export function shipPos(st: MovementState, t: number, s: Schedule): { cell: Cell; ok: boolean } {
  const eff = stateAt(st, t, s)
  switch (eff.mode) {
    case 'coast':
      if (!eff.coast) return { cell: { ring: 0, slot: 0 }, ok: true }
      return { cell: orbState(eff.coast, t, s), ok: true }
    case 'burn':
      if (!eff.burn) return { cell: { ring: 0, slot: 0 }, ok: false }
      return { cell: burnPos(eff.burn, t), ok: true }
    case 'laneTransit': {
      const lt = eff.laneTransit
      if (!lt) return { cell: { ring: 0, slot: 0 }, ok: false }
      const leg = boardLegBurn(lt)
      if (leg && t < leg.arriveTime) return { cell: burnPos(leg, t), ok: true }
      return { cell: { ring: 0, slot: 0 }, ok: false }
    }
    default: // docked / laneHold — no board cell on the current system
      return { cell: { ring: 0, slot: 0 }, ok: false }
  }
}

// arrived reports whether a fleet's active kinematic order has reached
// completion — a burn's arrival or a lane trip's destination arrival.
export function arrived(s: MovementState, t: number): boolean {
  if (s.mode === 'burn') return !!s.burn && t >= s.burn.arriveTime
  if (s.mode === 'laneTransit') return !!s.laneTransit && t >= s.laneTransit.arriveTime
  return false
}
