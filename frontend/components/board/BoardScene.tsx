'use client'

// BoardScene — the animated world layer above the static lattice (#0007). Given
// the fogged features, the fogged fleets, and the live worldTime, it draws (back
// to front): orbit rings for occupied rings, the live sensor bubble around own
// units, the body glyphs, and the fleet glyphs. Everything is positioned from
// `(elements, worldTime)` via glyph-geometry — no position ever comes off the
// wire per frame — so a paused network still animates. Re-rendered each frame by
// the parent's useWorldTime tick; the lattice underneath is memoized and does not.

import { useMemo } from 'react'
import { ringHexes, ringOf, type Hex } from '@/lib/hex'
import { hexPolygonPoints, hexToPixel, type Point } from '@/lib/hex/pixel'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import {
  featureGlidePixel,
  featureLogicalHex,
  fleetGlidePixel,
  fleetLogicalHex,
  headingDeg,
  sensorBubbleHexes,
} from './glyph-geometry'
import { FeatureGlyph } from './FeatureGlyph'
import { FleetGlyph } from './FleetGlyph'
import { ORBIT_RING, ORBIT_RING_HILITE, PREVIEW_BURN, SCAN_BUBBLE_FILL, SCAN_BUBBLE_STROKE } from './board-palette'

// The ambient-sensor radius (hexes) the backend uses (observation.DefaultSensorParams).
export const AMBIENT_RADIUS = 3

// A small worldTime step used only to sample a fleet's heading (visual, not logic).
const HEADING_DT = 2_000

export interface BoardSceneProps {
  worldTime: number
  features: BoardFeature[]
  fleets: Fleet[]
  selectedId?: string | null
  onSelectFeature?: (id: string) => void
  onSelectFleet?: (id: string) => void
}

export function BoardScene({
  worldTime,
  features,
  fleets,
  selectedId,
  onSelectFeature,
  onSelectFleet,
}: BoardSceneProps) {
  // Resolve every feature's glided point and logical hex in two passes so moons
  // can ride their parent (parents are always non-parented, so pass 1 covers them).
  const { pixelById, hexById } = useMemo(() => {
    const pixel = new Map<string, Point>()
    const hex = new Map<string, Hex>()
    const moonIndex = new Map<string, number>()
    for (const f of features) {
      if (f.parentId) continue
      pixel.set(f.id, featureGlidePixel(f, worldTime))
      hex.set(f.id, featureLogicalHex(f, worldTime))
    }
    for (const f of features) {
      if (!f.parentId) continue
      const i = moonIndex.get(f.parentId) ?? 0
      moonIndex.set(f.parentId, i + 1)
      pixel.set(f.id, featureGlidePixel(f, worldTime, pixel.get(f.parentId), i))
      hex.set(f.id, featureLogicalHex(f, worldTime, hex.get(f.parentId)))
    }
    return { pixelById: pixel, hexById: hex }
  }, [features, worldTime])

  // Occupied rings (drawn as faint hexagons); highlight the selected body's ring.
  const rings = useMemo(() => {
    const occupied = new Set<number>()
    for (const f of features) {
      const h = hexById.get(f.id)
      if (h) occupied.add(ringOf(h))
    }
    const selectedRing = selectedId ? ringOf(hexById.get(selectedId) ?? { q: 0, r: 0 }) : -1
    return [...occupied]
      .filter((r) => r > 0)
      .map((r) => ({ ring: r, points: ringPolygon(r), hilite: r === selectedRing }))
  }, [features, hexById, selectedId])

  // The live sensor bubble around own units.
  const bubble = useMemo(() => {
    const centers = fleets
      .filter((f) => f.own)
      .map((f) => fleetLogicalHex(f, worldTime, hexById.get(dockedParent(f) ?? '')))
    return sensorBubbleHexes(centers, AMBIENT_RADIUS)
  }, [fleets, worldTime, hexById])

  // Committed burn paths of own fleets (a foreign fleet is a snapshot — no path).
  const burnPaths = useMemo(
    () =>
      fleets
        .filter((f) => f.own && f.state.mode === 'burn' && f.state.burn)
        .map((f) => ({ id: f.id, points: pathPolyline(f.state.burn!.path) })),
    [fleets],
  )

  return (
    <>
      <g data-testid="burn-paths" fill="none" pointerEvents="none">
        {burnPaths.map((p) => (
          <polyline key={p.id} points={p.points} stroke={PREVIEW_BURN} strokeWidth={1.5} strokeOpacity={0.8} />
        ))}
      </g>

      <g data-testid="orbit-rings" fill="none">
        {rings.map((r) => (
          <polygon
            key={r.ring}
            points={r.points}
            stroke={r.hilite ? ORBIT_RING_HILITE : ORBIT_RING}
            strokeWidth={r.hilite ? 1.6 : 1}
          />
        ))}
      </g>

      <g data-testid="scan-bubble" pointerEvents="none">
        {bubble.map((h) => {
          const c = hexToPixel(h.q, h.r)
          return (
            <polygon
              key={`${h.q},${h.r}`}
              points={hexPolygonPoints(c)}
              fill={SCAN_BUBBLE_FILL}
              stroke={SCAN_BUBBLE_STROKE}
              strokeWidth={1}
            />
          )
        })}
      </g>

      <g data-testid="feature-glyphs">
        {features.map((f) => {
          const p = pixelById.get(f.id)
          if (!p) return null
          return (
            <FeatureGlyph
              key={f.id}
              feature={f}
              point={p}
              selected={selectedId === f.id}
              {...(onSelectFeature ? { onSelect: onSelectFeature } : {})}
            />
          )
        })}
      </g>

      <g data-testid="fleet-glyphs">
        {fleets.map((f) => {
          const parentId = dockedParent(f)
          const parentPixel = parentId ? pixelById.get(parentId) : undefined
          const p = fleetGlidePixel(f, worldTime, parentPixel)
          const ahead = fleetGlidePixel(f, worldTime + HEADING_DT, parentPixel)
          return (
            <FleetGlyph
              key={f.id}
              fleet={f}
              point={p}
              headingDeg={headingDeg(p, ahead)}
              selected={selectedId === f.id}
              {...(onSelectFleet ? { onSelect: onSelectFleet } : {})}
            />
          )
        })}
      </g>
    </>
  )
}

function ringPolygon(ring: number): string {
  return ringHexes(ring)
    .map((h) => {
      const p = hexToPixel(h.q, h.r)
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
    })
    .join(' ')
}

function dockedParent(f: Fleet): string | undefined {
  return f.state.mode === 'docked' ? f.state.docked?.parentId : undefined
}

function pathPolyline(path: Hex[]): string {
  return path
    .map((h) => {
      const p = hexToPixel(h.q, h.r)
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
    })
    .join(' ')
}
