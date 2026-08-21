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

// How each fog band paints its glyph (#0006's three bands) — ONE record, both
// renderers' fields merged (port-board-to-webgl-renderer, "the fog-record
// merge"): `opacity`/`ghost` are the SVG-era expression, `dim`/`chroma`/
// `breakUp`/`wireOnly` feed the WebGL body shader. The merge is pinned, not a
// free import of the spike's tuned values: `remembered` and `visible` carry
// `chroma: 0, breakUp: 0` — opacity-only, matching the SVG treatment exactly.
// The signal-quality look (non-zero chroma/breakUp, animated dropout) is
// deferred, named, to docs/plans/board-visual-language.md. `wireOnly: true` on
// `astronomical` is the port's ONE deliberate visual change (predicted outline,
// no lit surface — confirmed 2026-08-20).
export interface FogTreatment {
  opacity: number
  ghost: boolean // draw the dashed "last known" ring
  dim: number // radiance scale in the body shader
  chroma: number // per-channel light-direction split (0 = registered)
  breakUp: number // scanline dropout amount (0 = none)
  wireOnly: boolean // draw only the predicted outline, no lit surface
  accent: string
  label: string
}

export const FOG_TREATMENT: Record<FogBand, FogTreatment> = {
  visible: { opacity: 1, ghost: false, dim: 1, chroma: 0, breakUp: 0, wireOnly: false, accent: '#34d399', label: 'LIVE' },
  remembered: { opacity: 0.62, ghost: true, dim: 0.5, chroma: 0, breakUp: 0, wireOnly: false, accent: '#fbbf24', label: 'MEMORY' },
  astronomical: { opacity: 0.42, ghost: true, dim: 0.3, chroma: 0, breakUp: 0, wireOnly: true, accent: '#8b98a9', label: 'CHARTED' },
}

// A fleet's accent encodes its movement mode: coast cyan, burn amber, docked green.
// The graph-tier modes (laneTransit/laneHold, #0008) don't render on the board —
// a transiting fleet is out on a lane, not on any hex — but the map is total, so
// they reuse the coast accent for the brief board-leg window before the gate.
export const FLEET_ACCENT: Record<Mode, string> = {
  coast: '#7dd3fc',
  burn: '#fbbf24',
  docked: '#34d399',
  laneTransit: '#7dd3fc',
  laneHold: '#8b98a9',
}

// A foreign fleet's muted snapshot marker (grey — no mode is inferred).
export const FLEET_FOREIGN = '#9aa7b4'

// A lane gate on the rim (#0008) — a cool violet-blue, distinct from the cyan
// fleet/sensor accents so an exit doesn't read as a unit or a scan.
export const GATE_ACCENT = '#8ab4f8'

// The lit thruster flame on a burning own fleet (matches the burn accent).
export const THRUSTER = '#fbbf24'

// The white selection outline shared by every selectable glyph.
export const SELECTION_STROKE = '#ffffff'

// The live ambient-sensor bubble that rides own units, and the move/scan preview.
export const SCAN_BUBBLE_FILL = 'rgba(125, 211, 252, 0.06)'
export const SCAN_BUBBLE_STROKE = 'rgba(125, 211, 252, 0.30)'

// The scan effects (ScanPing live; ArcScan kept as a future variant): the
// bright beam head, its soft wide underlay, and the leading blade wedge — all
// the sensor cyan family. (Motion knobs live with the math: scan-ping.ts
// PING_TUNING / arc-scan.ts ARC_TUNING.)
export const SCAN_SWEEP_BEAM = 'rgba(125, 211, 252, 0.9)'
export const SCAN_SWEEP_BEAM_HALO = 'rgba(125, 211, 252, 0.22)'
export const SCAN_SWEEP_BLADE = 'rgba(125, 211, 252, 0.10)'
// THE pulse ring (#0006 Decision #26): one ring, pinned at the emission hex,
// pacing the returns — bright at the muzzle, thinning as it nears the rim.
export const SCAN_PING_PULSE = 'rgba(125, 211, 252, 0.75)'
// A body's echo-return blip the instant its echo arrives.
export const SCAN_ECHO_RETURN = 'rgba(125, 211, 252, 0.85)'

// A swept cell's glow at the beam head (glow 1), fading to nothing with lag.
const SWEEP_GLOW_TINT = '#7dd3fc'
const SWEEP_GLOW_FILL_ALPHA = 0.18
const SWEEP_GLOW_STROKE_ALPHA = 0.35

// A swept cell's glow, scaled by how recently the beam passed (glow ∈ [0,1]).
export function sweepGlowFill(glow: number): string {
  return rgba(SWEEP_GLOW_TINT, SWEEP_GLOW_FILL_ALPHA * glow)
}
export function sweepGlowStroke(glow: number): string {
  return rgba(SWEEP_GLOW_TINT, SWEEP_GLOW_STROKE_ALPHA * glow)
}
export const PREVIEW_ROUTE = 'rgba(125, 211, 252, 0.55)'
export const PREVIEW_BURN = '#fbbf24'
export const PREVIEW_MEET = '#fbbf24'
export const ORBIT_RING = 'rgba(150, 180, 220, 0.10)'
export const ORBIT_RING_HILITE = 'rgba(125, 211, 252, 0.55)'

// --- WebGL board constants (port-board-to-webgl-renderer) --------------------

// Space itself — the canvas clear colour. Not pure black: a black board reads
// as "unrendered", a very dark blue reads as "deep". Deliberately DISTINCT from
// SystemBoardView's stage background (#05070d) — do not conflate the two.
export const VOID = '#04060c'

// The live sensor cyan the lattice's uSignal and the fleet trail's cool end
// share (the same hue family as SCAN_BUBBLE_* above).
export const SIGNAL = '#7dd3fc'

// Own-fleet hull white — the clean, readable chevron the ship is clicked by.
export const HULL = '#e6eef8'

// Spectral class → star colour temperature (O/B blue-white through M deep
// orange). A decision on server data (`starClass`), so it lives here, not in
// the star shader (the plumbing/decision rule).
export const CLASS_TINT: Record<string, string> = {
  O: '#a8c8ff',
  B: '#c5daff',
  A: '#e8f0ff',
  F: '#fff4e8',
  G: '#ffd27d',
  K: '#ffb05c',
  M: '#ff8347',
}
export const CLASS_TINT_FALLBACK = '#ffd27d'

export function starTint(starClass: string): string {
  return CLASS_TINT[starClass] ?? CLASS_TINT_FALLBACK
}
