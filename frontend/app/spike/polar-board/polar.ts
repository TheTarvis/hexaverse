// SPIKE — the polar lattice. Route: /spike/polar-board
//
// A candidate replacement for lib/hex's cube lattice, written to answer one
// question: does quantizing the system board in (ring, slot) instead of (q, r)
// give us curved trajectories without giving up the integer determinism seam?
//
// It is deliberately SELF-CONTAINED — no lib/hex import — so the two lattices
// can be measured against each other honestly on the bench. Nothing here is
// wired to production.
//
// The three claims it exists to test:
//
//  1. ORBITS ARE CIRCLES. A body's radius is exactly ring*unit for its whole
//     revolution. The hex lattice can't do this: a hex ring's corner sits at
//     distance N while its edge midpoint sits at N*(sqrt3/2), so a body
//     advancing at a uniform index rate breathes +/-13% in radius six times
//     per orbit.
//
//  2. STRAIGHT LINES ARE ARCS. `arcPath` is the same lerp-and-round that
//     lib/hex `line` is — but interpolating in (ring, angle) rather than in
//     cube space. A transfer from ring 12 to ring 3 sweeps angle while it
//     descends radius, which is a spiral. The arc is not bolted on; it is what
//     "straight" MEANS in this coordinate system. Corollary: a polar path only
//     reaches the core if an endpoint IS the core, so lib/hex `routeAround` —
//     the star-avoidance detour and its hard corner — has nothing to do here.
//
//  3. THE SEAM SURVIVES. Orbital advance stays integer BigInt truncating
//     division, exactly as lib/hex `orbState` does it, so a Go mirror would
//     still agree bit-for-bit. Trig appears ONLY in projection and in path
//     sampling, never in a stored value.
//
// The open question the bench is actually for: SLOT SCHEDULE. Hex hands you
// 6N slots on ring N, which means six cells at ring 1 — the densest, most
// interesting part of the board gets the least resolution, and the lattice
// forbids fixing it. Here the schedule is a knob (see SlotSchedule).

export interface PolarCell {
  ring: number
  slot: number
}

export interface Point {
  x: number
  y: number
}

// SlotSchedule — how many angular slots each ring carries.
//
// A naive polar grid reuses hex's 6N and inherits a fractional radial mapping
// everywhere (ring 10's 60 slots onto ring 9's 54): stepping inward lands
// between slots, the merge is lossy, and stepping back out does not return you
// where you started. So instead: a constant slot count across a BAND of rings,
// doubling at set radii — the trick sphere pixelizations use. Radial
// neighbours are then exactly 1:1 within a band and cleanly 2:1 at a boundary.
//
// WHAT THIS DOES NOT BUY, discovered on the bench and worth stating plainly
// because the opposite is the intuitive guess: it does NOT buy resolution in
// the inner system. Ring 1's circumference is only 2*PI*unit, so slicing it 24
// ways yields cells with a tangential:radial aspect of 0.26 — slivers. That is
// geometry, not lattice: hex is not withholding inner resolution arbitrarily,
// the circumference genuinely is not there. Measured across rings 1-16:
//
//     schedule                 isotropy      slots at ring 1
//     cube 6N (production)     1.05 - 1.05   6
//     innerSlots 6,  tight     0.59 - 1.05   6
//     innerSlots 12, tight     0.29 - 0.52   12
//     innerSlots 24, banded    0.26 - 1.57   24
//
// Cube scores a flat 1.05 by construction and cannot be beaten on cell shape;
// that is the whole reason hex grids exist, and it is the real thing a polar
// migration trades away. The only honest lever for inner detail is RADIAL —
// closer ring spacing near the core — not angular, and that is a separate
// question this spike does not answer.
export interface SlotSchedule {
  innerSlots: number
  doubleAt: number[]
}

// Doubling bands chosen so no band spans more than a factor of two in radius
// (1, 2, 3-4, 5-8, 9-16, 17+), which is what keeps the aspect ratio inside
// 0.59-1.05 — the closest a banded polar schedule gets to cube's flat 1.05.
export const TIGHT_BANDS = [2, 3, 5, 9, 17]

export const DEFAULT_SCHEDULE: SlotSchedule = { innerSlots: 6, doubleAt: TIGHT_BANDS }

// The schedules worth comparing on the bench. "Inner-dense" is the tempting
// one and the instructive one: it really does give ring 1 four times the cells,
// and they really are unusable slivers.
export const SCHEDULE_PRESETS: Record<string, SlotSchedule> = {
  Isotropic: { innerSlots: 6, doubleAt: TIGHT_BANDS },
  Balanced: { innerSlots: 12, doubleAt: [3, 5, 9, 17] },
  'Inner-dense': { innerSlots: 24, doubleAt: [5, 13] },
}

// Radial spacing, in board pixels. Matched to lib/hex's HEX_SIZE 34 so the
// bench can draw both lattices in one viewBox at the same scale: hex ring N's
// CORNER sits at N*sqrt3*34, which is where polar ring N sits exactly.
export const RADIAL_UNIT = 34 * Math.sqrt(3)

const TAU = Math.PI * 2

// slotsForRing is the schedule applied. Ring 0 is the core: one cell, no angle.
export function slotsForRing(ring: number, sched: SlotSchedule = DEFAULT_SCHEDULE): number {
  if (ring <= 0) return 1
  let n = sched.innerSlots
  for (const boundary of sched.doubleAt) {
    if (ring >= boundary) n *= 2
  }
  return n
}

// hexSlotsForRing is what the CUBE lattice gives on the same ring — the
// comparator the bench draws against. Ring N has exactly 6N hexes.
export function hexSlotsForRing(ring: number): number {
  return ring <= 0 ? 1 : 6 * ring
}

// normalizeSlot wraps a raw slot index into [0, slots).
export function normalizeSlot(slot: number, slots: number): number {
  return ((slot % slots) + slots) % slots
}

// cellAspect is a cell's tangential extent divided by its radial extent. 1.0 is
// square; the schedule's job is keeping this near 1 across the whole board.
export function cellAspect(ring: number, sched: SlotSchedule = DEFAULT_SCHEDULE): number {
  if (ring <= 0) return 1
  return (TAU * ring) / slotsForRing(ring, sched)
}

// isotropy reports the worst tangential:radial stretch across the board — the
// one number that says whether a slot schedule is any good. Hex scores a flat
// 1.0 by construction (that is the whole reason hex grids exist); a doubling
// schedule trades some of that for resolution where the content is.
export function isotropy(maxRing: number, sched: SlotSchedule = DEFAULT_SCHEDULE): { min: number; max: number } {
  let min = Infinity
  let max = 0
  for (let ring = 1; ring <= maxRing; ring++) {
    const a = cellAspect(ring, sched)
    if (a < min) min = a
    if (a > max) max = a
  }
  return { min: min === Infinity ? 1 : min, max: max === 0 ? 1 : max }
}

// cellCount is the board's total cell census — the polar/hex comparison the
// bench prints, since a doubling schedule spends cells differently than 6N.
export function cellCount(maxRing: number, sched: SlotSchedule = DEFAULT_SCHEDULE): number {
  let n = 1
  for (let ring = 1; ring <= maxRing; ring++) n += slotsForRing(ring, sched)
  return n
}

export function hexCellCount(maxRing: number): number {
  return 1 + 3 * maxRing * (maxRing + 1)
}

// --- projection --------------------------------------------------------------

// slotAngle is a cell's angle in radians. Ring 0 has no angle; callers that
// need one for the core must supply it from the other endpoint.
export function slotAngle(cell: PolarCell, sched: SlotSchedule = DEFAULT_SCHEDULE): number {
  if (cell.ring <= 0) return 0
  return (TAU * cell.slot) / slotsForRing(cell.ring, sched)
}

// polarToPoint projects a CONTINUOUS (ring, angle) to board pixels — the
// render path. A body's radius here is exactly ring*unit at every angle, which
// is claim 1.
export function polarToPoint(ring: number, angle: number, unit: number = RADIAL_UNIT): Point {
  return { x: ring * unit * Math.cos(angle), y: ring * unit * Math.sin(angle) }
}

// cellToPoint projects a quantized cell to its centre in board pixels.
export function cellToPoint(
  cell: PolarCell,
  sched: SlotSchedule = DEFAULT_SCHEDULE,
  unit: number = RADIAL_UNIT,
): Point {
  if (cell.ring <= 0) return { x: 0, y: 0 }
  return polarToPoint(cell.ring, slotAngle(cell, sched), unit)
}

// pointToCell is cellToPoint's inverse — the picking path (click -> cell).
// Render-side only; no rule ever feeds through it.
export function pointToCell(
  p: Point,
  sched: SlotSchedule = DEFAULT_SCHEDULE,
  unit: number = RADIAL_UNIT,
): PolarCell {
  const ring = Math.max(0, Math.round(Math.hypot(p.x, p.y) / unit))
  if (ring === 0) return { ring: 0, slot: 0 }
  const slots = slotsForRing(ring, sched)
  let angle = Math.atan2(p.y, p.x)
  if (angle < 0) angle += TAU
  return { ring, slot: normalizeSlot(Math.round((angle / TAU) * slots), slots) }
}

// --- orbits ------------------------------------------------------------------

// PolarOrbit mirrors lib/hex `Orbit`: angle0 is the SLOT index at the world
// epoch, period is world-ms for one revolution, dir is +1/-1. Same shape, same
// storage cost — a polar migration does not change what a body persists.
export interface PolarOrbit {
  ring: number
  angle0: number
  period: number
  dir: number
}

// orbCellAt is the quantized position — claim 3. Integer BigInt truncating
// division, byte-identical to what a Go int64 mirror would produce, exactly as
// lib/hex `orbState` does it. No trig, no float, nothing to disagree about
// across the seam.
export function orbCellAt(o: PolarOrbit, worldTime: number, sched: SlotSchedule = DEFAULT_SCHEDULE): PolarCell {
  if (o.ring <= 0) return { ring: 0, slot: 0 }
  const slots = slotsForRing(o.ring, sched)
  let idx = o.angle0
  if (o.period > 0) {
    const dir = o.dir === 0 ? 1 : o.dir
    const advanced = (BigInt(Math.trunc(worldTime)) * BigInt(slots)) / BigInt(Math.trunc(o.period))
    idx = o.angle0 + dir * Number(advanced)
  }
  return { ring: o.ring, slot: normalizeSlot(idx, slots) }
}

// orbAngleAt is the CONTINUOUS angle for the same orbit — the render-side
// glide between cells ("quantize the simulation, interpolate the picture").
// Uniform angular rate on a fixed radius: no breathing, no six-fold speed
// ripple. This is the function the bench animates.
export function orbAngleAt(o: PolarOrbit, worldTime: number, sched: SlotSchedule = DEFAULT_SCHEDULE): number {
  if (o.ring <= 0) return 0
  const slots = slotsForRing(o.ring, sched)
  const dir = o.dir === 0 ? 1 : o.dir
  const revolutions = o.period > 0 ? (worldTime / o.period) * dir : 0
  return TAU * (o.angle0 / slots + revolutions)
}

// --- paths -------------------------------------------------------------------

// shortWay wraps an angle delta into (-PI, PI] so a transfer always sweeps the
// near side. Sweeping the long way is a legitimate manoeuvre but never the
// default one.
export function shortWay(delta: number): number {
  let d = delta
  while (d > Math.PI) d -= TAU
  while (d <= -Math.PI) d += TAU
  return d
}

// arcPath is claim 2 — the lattice's straight line, which is a spiral.
//
// Structurally identical to lib/hex `line`: lerp the endpoints, round each
// sample to a cell, emit the contiguous run. The ONLY difference is the space
// being interpolated. Cube lerp gives a chord with a staircase; (ring, angle)
// lerp gives a transfer arc.
//
// Sampling is dense enough (sub-cell steps) that consecutive emitted cells are
// always neighbours — `isAdjacent` asserts it in the tests — so no gap-stitch
// pass is needed. Ring 0 endpoints inherit the other end's angle, which makes a
// departure from the star purely radial.
export function arcPath(from: PolarCell, to: PolarCell, sched: SlotSchedule = DEFAULT_SCHEDULE): PolarCell[] {
  if (from.ring === to.ring && from.slot === to.slot) return [{ ...from }]

  const angleFrom = from.ring === 0 ? slotAngle(to, sched) : slotAngle(from, sched)
  const angleTo = to.ring === 0 ? angleFrom : slotAngle(to, sched)
  const sweep = shortWay(angleTo - angleFrom)

  // Sample ONCE PER CELL the path must cross, not per pixel. Oversampling
  // looks harmless and is not: it emits the ring change and the slot change as
  // two separate cells instead of one diagonal step, which turns a shallow
  // descent into a 90-degree sawtooth. Measured on the bench's inbound-transfer
  // case, dense sampling scores 121 degrees of max turn and per-cell scores 94.
  const meanRing = (from.ring + to.ring) / 2
  const radialCells = Math.abs(to.ring - from.ring)
  const tangentialCells = (Math.abs(sweep) / TAU) * slotsForRing(Math.max(1, Math.round(meanRing)), sched)
  const steps = Math.max(2, Math.ceil(Math.max(radialCells, tangentialCells)))

  const out: PolarCell[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ring = Math.round(from.ring + (to.ring - from.ring) * t)
    const angle = angleFrom + sweep * t
    let cell: PolarCell
    if (ring <= 0) {
      cell = { ring: 0, slot: 0 }
    } else {
      const slots = slotsForRing(ring, sched)
      cell = { ring, slot: normalizeSlot(Math.round((angle / TAU) * slots), slots) }
    }
    const last = out[out.length - 1]
    if (!last || last.ring !== cell.ring || last.slot !== cell.slot) out.push(cell)
  }
  // Sampling rounds toward the endpoint but is not guaranteed to land ON it.
  const tail = out[out.length - 1]
  if (tail.ring !== to.ring || tail.slot !== to.slot) out.push({ ...to })
  return out
}

// isAdjacent — the contiguity predicate. Cells touch when they are within one
// ring of each other and their angular gap is within about one cell width of
// the COARSER ring (the ring with fewer slots spans more angle per cell).
export function isAdjacent(a: PolarCell, b: PolarCell, sched: SlotSchedule = DEFAULT_SCHEDULE): boolean {
  if (Math.abs(a.ring - b.ring) > 1) return false
  if (a.ring === 0 || b.ring === 0) return Math.abs(a.ring - b.ring) <= 1
  const coarser = Math.min(slotsForRing(a.ring, sched), slotsForRing(b.ring, sched))
  const gap = Math.abs(shortWay(slotAngle(a, sched) - slotAngle(b, sched)))
  return gap <= (TAU / coarser) * 1.01
}

// --- path metrics ------------------------------------------------------------
//
// These are the bench's scoreboard, and they work on ANY lattice's path once
// it has been projected to points — which is what makes the polar/hex
// comparison a measurement rather than a vibe.

export function pathPoints(
  path: PolarCell[],
  sched: SlotSchedule = DEFAULT_SCHEDULE,
  unit: number = RADIAL_UNIT,
): Point[] {
  return path.map((c) => cellToPoint(c, sched, unit))
}

// pathLength is the traversed distance in board pixels. Divided by RADIAL_UNIT
// it is "tiles" — and the delta-v budget a burn would have to buy. An arc is
// longer than the chord between the same endpoints, so every movement tuning
// number moves with this: the bench prints both so the cost is visible up front.
export function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return total
}

// maxTurnDeg is THE readout — the sharpest heading change anywhere along the
// path, in degrees. It is the direct measurement of the complaint that started
// this spike. A cube-lattice line staircases between two of the six axial
// directions and scores ~60; a star-avoiding detour scores worse. An arc path
// should score in the single digits, bounded by how finely the ring is sliced.
export function maxTurnDeg(points: Point[]): number {
  let worst = 0
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i].x - points[i - 1].x
    const ay = points[i].y - points[i - 1].y
    const bx = points[i + 1].x - points[i].x
    const by = points[i + 1].y - points[i].y
    if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) continue
    const turn = Math.abs(shortWay(Math.atan2(by, bx) - Math.atan2(ay, ax)))
    if (turn > worst) worst = turn
  }
  return (worst * 180) / Math.PI
}

// coreCrossings counts how many times a path passes through the star. A polar
// path can only do this when an endpoint IS the core — which is why
// `routeAround` has no polar equivalent to port.
export function coreCrossings(path: PolarCell[]): number {
  return path.filter((c) => c.ring === 0).length
}

// smoothPath is Chaikin corner-cutting: each iteration replaces every vertex
// with two points a quarter in from its neighbours, converging on a quadratic
// B-spline. It is the render-side companion to any lattice — the "quantize the
// simulation, interpolate the picture" half — and it is deliberately here
// rather than in a renderer because the bench needs to apply the SAME
// treatment to both lattices to compare them fairly.
//
// Why it matters to the comparison: raw cell centres staircase on EVERY
// lattice, so max turn measured on them scores the quantizer, not the
// trajectory. Cube alternates between two of six axial directions and scores a
// flat 60 degrees on every order. Polar scores 4 on a tangential sweep and 94
// on a steep radial descent. Only after the same smoothing do you see what the
// player would actually see, which is the number worth arguing about.
export function smoothPath(points: Point[], iterations = 3): Point[] {
  let current = points
  for (let k = 0; k < iterations; k++) {
    if (current.length < 3) return current
    const next: Point[] = [current[0]]
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i]
      const b = current[i + 1]
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}
