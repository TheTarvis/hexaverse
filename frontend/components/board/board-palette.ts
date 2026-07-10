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

import type { FeatureType, FogBand } from '@/lib/types/system-board'
import type { Mode } from '@/lib/hex'

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

// --- glyph + fog treatments (#0006/#0007) ----------------------------------
//
// The base terrain stays dark; the astronomical body layer and the live scan
// bubble are what light the board up (fog by subtraction). These are all raw
// SVG colour strings, so — like the tints above — they live only in this module.

// The drawn shape for each feature family (the FeatureGlyph switches on this).
export type GlyphShape = 'star' | 'disc' | 'giant' | 'belt' | 'moon' | 'diamond' | 'square'

export interface FeatureStyle {
  color: string
  shape: GlyphShape
}

// Per-type glyph colour + shape (the spike's BODY palette, one family).
export const FEATURE_STYLE: Record<FeatureType, FeatureStyle> = {
  star: { color: '#ffd27d', shape: 'star' },
  rocky: { color: '#c8a27a', shape: 'disc' },
  gas_giant: { color: '#e0b877', shape: 'giant' },
  ice: { color: '#bfe6f5', shape: 'disc' },
  belt: { color: '#9aa7b4', shape: 'belt' },
  moon: { color: '#cdd3da', shape: 'moon' },
  anomaly: { color: '#c58bf0', shape: 'diamond' },
  ruin: { color: '#e08b8b', shape: 'square' },
  nebula: { color: '#8bb8f0', shape: 'disc' },
  gravity_well: { color: '#b07de6', shape: 'diamond' },
  debris: { color: '#9aa7b4', shape: 'belt' },
  radiation: { color: '#e6d27d', shape: 'diamond' },
}

// How each fog band paints its glyph (#0006's three bands): live at full strength
// with a live accent; remembered dimmed + ghosted with a frozen `asOf` age;
// astronomical dimmest, geometry + type only.
export interface FogTreatment {
  opacity: number
  ghost: boolean // draw the dashed "last known" ring
  accent: string
  label: string
}

export const FOG_TREATMENT: Record<FogBand, FogTreatment> = {
  visible: { opacity: 1, ghost: false, accent: '#34d399', label: 'LIVE' },
  remembered: { opacity: 0.62, ghost: true, accent: '#fbbf24', label: 'MEMORY' },
  astronomical: { opacity: 0.42, ghost: true, accent: '#8b98a9', label: 'CHARTED' },
}

// A fleet's accent encodes its movement mode: coast cyan, burn amber, docked green.
export const FLEET_ACCENT: Record<Mode, string> = {
  coast: '#7dd3fc',
  burn: '#fbbf24',
  docked: '#34d399',
}

// A foreign fleet's muted snapshot marker (grey — no mode is inferred).
export const FLEET_FOREIGN = '#9aa7b4'

// The lit thruster flame on a burning own fleet (matches the burn accent).
export const THRUSTER = '#fbbf24'

// The white selection outline shared by every selectable glyph.
export const SELECTION_STROKE = '#ffffff'

// The live ambient-sensor bubble that rides own units, and the move/scan preview.
export const SCAN_BUBBLE_FILL = 'rgba(125, 211, 252, 0.06)'
export const SCAN_BUBBLE_STROKE = 'rgba(125, 211, 252, 0.30)'
export const PREVIEW_ROUTE = 'rgba(125, 211, 252, 0.55)'
export const PREVIEW_BURN = '#fbbf24'
export const PREVIEW_MEET = '#fbbf24'
export const ORBIT_RING = 'rgba(150, 180, 220, 0.10)'
export const ORBIT_RING_HILITE = 'rgba(125, 211, 252, 0.55)'
