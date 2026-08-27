// Cell → pixel projection — RENDER-SIDE ONLY, exempt from the integer
// discipline by declaration (openspec board-tactical-math, "Rule-Bearing
// Values Are Integer or Exact Rational": projection of a cell to screen or
// board pixel space may use trig freely because its result is never
// persisted, never a solve result, never an ETA, never a disclosure
// decision). Nothing in this file may be imported by rule-bearing code.
//
// The real renderer work (board SVG, glides, wedge outlines) rides the
// renderer step of the polar migration — this module carries only the basic
// projection the board components will rebuild on.

import { type Schedule, ringRadius, slotsForRing } from '@/lib/polar'
import type { Cell } from './board'

export interface Point {
  x: number
  y: number
}

// RADIAL_UNIT is the default board-pixel spacing between adjacent rings.
export const RADIAL_UNIT = 34

// slotAngle is a cell's angular position in radians (slot / slots turns).
export function slotAngle(c: Cell, s: Schedule): number {
  if (c.ring <= 0) return 0
  return (2 * Math.PI * c.slot) / slotsForRing(c.ring, s)
}

// cellToPoint projects a cell's center to board pixels: the ring's radius
// (uniform spacing unless a radii table is configured) at the slot's angle,
// with screen-down y so the board reads like a map.
export function cellToPoint(c: Cell, s: Schedule, unit: number = RADIAL_UNIT, radii?: number[]): Point {
  const r = ringRadius(c.ring, radii ?? []) * unit
  const a = slotAngle(c, s)
  return { x: Math.cos(a) * r, y: Math.sin(a) * r } // determinism:allow(projection)
}

// pointToCell is cellToPoint's inverse under uniform ring spacing — the
// picking path (click → cell). Rounds to the nearest ring, then the nearest
// slot on that ring.
export function pointToCell(p: Point, s: Schedule, unit: number = RADIAL_UNIT): Cell {
  const r = Math.hypot(p.x, p.y) / unit
  let ring = Math.round(r) // determinism:allow(projection)
  if (ring <= 0) return { ring: 0, slot: 0 }
  if (ring > s.maxRing) ring = s.maxRing
  const slots = slotsForRing(ring, s)
  const angle = Math.atan2(p.y, p.x) // determinism:allow(projection)
  const slot = ((Math.round((angle / (2 * Math.PI)) * slots) % slots) + slots) % slots // determinism:allow(projection)
  return { ring, slot }
}

// lerpPoint interpolates between two projected points — the render glide.
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// boardExtent is the half-width of the square that contains a board of the
// given max ring, with a margin of one radial unit. fitViewBox is expressed in
// terms of it so the string form and the numeric form cannot drift — the
// projection needs the number, the <svg> needs the string.
export function boardExtent(maxRing: number, unit: number = RADIAL_UNIT): number {
  return (maxRing + 1) * unit
}

// fitViewBox is the square SVG viewBox that contains a board of the given
// max ring with a margin of one radial unit.
export function fitViewBox(maxRing: number, unit: number = RADIAL_UNIT): string {
  const half = boardExtent(maxRing, unit)
  return `${-half} ${-half} ${2 * half} ${2 * half}`
}

// Wedge is a cell's drawn footprint: the annular sector bounded by its ring's
// inner and outer radius and by its slot's angular extent. This replaces the
// hex era's `hexPolygonPoints` — a polar cell is not a polygon of fixed shape,
// so consumers get the sector's four bounds and draw them in whatever form
// suits (an SVG path, a shader SDF) rather than a point list.
//
// `angCenter` is in BOARD space (screen-down y), matching slotAngle/cellToPoint.
// A consumer working in GL world space (y up) negates it.
export interface Wedge {
  rInner: number
  rOuter: number
  angCenter: number
  angHalf: number
}

// cellWedge returns the drawn bounds of a cell. Ring 0 — the single core cell —
// is the full disc out to half a radial unit: it has no angular extent to
// bound, so angHalf is a half-turn and the sector degenerates to a circle.
export function cellWedge(c: Cell, s: Schedule, unit: number = RADIAL_UNIT, radii?: number[]): Wedge {
  const half = unit / 2
  if (c.ring <= 0) {
    return { rInner: 0, rOuter: half, angCenter: 0, angHalf: Math.PI }
  }
  const r = ringRadius(c.ring, radii ?? []) * unit
  return {
    rInner: Math.max(0, r - half),
    rOuter: r + half,
    angCenter: slotAngle(c, s),
    angHalf: Math.PI / slotsForRing(c.ring, s),
  }
}

// wedgePath is the SVG path data for a cell's wedge — the direct replacement
// for `hexPolygonPoints`'s <polygon points>. Two arcs joined by two radial
// edges; the core cell degenerates to a pair of half-circle arcs.
export function wedgePath(c: Cell, s: Schedule, unit: number = RADIAL_UNIT, radii?: number[]): string {
  const { rInner, rOuter, angCenter, angHalf } = cellWedge(c, s, unit, radii)
  const a0 = angCenter - angHalf
  const a1 = angCenter + angHalf
  const pt = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(3)} ${(Math.sin(a) * r).toFixed(3)}` // determinism:allow(projection)
  // A full-turn sector (the core) cannot be drawn as one arc — SVG treats
  // identical endpoints as a zero-length arc — so it is split into two halves.
  if (angHalf >= Math.PI) {
    return `M ${pt(rOuter, 0)} A ${rOuter} ${rOuter} 0 1 1 ${pt(rOuter, Math.PI)} A ${rOuter} ${rOuter} 0 1 1 ${pt(rOuter, 0)} Z`
  }
  const large = angHalf * 2 > Math.PI ? 1 : 0
  if (rInner <= 0) {
    return `M 0 0 L ${pt(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, a1)} Z`
  }
  return (
    `M ${pt(rInner, a0)} L ${pt(rOuter, a0)}` +
    ` A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, a1)}` +
    ` L ${pt(rInner, a1)}` +
    ` A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, a0)} Z`
  )
}
