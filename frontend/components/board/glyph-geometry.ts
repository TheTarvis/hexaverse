// Glyph geometry — the render-side projection that turns a body's or fleet's
// (elements, worldTime) into a smoothly-glided SVG point (#0007: "quantize the
// simulation, interpolate the picture"). The LOGICAL hex is lib/hex's job (the
// Go-pinned golden — orbState/shipPos); this module only interpolates the picture
// between logical cells so motion reads smooth, including the ring wrap-around.
// Pure and presentational: no clock, no fetch.

import { boardLegBurn, orbState, shipPos, stateAt, type Hex, type MovementState, type Orbit } from '@/lib/hex'
import type { Burn } from '@/lib/hex'
import { hexesWithinRadius, hexToPixel, lerpPixel, type Point } from '@/lib/hex/pixel'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'

// orbitGlidePixel — a body's glided screen point at worldTime: its logical ring
// cell (orbState) slid toward the next cell in its direction of travel, so it
// tracks the ring continuously. Consecutive ring cells are neighbours and the
// last wraps to the first, so the wrap-around glides straight through with no
// special case. A huge-period ("motion off") body sits still.
export function orbitGlidePixel(orbit: Orbit, worldTime: number): Point {
  const steps = 6 * Math.max(orbit.ring, 0)
  const hex = orbState(orbit, worldTime)
  if (steps === 0 || orbit.period <= 0) return hexToPixel(hex.q, hex.r)
  const oneStep = orbit.period / steps // world-ms to cross one ring cell
  const next = orbState(orbit, worldTime + oneStep)
  // No advance this step (e.g. a huge-period "motion off" body) → snap to the
  // cell centre exactly, no sub-pixel drift.
  if (next.q === hex.q && next.r === hex.r) return hexToPixel(hex.q, hex.r)
  const prog = worldTime / oneStep
  const frac = ((prog % 1) + 1) % 1
  return lerpPixel(hex, next, frac)
}

// burnGlidePixel — a fleet's glided screen point along its burn path: linear
// progress by elapsed-fraction of the burn window, interpolated between adjacent
// path cells. Clamped to the endpoints outside the window.
export function burnGlidePixel(burn: Burn, worldTime: number): Point {
  const n = burn.path.length
  if (n === 0) return { x: 0, y: 0 }
  if (n === 1 || worldTime <= burn.startTime || burn.arriveTime <= burn.startTime) {
    return hexToPixel(burn.path[0].q, burn.path[0].r)
  }
  if (worldTime >= burn.arriveTime) return hexToPixel(burn.path[n - 1].q, burn.path[n - 1].r)
  const frac = (worldTime - burn.startTime) / (burn.arriveTime - burn.startTime)
  const cont = frac * (n - 1)
  const i0 = Math.floor(cont)
  const i1 = Math.min(i0 + 1, n - 1)
  return lerpPixel(burn.path[i0], burn.path[i1], cont - i0)
}

// featureLogicalHex — a feature's integer board hex at worldTime (selection,
// readouts, targeting). Star/fixed → centre; orbiting → orbState; parented (moon)
// → the parent's logical hex; otherwise its stored footprint tile.
export function featureLogicalHex(
  f: BoardFeature,
  worldTime: number,
  parentHex?: Hex,
): Hex {
  if (f.fixed) return { q: 0, r: 0 }
  if (f.orbit) return orbState(f.orbit, worldTime)
  if (f.parentId && parentHex) return parentHex
  return f.footprint[0] ?? { q: 0, r: 0 }
}

// featureGlidePixel — a feature's glided screen point. Moons ride their parent's
// glided point (with a small per-index offset so they don't sit exactly on top).
export function featureGlidePixel(
  f: BoardFeature,
  worldTime: number,
  parentPixel?: Point,
  moonIndex = 0,
): Point {
  if (f.fixed) return hexToPixel(0, 0)
  if (f.orbit) return orbitGlidePixel(f.orbit, worldTime)
  if (f.parentId && parentPixel) {
    const angle = (Math.PI / 3) * moonIndex
    return { x: parentPixel.x + Math.cos(angle) * 14, y: parentPixel.y + Math.sin(angle) * 14 }
  }
  const h = f.footprint[0] ?? { q: 0, r: 0 }
  return hexToPixel(h.q, h.r)
}

// Every fleet helper below positions from the EFFECTIVE state (stateAt): a
// payload burn whose arrival passes while it sits in the query cache IS the
// coast (or dock) it settled into, from the instant it arrives. Deriving from
// the raw wire state froze an arrived ship on its last path hex until the next
// refetch — the ship sat still while the whole system turned around it.

// fleetDockedParentId — the feature a fleet rides at worldTime, if any: its
// stored dock, or the dock a finished dock-on-arrive burn has settled into.
// Components resolve parent hex/pixel through this, never from raw state.
export function fleetDockedParentId(fleet: Fleet, worldTime: number): string | undefined {
  const s = stateAt(fleet.state, worldTime)
  return s.mode === 'docked' ? s.docked?.parentId : undefined
}

// fleetLogicalHex — a fleet's integer board hex at worldTime. Docked rides the
// resolved parent hex; coast/burn come from shipPos (the golden).
export function fleetLogicalHex(fleet: Fleet, worldTime: number, parentHex?: Hex): Hex {
  const s = stateAt(fleet.state, worldTime)
  if (s.mode === 'docked') return parentHex ?? fleet.position
  const { hex } = shipPos(s, worldTime)
  return hex
}

// fleetOnBoard reports whether a fleet has a hex on THIS system's board at
// worldTime — false once a trip passes its departure gate (it's out on a lane
// now, the galaxy view's to draw). Callers must check it before positioning a
// fleet: shipPos's off-board answer is (0,0), which would otherwise plant the
// ship on the star.
export function fleetOnBoard(fleet: Fleet, worldTime: number): boolean {
  const s = stateAt(fleet.state, worldTime)
  if (s.mode === 'docked') return true
  return shipPos(s, worldTime).ok
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
  parentPixel?: Point,
): Point {
  const s: MovementState = stateAt(fleet.state, worldTime)
  if (s.mode === 'docked') return parentPixel ?? hexToPixel(fleet.position.q, fleet.position.r)
  if (s.mode === 'burn' && s.burn) return burnGlidePixel(s.burn, worldTime)
  if (s.mode === 'coast' && s.coast) return orbitGlidePixel(s.coast, worldTime)
  if (s.mode === 'laneTransit' && s.laneTransit) {
    const leg = boardLegBurn(s.laneTransit)
    if (leg) return burnGlidePixel(leg, worldTime)
  }
  const { hex } = shipPos(s, worldTime)
  return hexToPixel(hex.q, hex.r)
}

// sensorBubbleHexes — the deduped union of every hex within `radius` of any
// centre: the live ambient-sensor footprint the board draws around own units
// (#0006 AmbientRadius). Centres are the units' current logical hexes.
export function sensorBubbleHexes(centers: Hex[], radius: number): Hex[] {
  const disc = hexesWithinRadius(radius)
  const seen = new Set<string>()
  const out: Hex[] = []
  for (const c of centers) {
    for (const d of disc) {
      const h = { q: c.q + d.q, r: c.r + d.r }
      const key = `${h.q},${h.r}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(h)
    }
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
