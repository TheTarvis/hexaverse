'use client'

// HexLattice — the static hex grid: one <polygon> per tile, tinted by its ring
// band (#0007 "star-centered concentric rings with ring-band tinting"). Pure and
// presentational: no clock, no fetch, no world state. Selection, fog, preview,
// and glyph layers render as sibling <g> groups above it inside <HexBoard>.

import { useMemo } from 'react'
import type { Hex } from '@/lib/hex'
import { ringOf } from '@/lib/hex'
import { hexesWithinRadius, hexPolygonPoints, hexToPixel } from '@/lib/hex/pixel'
import { bandForRing, tileFill, tileStroke, type BandBounds } from './board-palette'

export interface HexLatticeProps {
  radius: number
  bandBounds?: BandBounds
  selectedHex?: Hex | null
  onSelectHex?: (hex: Hex) => void
}

export function HexLattice({ radius, bandBounds, selectedHex, onSelectHex }: HexLatticeProps) {
  const tiles = useMemo(
    () =>
      hexesWithinRadius(radius).map((hex) => ({
        hex,
        center: hexToPixel(hex.q, hex.r),
        band: bandForRing(ringOf(hex), bandBounds),
      })),
    [radius, bandBounds],
  )

  return (
    <g data-testid="hex-lattice">
      {tiles.map(({ hex, center, band }) => {
        const selected = !!selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r
        return (
          <polygon
            key={`${hex.q},${hex.r}`}
            data-testid={`hex-tile-${hex.q},${hex.r}`}
            points={hexPolygonPoints(center)}
            fill={tileFill(band)}
            stroke={selected ? '#ffffff' : tileStroke(band)}
            strokeWidth={selected ? 2 : 1}
            className="cursor-pointer transition-colors hover:fill-white/10"
            onClick={() => onSelectHex?.(hex)}
          />
        )
      })}
    </g>
  )
}
