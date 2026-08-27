// scan-preview — the sweep-coverage math behind the scan overlays (#0006
// Decisions #16/#21): from an origin, the 360° sweep reaches everything with
// clear line of sight; large bodies cast shadows. The overlay's job is the
// SHADOW — the cells a scan from here would NOT reveal — since the sweep
// covers everything else. Pure math; rendering lives in ScanOverlay, the
// authoritative reveal on the server.
//
// Occlusion is no longer a set of blocking cells: since the polar rewrite each
// occluder carries its own pinned SQUARED radius, so a body shadows a cone
// behind it rather than exactly one cell. The star's radius is the larger of
// the two, which is what makes the far side of the core genuinely dark.

import {
  cellKey,
  lineOfSight,
  PLANET_OCCLUSION_RADIUS2,
  ringCells,
  STAR_OCCLUSION_RADIUS2,
  type Cell,
  type Occluder,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature, FeatureType } from '@/lib/types/system-board'
import { featureLogicalCell } from './glyph-geometry'

export interface ScanPlan {
  origin: Cell
  // Cells inside the board but behind a large body — a scan from here leaves
  // them dark.
  shadowed: Cell[]
}

// occludes mirrors the server's rule (backend/system/fog_source.go): the star
// and planets shadow the lightspeed channel; belts, moons, and hazards don't.
export function occludes(t: FeatureType): boolean {
  return t === 'star' || t === 'rocky' || t === 'gas_giant' || t === 'ice'
}

// occlusionRadius2 maps a shadow-casting feature to its pinned squared radius —
// the caller-side half of lib/board's Occluder contract. The star is the wide
// one; every other occluding body uses the planet radius.
export function occlusionRadius2(t: FeatureType): number {
  return t === 'star' ? STAR_OCCLUSION_RADIUS2 : PLANET_OCCLUSION_RADIUS2
}

// sweepOccluders resolves the shadow-casting bodies to their cells at `at`.
// Cheap (one featureLogicalCell per feature) and separated from the shadow
// solve on purpose: the solve below is O(cells × occluders) with BigInt
// arithmetic inside, while the ANSWER only changes when an occluder crosses a
// cell — not every frame. Callers that render per-frame memoize the solve on
// `occluderKey` and re-run it only when that key changes.
export function sweepOccluders(features: BoardFeature[], at: number, s: Schedule): Occluder[] {
  const out: Occluder[] = []
  for (const f of features) {
    if (!occludes(f.type)) continue
    out.push({ cell: featureLogicalCell(f, at, s), radius2: occlusionRadius2(f.type) })
  }
  return out
}

// occluderKey is a stable identity for a resolved occluder set — the memo key
// that keeps a per-frame render from re-solving an unchanged shadow.
export function occluderKey(origin: Cell, occluders: Occluder[]): string {
  return `${cellKey(origin)}|${occluders.map((o) => `${cellKey(o.cell)}:${o.radius2}`).join(',')}`
}

// planSweepFrom is the shadow solve proper, over an already-resolved occluder
// set. O(cells × occluders); memoize it on occluderKey where it renders per
// frame.
export function planSweepFrom(
  origin: Cell,
  occluders: Occluder[],
  rimRing: number,
  s: Schedule,
): ScanPlan {
  const occluderCells = new Set(occluders.map((o) => cellKey(o.cell)))
  const shadowed: Cell[] = []
  if (occluders.length > 0) {
    for (let ring = 0; ring <= rimRing; ring++) {
      for (const cell of ringCells(ring, s)) {
        if (occluderCells.has(cellKey(cell))) continue
        if (!lineOfSight(origin, cell, occluders, s)) shadowed.push(cell)
      }
    }
  }
  return { origin, shadowed }
}

// planSweep computes the shadow of a 360° sweep from `origin` at time `at`:
// every board cell without clear line of sight, given the occluding features'
// computed positions. An occluder's own cell is never shadowed (the first body
// on a line is itself seen) — lineOfSight's strictly-between rule gives that
// for free, but the occluder cells are skipped explicitly so a body never
// dims itself through a sibling sharing its cell.
export function planSweep(
  origin: Cell,
  features: BoardFeature[],
  rimRing: number,
  at: number,
  s: Schedule,
): ScanPlan {
  return planSweepFrom(origin, sweepOccluders(features, at, s), rimRing, s)
}
