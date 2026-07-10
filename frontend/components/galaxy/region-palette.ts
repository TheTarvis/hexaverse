// Region colour palette — THE documented raw-hex exception (spec #0002,
// "Styling & colors").
//
// three.js sprite/line materials take colour *strings*, not Tailwind classes,
// so the graph layer cannot use the repo's class-based colour system. This one
// small module is the deliberate, isolated exception to the no-raw-hex rule the
// `/check` colour validator enforces — keep ALL raw galaxy colours here, shared
// by the graph materials AND the panel region-dots so they never drift.
//
// (raw hex is intentional in this module; see above.)

import type { Region } from '@/lib/types/galaxy'

export interface RegionStyle {
  label: string
  /** Base colour string for graph materials and panel dots. */
  color: string
  /** Relative node size weight (star-rich largest -> dead smallest). */
  size: number
}

export const REGION_PALETTE: Record<Region, RegionStyle> = {
  star_rich: { label: 'Star-rich', color: '#ffd27d', size: 1.0 }, // gold
  normal: { label: 'Normal', color: '#7dd3fc', size: 0.7 }, // sky
  dead: { label: 'Dead zone', color: '#8b98a9', size: 0.45 }, // slate
  barrier: { label: 'Barrier', color: '#f472b6', size: 0.6 }, // magenta
}

export const REGIONS = Object.keys(REGION_PALETTE) as Region[]

export function regionColor(region: Region): string {
  return REGION_PALETTE[region].color
}

/** Translucent variant of a region colour (for pill backgrounds). */
export function regionColorAlpha(region: Region, alpha: number): string {
  const hex = REGION_PALETTE[region].color.slice(1)
  const n = parseInt(hex, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
