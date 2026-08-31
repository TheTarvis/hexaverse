// board-frame — the per-frame packer: (fogged reads, wall clock) → the resolved
// FrameData the canvas draws (port-board-to-webgl-renderer). This is where the
// per-frame decisions live, outside webgl/: positions through glyph-geometry
// (the Go↔TS determinism seam — reused, never reimplemented), and the selected
// ring.
//
// World time comes from the SAME anchor math as useWorldTime
// (projectWorldTime, re-anchored on every fresh server read) — never a locally
// integrated timer. That is what makes tab-backgrounding resume correct: the
// clock is a closed-form projection of the server reading, so a paused rAF
// loop costs nothing (task 3.2a pins this).
//
// The board draws no fleet layer after migrate-fleet-to-continuous-burns
// (design.md Decision 12) — this packer no longer folds a fleet's movement
// state or resolves its glide pixel/heading; see tasks.md 8.1/8.7.

import { productionSchedule } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import { projectWorldTime, type WorldAnchor } from '@/hooks/use-world-time'
import { sortFeaturesForDraw } from './board-pack'
import { featureMaps } from './glyph-geometry'
import { boardToWorld } from './use-board-projection'
import type { FrameData } from './webgl/contract'

// The frame packer projects positions but never enumerates cells or clamps to
// the rim, so the process-wide schedule is exact here (design.md,
// schedule-threading Decision).
const SCHEDULE = productionSchedule()

export interface FramePackerInput {
  features: BoardFeature[]
  // The server world-time anchor — re-created by the owner on every fresh
  // board read, exactly as useWorldTime re-anchors.
  anchor: WorldAnchor
  // World-ms per wall-ms. Production is ALWAYS 1 (the spike's speed multiplier
  // does not carry over — scaling it would desynchronise glyph positions from
  // every server ETA); the tuning bench may pass its slider.
  timeScale?: number
  // Wall-clock instant decorative time is measured from — held stable by the
  // owner across packer re-creations so shader noise doesn't jump on refetch.
  fxEpochWall: number
  // While true, the decorative shader clock is FROZEN (reduced motion): the
  // starfield/nebula/grain/body-surface animation holds its static state,
  // while positions below keep advancing with world time.
  reducedMotion: boolean
  // Read fresh each frame (a ref-backed callback) so selection changes don't
  // rebuild the packer: the id of the selected feature, or null.
  getSelectedId: () => string | null
}

export type FramePacker = (wallNowMs: number) => FrameData

export function createFramePacker(input: FramePackerInput): FramePacker {
  const order = sortFeaturesForDraw(input.features)
  const bodyOffsets = new Float32Array(order.length * 2)
  const scale = input.timeScale ?? 1

  return (wallNowMs: number): FrameData => {
    const worldTime = projectWorldTime(input.anchor, wallNowMs, scale)
    const fxTime = input.reducedMotion ? 0 : (wallNowMs - input.fxEpochWall) / 1000

    const { pixelById, cellById } = featureMaps(input.features, worldTime, SCHEDULE)
    for (let i = 0; i < order.length; i++) {
      const p = pixelById.get(order[i]!.id)
      const w = p ? boardToWorld(p) : { x: 0, y: 0 }
      bodyOffsets[i * 2] = w.x
      bodyOffsets[i * 2 + 1] = w.y
    }

    const selectedId = input.getSelectedId()
    const selectedCell = selectedId ? cellById.get(selectedId) : undefined
    const selectedRing = selectedCell ? selectedCell.ring : -1

    return {
      fxTime,
      bodyOffsets,
      // Scan/sensor UI draws on the SVG overlay in production; the lattice's
      // spike-era pulse/bubble stay dark.
      pulse: null,
      sensor: null,
      selectedRing: selectedRing > 0 ? selectedRing : -1,
    }
  }
}
