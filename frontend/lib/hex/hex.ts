// Axial/cube hex math — the client mirror of backend/board/hex.go.
//
// This module is one side of a determinism seam: the Go backend owns the same
// math, and /fixtures/board/cases.json is the recorded contract both sides must
// reproduce byte-for-byte (see fixtures.test.ts). Every function here is ported
// from the Go arithmetic exactly — do NOT swap in a "more idiomatic" JS
// primitive without checking it against the golden, because small rounding
// differences silently drift the two implementations apart.

// Hex is an axial board coordinate (redblobgames convention). The star sits at
// (0,0); a hex's ring is its distance from the star.
export interface Hex {
  q: number
  r: number
}

interface Cube {
  x: number
  y: number
  z: number
}

// Field order mirrors Go's Hex.toCube: x = q, z = r, y = -q-r (x+y+z == 0).
function toCube(h: Hex): Cube {
  return { x: h.q, y: -h.q - h.r, z: h.r }
}

function cubeToHex(c: Cube): Hex {
  // Normalize -0 → 0: cubeRound's `-rx - ry` can yield JS negative zero, which
  // Go's integer math never produces and Vitest's toEqual treats as unequal to
  // +0. Collapsing it here keeps hexes comparable against the Go golden.
  return { q: nz(c.x), r: nz(c.z) }
}

// nz maps negative zero to positive zero (leaves every other value untouched).
function nz(n: number): number {
  return n === 0 ? 0 : n
}

// The six axial directions in cube space, in the FIXED order the backend walks
// them (board/hex.go). A stored ring-position index (Orbit.angle0) only refers
// to the same hex on both sides if this order is byte-identical.
const cubeDirections: Cube[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
]

// roundf mirrors Go's board.roundf: round half AWAY from zero (Go's int()
// conversion truncates toward zero after a +0.5 nudge). This DIFFERS from
// Math.round at negative halves — roundf(-2.5) === -3 where Math.round(-2.5)
// === -2 — and using Math.round in cubeRound would drift line() paths off the
// Go side at exact half cube-coordinates. Ported deliberately, tested explicitly.
export function roundf(f: number): number {
  return f < 0 ? -Math.trunc(-f + 0.5) : Math.trunc(f + 0.5)
}

// Distance is the hex (ring) distance between two hexes.
export function distance(a: Hex, b: Hex): number {
  const ac = toCube(a)
  const bc = toCube(b)
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2
}

// ringOf is a hex's distance from the centre (Go: board.Ring).
export function ringOf(h: Hex): number {
  return distance({ q: 0, r: 0 }, h)
}

// ringHexes returns the hexes on a ring, walked in the fixed order above so a
// stored angle index is stable across Go and TS.
export function ringHexes(ring: number): Hex[] {
  if (ring <= 0) return [{ q: 0, r: 0 }]
  const out: Hex[] = []
  let c: Cube = {
    x: cubeDirections[4].x * ring,
    y: cubeDirections[4].y * ring,
    z: cubeDirections[4].z * ring,
  }
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < ring; step++) {
      out.push(cubeToHex(c))
      c = {
        x: c.x + cubeDirections[side].x,
        y: c.y + cubeDirections[side].y,
        z: c.z + cubeDirections[side].z,
      }
    }
  }
  return out
}

// line returns the contiguous hex line from a to b (inclusive of both ends)
// using cube linear interpolation + rounding — the path a burn traverses.
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b)
  if (n === 0) return [{ q: a.q, r: a.r }]
  const ac = toCube(a)
  const bc = toCube(b)
  const out: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push(cubeToHex(cubeRound(lerp(ac.x, bc.x, t), lerp(ac.y, bc.y, t), lerp(ac.z, bc.z, t))))
  }
  return out
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// routeAround returns the burn path from a to b that never crosses the star at the
// core (0,0) — the client mirror of backend/board RouteAround. It's `line` unless
// the straight line would pass through the core, in which case it detours via the
// ring-1 hex beside the star that adds the least distance (ties: the first such
// hex in ringHexes(1) order). If an endpoint IS the core (avoidance impossible),
// it falls back to the direct line. Pinned by /fixtures/board/cases.json.
export function routeAround(a: Hex, b: Hex): Hex[] {
  const direct = line(a, b)
  if (!pathHitsCore(direct)) return direct
  let best: Hex[] | null = null
  for (const wp of ringHexes(1)) {
    const aLeg = line(a, wp)
    const bLeg = line(wp, b)
    if (pathHitsCore(aLeg) || pathHitsCore(bLeg)) continue
    const merged = [...aLeg, ...bLeg.slice(1)]
    if (best === null || merged.length < best.length) best = merged
  }
  return best ?? direct
}

function pathHitsCore(path: Hex[]): boolean {
  return path.some((h) => h.q === 0 && h.r === 0)
}

// cubeRound rounds fractional cube coordinates to the nearest valid hex,
// preserving x+y+z == 0.
function cubeRound(x: number, y: number, z: number): Cube {
  let rx = roundf(x)
  let ry = roundf(y)
  let rz = roundf(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  return { x: rx, y: ry, z: rz }
}
