// Board colour palette — the documented raw-hex exception for the hex-board
// renderer (spec #0007), mirroring components/galaxy/region-palette.ts.
//
// SVG polygon/glyph fills and strokes take colour STRINGS, not Tailwind classes,
// so the board layer cannot use the repo's class-based colour system. This one
// module is the deliberate, isolated exception to the no-raw-hex rule the
// `/check` colour validator enforces — keep ALL raw board colours here, applied
// through SVG `fill=`/`stroke=` attributes so they never drift.
//
// (raw hex is intentional in this module; see above.)

// The four ring bands of a system interior (backend: system.Band).
export type Band = 'core' | 'inner' | 'mid' | 'outer'

export interface BandStyle {
  label: string
  tint: string
}

export const BAND_STYLE: Record<Band, BandStyle> = {
  core: { label: 'Star', tint: '#ffd27d' }, // gold
  inner: { label: 'Inner', tint: '#ff9a5c' }, // hot orange
  mid: { label: 'Mid', tint: '#63e6a8' }, // goldilocks green
  outer: { label: 'Outer', tint: '#6ea0e6' }, // cold blue
}

// Ring → band boundaries. The backend (system/params.go) owns the authoritative
// InnerMaxRing/MidMaxRing; these mirror its defaults so the tint bands read the
// same until the interior read ships the per-system boundaries.
export interface BandBounds {
  innerMaxRing: number
  midMaxRing: number
}

export const DEFAULT_BAND_BOUNDS: BandBounds = { innerMaxRing: 5, midMaxRing: 11 }

export function bandForRing(ring: number, bounds: BandBounds = DEFAULT_BAND_BOUNDS): Band {
  if (ring === 0) return 'core'
  if (ring <= bounds.innerMaxRing) return 'inner'
  if (ring <= bounds.midMaxRing) return 'mid'
  return 'outer'
}

// Expand a #rrggbb tint to an rgba() string at the given alpha.
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// A tile's translucent fill — the mid (goldilocks) band reads slightly warmer so
// the habitable ring is legible at a glance. Base terrain stays dark; the
// astronomical + live layers are what light the board up (fog by subtraction).
export function tileFill(band: Band): string {
  return rgba(BAND_STYLE[band].tint, band === 'mid' ? 0.05 : 0.03)
}

// A tile's faint band-tinted outline.
export function tileStroke(band: Band): string {
  return rgba(BAND_STYLE[band].tint, 0.09)
}
