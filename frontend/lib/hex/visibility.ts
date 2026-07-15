// Line-of-sight + scan-beam geometry — the client mirror of
// backend/board/visibility.go (#0006 Decisions #15/#16: large bodies shadow
// everything strictly behind them, for the aimed beam and the ambient bubble
// alike; the beam is a hex-line spine widened with distance). Pinned against
// /fixtures/board/cases.json — port the Go arithmetic exactly.

import { type Hex, line, ringOf, ringHexes } from './hex'

// hexKey is the canonical string key for hex sets/maps ("q,r").
export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`
}

// lineOfSight reports whether target is visible from origin given the set of
// occluding hexes (as hexKey strings). Blocked iff an occluder sits STRICTLY
// between the two on the hex line — the endpoints never block themselves, so
// the first body on a line is itself seen (you see the planet, not past it).
export function lineOfSight(origin: Hex, target: Hex, occluders: ReadonlySet<string>): boolean {
  if (occluders.size === 0) return true
  const path = line(origin, target)
  for (let i = 1; i < path.length - 1; i++) {
    if (occluders.has(hexKey(path[i]))) return false
  }
  return true
}

// BeamParams tunes the scan beam's corridor: half-width at spine index i is
// halfWidthBase + trunc(spread·i) — a narrow cone that grows with distance.
export interface BeamParams {
  halfWidthBase: number
  spread: number
  rimRing: number
}

// beamHexes returns the beam corridor's hex set, sorted (q, then r) to match
// the Go golden byte-for-byte. The spine is the hex line from origin through
// aim, extended until it leaves the rim; membership is pure geometry —
// occlusion is lineOfSight's job, composed by the caller. An aim on the origin
// has no direction and yields an empty beam.
export function beamHexes(origin: Hex, aim: Hex, p: BeamParams): Hex[] {
  if (origin.q === aim.q && origin.r === aim.r) return []
  // Extend the aim direction far past the rim (cube coords are linear in q/r,
  // so axial extension matches Go's cube extension exactly), then walk the
  // spine outward. Ring-along-a-line is convex, so once the spine leaves the
  // rim it never re-enters.
  const k = 4 * p.rimRing + 1
  const far: Hex = {
    q: origin.q + (aim.q - origin.q) * k,
    r: origin.r + (aim.r - origin.r) * k,
  }
  const set = new Map<string, Hex>()
  const spine = line(origin, far)
  for (let i = 0; i < spine.length; i++) {
    const s = spine[i]
    if (ringOf(s) > p.rimRing) break
    // Go: HalfWidthBase + int(Spread·i) — int() truncates toward zero.
    const w = p.halfWidthBase + Math.trunc(p.spread * i)
    for (const h of neighborhood(s, w)) {
      if (ringOf(h) <= p.rimRing) set.set(hexKey(h), h)
    }
  }
  const out = [...set.values()]
  out.sort((a, b) => (a.q !== b.q ? a.q - b.q : a.r - b.r))
  return out
}

// neighborhood returns every hex within the given radius of center (radius 0
// is just the center) — the filled disc, walked ring by ring in ringHexes'
// stable order.
export function neighborhood(center: Hex, radius: number): Hex[] {
  if (radius <= 0) return [{ q: center.q, r: center.r }]
  const out: Hex[] = [{ q: center.q, r: center.r }]
  for (let ring = 1; ring <= radius; ring++) {
    for (const h of ringHexes(ring)) {
      out.push({ q: center.q + h.q, r: center.r + h.r })
    }
  }
  return out
}
