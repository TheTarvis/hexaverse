// board-frame — the per-frame packer: (fogged reads, wall clock) → the resolved
// FrameData the canvas draws (port-board-to-webgl-renderer). This is where the
// per-frame decisions live, outside webgl/: positions through glyph-geometry
// (the Go↔TS determinism seam — reused, never reimplemented), movement-mode
// accents through stateAt, the reduced-motion freeze, the selected ring.
//
// World time comes from the SAME anchor math as useWorldTime
// (projectWorldTime, re-anchored on every fresh server read) — never a locally
// integrated timer. That is what makes tab-backgrounding resume correct: the
// clock is a closed-form projection of the server reading, so a paused rAF
// loop costs nothing (task 3.2a pins this).

import { ringOf, stateAt } from '@/lib/hex'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { projectWorldTime, type WorldAnchor } from '@/hooks/use-world-time'
import { FLEET_ACCENT, FLEET_FOREIGN } from './board-palette'
import { hexToRgb, sortFeaturesForDraw } from './board-pack'
import {
  featureMaps,
  fleetDockedParentId,
  fleetGlidePixel,
  fleetOnBoard,
} from './glyph-geometry'
import { boardToWorld } from './use-board-projection'
import type { FleetFrame, FrameData, Rgb } from './webgl/contract'

// A small worldTime step used only to sample a fleet's heading (visual, not
// logic) — the same constant the SVG scene used.
const HEADING_DT = 2_000

const ACCENT_RGB: Record<string, Rgb> = Object.fromEntries(
  Object.entries(FLEET_ACCENT).map(([mode, hex]) => [mode, hexToRgb(hex)]),
) as Record<string, Rgb>
const FOREIGN_RGB = hexToRgb(FLEET_FOREIGN)

export interface FramePackerInput {
  features: BoardFeature[]
  fleets: Fleet[]
  // The server world-time anchor — re-created by the owner on every fresh
  // board read, exactly as useWorldTime re-anchors.
  anchor: WorldAnchor
  // World-ms per wall-ms. Production is ALWAYS 1 (the spike's speed multiplier
  // does not carry over — scaling it would desynchronise glyph positions from
  // stateAt and every server ETA); the tuning bench may pass its slider.
  timeScale?: number
  // Wall-clock instant decorative time is measured from — held stable by the
  // owner across packer re-creations so shader noise doesn't jump on refetch.
  fxEpochWall: number
  // While true, the decorative shader clock is FROZEN (reduced motion): the
  // starfield/nebula/grain/body-surface/plume animation holds its static
  // state, while positions below keep advancing with world time.
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
  const fleets: FleetFrame[] = []

  return (wallNowMs: number): FrameData => {
    const worldTime = projectWorldTime(input.anchor, wallNowMs, scale)
    const fxTime = input.reducedMotion ? 0 : (wallNowMs - input.fxEpochWall) / 1000

    const { pixelById, hexById } = featureMaps(input.features, worldTime)
    for (let i = 0; i < order.length; i++) {
      const p = pixelById.get(order[i]!.id)
      const w = p ? boardToWorld(p) : { x: 0, y: 0 }
      bodyOffsets[i * 2] = w.x
      bodyOffsets[i * 2 + 1] = w.y
    }

    fleets.length = 0
    for (const fleet of input.fleets) {
      if (!fleetOnBoard(fleet, worldTime)) continue
      const parentId = fleetDockedParentId(fleet, worldTime)
      const parentPixel = parentId ? pixelById.get(parentId) : undefined
      const p = boardToWorld(fleetGlidePixel(fleet, worldTime, parentPixel))
      const ahead = boardToWorld(fleetGlidePixel(fleet, worldTime + HEADING_DT, parentPixel))
      // Hull models point along local +y; heading 0 = "up-board". atan2 of the
      // GL-space velocity, offset so +y is zero.
      const dx = ahead.x - p.x
      const dy = ahead.y - p.y
      const headingRad = dx === 0 && dy === 0 ? 0 : Math.atan2(-dx, dy)
      const mode = stateAt(fleet.state, worldTime).mode
      fleets.push({
        id: fleet.id,
        x: p.x,
        y: p.y,
        headingRad,
        accent: fleet.own ? (ACCENT_RGB[mode] ?? FOREIGN_RGB) : FOREIGN_RGB,
        burning: fleet.own && (mode === 'burn' || mode === 'laneTransit') ? 1 : 0,
        docked: fleet.own && mode === 'docked' ? 1 : 0,
      })
    }

    const selectedId = input.getSelectedId()
    const selectedHex = selectedId ? hexById.get(selectedId) : undefined
    const selectedRing = selectedHex ? ringOf(selectedHex) : -1

    return {
      fxTime,
      bodyOffsets,
      fleets,
      // Scan/sensor UI draws on the SVG overlay in production; the lattice's
      // spike-era pulse/bubble stay dark.
      pulse: null,
      sensor: null,
      selectedRing: selectedRing > 0 ? selectedRing : -1,
    }
  }
}
