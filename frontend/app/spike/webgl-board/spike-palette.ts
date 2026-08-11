// SPIKE (throwaway) — the emissive palette for the WebGL board.
//
// Deliberately the SAME HUES as components/board/board-palette.ts. That is the
// whole point of the comparison: if the WebGL board reads as less flat, it is
// not because the colours changed, it is because the renderer gained lighting,
// depth, and bloom. What differs here is INTENT — these values are treated as
// light emitted into a dark scene (HDR-ish, fed through a bloom threshold), not
// as flat SVG fills, so the accents sit above 1.0 where they should blow out.
//
// (raw hex is intentional in this module, mirroring the board-palette exception)

// --- the ground ---------------------------------------------------------------

// Space itself. Not pure black — a black board reads as "unrendered", a very
// dark blue reads as "deep". The starfield and nebula sit on top of this.
export const VOID = '#04060c'

// --- the band tints (identical hues to board-palette BAND_STYLE) --------------

export const BAND_TINT = {
  core: '#ffd27d', // gold — the star's own ring
  inner: '#ff9a5c', // hot orange
  mid: '#63e6a8', // goldilocks green
  outer: '#6ea0e6', // cold blue
} as const

export type Band = keyof typeof BAND_TINT

export function bandForRing(ring: number, innerMax = 5, midMax = 11): Band {
  if (ring === 0) return 'core'
  if (ring <= innerMax) return 'inner'
  if (ring <= midMax) return 'mid'
  return 'outer'
}

// --- body colours (identical to board-palette FEATURE_STYLE) ------------------

export const BODY_COLOR = {
  star: '#ffd27d',
  rocky: '#c8a27a',
  gas_giant: '#e0b877',
  ice: '#bfe6f5',
  belt: '#9aa7b4',
  moon: '#cdd3da',
  anomaly: '#c58bf0',
  ruin: '#e08b8b',
} as const

// --- the sensor family (identical to board-palette's cyan accents) ------------

export const SIGNAL = '#7dd3fc' // live sensor cyan
export const MEMORY = '#fbbf24' // remembered amber
export const CHARTED = '#8b98a9' // astronomical grey
export const THRUSTER = '#fbbf24' // burn flame
export const HULL = '#e6eef8' // own-fleet hull

// --- fog treatment ------------------------------------------------------------
//
// THE SIGNATURE OF THIS SPIKE. The production board expresses fog as opacity
// alone (FOG_TREATMENT: 1.0 / 0.62 / 0.42). Here fog is expressed as SIGNAL
// QUALITY, because that is what the fiction actually is — you are not looking at
// a map, you are looking at a picture reassembled from light that already
// arrived. So:
//
//   visible      — full radiance, crisp terminator, blooms hot.
//   remembered   — dimmed AND degraded: per-channel offset (the reconstruction
//                  no longer registers), scanline break-up, a dashed predicted
//                  orbit where the body is *expected* to be.
//   astronomical — no surface at all: an unfilled predicted circle. You know the
//                  geometry because it is astronomy; you know nothing else.
//
// `chroma` and `break` feed the body shader; `dim` scales radiance.
export interface FogTreatment {
  dim: number
  chroma: number // per-channel light-direction split (0 = registered)
  breakUp: number // scanline dropout amount
  wireOnly: boolean // draw only the predicted outline, no lit surface
  accent: string
  label: string
}

export const FOG: Record<'visible' | 'remembered' | 'astronomical', FogTreatment> = {
  visible: { dim: 1, chroma: 0, breakUp: 0, wireOnly: false, accent: SIGNAL, label: 'LIVE' },
  remembered: { dim: 0.5, chroma: 0.16, breakUp: 0.35, wireOnly: false, accent: MEMORY, label: 'MEMORY' },
  astronomical: { dim: 0.3, chroma: 0, breakUp: 0, wireOnly: true, accent: CHARTED, label: 'CHARTED' },
}

// Note on gain: the "emit past 1.0" idea is applied in the shaders themselves
// (scene-bodies' star core, scene-fleet's plume), not through a helper here —
// each surface knows how far over the bloom threshold it wants to sit, and
// putting a knob in the palette would only hide that decision one level away.
