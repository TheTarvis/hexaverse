'use client'

// HexBoard — the SVG viewport that hosts the tactical board (#0007). For this
// slice it fits a static viewBox over the hex lattice and owns the one-selection
// state (click to select, click again to deselect — the first half of the
// select → preview → commit gesture). Glyph, fog, and preview layers slot in as
// sibling <g> groups above the lattice as later slices land; wheel/drag pan-zoom
// upgrades this component in place.

import { useMemo, useState } from 'react'
import type { Hex } from '@/lib/hex'
import { fitViewBox, hexesWithinRadius } from '@/lib/hex/pixel'
import { HexLattice } from './HexLattice'
import type { BandBounds } from './board-palette'

export interface HexBoardProps {
  radius: number
  bandBounds?: BandBounds
}

export function HexBoard({ radius, bandBounds }: HexBoardProps) {
  const viewBox = useMemo(() => fitViewBox(hexesWithinRadius(radius)), [radius])
  const [selectedHex, setSelectedHex] = useState<Hex | null>(null)

  const toggleHex = (hex: Hex) =>
    setSelectedHex((prev) => (prev && prev.q === hex.q && prev.r === hex.r ? null : hex))

  return (
    <svg
      data-testid="hex-board"
      className="absolute inset-0 h-full w-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <HexLattice
        radius={radius}
        {...(bandBounds ? { bandBounds } : {})}
        selectedHex={selectedHex}
        onSelectHex={toggleHex}
      />
    </svg>
  )
}
