// scan-preview — the sweep-coverage math behind the scan overlays (#0006
// Decisions #16/#21): from an origin, the 360° sweep reaches everything with
// clear line of sight; large bodies cast shadows. The overlay's job is the
// SHADOW — the cells a scan from here would NOT reveal — since the sweep
// covers everything else. Pure math; rendering lives in ScanOverlay, the
// authoritative reveal on the server.

import { hexKey, lineOfSight, type Hex } from '@/lib/hex'
import { hexesWithinRadius } from '@/lib/hex/pixel'
import type { BoardFeature, FeatureType } from '@/lib/types/system-board'
import { featureLogicalHex } from './glyph-geometry'

export interface ScanPlan {
  origin: Hex
  // Cells inside the board but behind a large body — a scan from here leaves
  // them dark.
  shadowed: Hex[]
}

// occludes mirrors the server's rule (backend/system/fog_source.go): the star
// and planets shadow the lightspeed channel; belts, moons, and hazards don't.
export function occludes(t: FeatureType): boolean {
  return t === 'star' || t === 'rocky' || t === 'gas_giant' || t === 'ice'
}

// planSweep computes the shadow of a 360° sweep from `origin` at time `at`:
// every board hex without clear line of sight, given the occluding features'
// computed positions. The occluders' own hexes are never shadowed (the first
// body on a line is itself seen).
export function planSweep(
  origin: Hex,
  features: BoardFeature[],
  rimRing: number,
  at: number,
): ScanPlan {
  const occluders = new Set<string>()
  for (const f of features) {
    if (occludes(f.type)) occluders.add(hexKey(featureLogicalHex(f, at)))
  }
  const shadowed: Hex[] = []
  if (occluders.size > 0) {
    for (const h of hexesWithinRadius(rimRing)) {
      if (!lineOfSight(origin, h, occluders)) shadowed.push(h)
    }
  }
  return { origin, shadowed }
}
