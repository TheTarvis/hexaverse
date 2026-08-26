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

// fitViewBox is the square SVG viewBox that contains a board of the given
// max ring with a margin of one radial unit.
export function fitViewBox(maxRing: number, unit: number = RADIAL_UNIT): string {
  const half = (maxRing + 1) * unit
  return `${-half} ${-half} ${2 * half} ${2 * half}`
}
