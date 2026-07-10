// Pixel geometry for the SVG hex board — the render-side companion to lib/hex's
// logical math. Everything here is a VISUAL concern (pointy-top layout, the
// glyph glide, viewBox fitting) and deliberately holds no game rules: lib/hex
// quantizes to the integer hex, this module turns those hexes into screen
// coordinates and interpolates between them so motion reads smooth (#0007:
// "quantize the simulation, interpolate the picture"). Kept out of index.ts so
// the pure logical seam stays free of render concerns.

import type { Hex } from './hex'

// One hex's circumradius in SVG units — the proven spike feel.
export const HEX_SIZE = 34

export interface Point {
  x: number
  y: number
}

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

// Pointy-top axial → pixel centre (redblobgames layout).
export function hexToPixel(q: number, r: number): Point {
  return { x: HEX_SIZE * Math.sqrt(3) * (q + r / 2), y: HEX_SIZE * (3 / 2) * r }
}

// The six vertices of a pointy-top hexagon as an SVG polygon `points` string.
export function hexPolygonPoints(center: Point, size: number = HEX_SIZE - 1): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(center.x + size * Math.cos(angle)).toFixed(2)},${(center.y + size * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(' ')
}

// Linear pixel interpolation between two hexes at frac ∈ [0,1] — the render-time
// glide between logical cells. The logical-hex flip is lib/hex's job; this is
// purely visual and never feeds a rule.
export function lerpPixel(a: Hex, b: Hex, frac: number): Point {
  const pa = hexToPixel(a.q, a.r)
  const pb = hexToPixel(b.q, b.r)
  return { x: pa.x + (pb.x - pa.x) * frac, y: pa.y + (pb.y - pa.y) * frac }
}

// Every hex within `radius` of the star — the filled axial disc that is the
// board's tile set (a centred hexagonal number of tiles: 1 + 3R(R+1)).
export function hexesWithinRadius(radius: number): Hex[] {
  const out: Hex[] = []
  for (let q = -radius; q <= radius; q++) {
    const rLo = Math.max(-radius, -q - radius)
    const rHi = Math.min(radius, -q + radius)
    for (let r = rLo; r <= rHi; r++) out.push({ q, r })
  }
  return out
}

// A viewBox that frames every given hex with padding — the initial board view.
export function fitViewBox(hexes: Hex[], pad: number = HEX_SIZE * 1.4): ViewBox {
  if (hexes.length === 0) return { x: -pad, y: -pad, w: pad * 2, h: pad * 2 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const h of hexes) {
    const p = hexToPixel(h.q, h.r)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}
