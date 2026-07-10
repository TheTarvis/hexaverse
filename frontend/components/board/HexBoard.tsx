'use client'

// HexBoard — the SVG viewport that hosts the tactical board (#0007). It fits a
// viewBox over the hex lattice and stacks, back to front: the static tinted
// lattice, the pending-order preview, and the animated world scene (rings, sensor
// bubble, glyphs). Selection lives in the container (SystemBoardView) so the facts
// panel and verb gestures share it; HexBoard just wires tile clicks and a
// click-empty-to-deselect through. The lattice is memoized so the per-frame
// worldTime tick re-renders only the scene above it, never the 800 tiles.

import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Hex } from '@/lib/hex'
import { fitViewBox, hexesWithinRadius } from '@/lib/hex/pixel'
import { HexLattice } from './HexLattice'
import type { BandBounds } from './board-palette'

export interface HexBoardProps {
  radius: number
  bandBounds?: BandBounds
  selectedHex?: Hex | null
  onSelectHex?: (hex: Hex) => void
  onSelectEmpty?: () => void
  // The animated world scene + preview, rendered as <g> layers above the lattice.
  children?: ReactNode
}

const MemoLattice = memo(HexLattice)

export function HexBoard({
  radius,
  bandBounds,
  selectedHex,
  onSelectHex,
  onSelectEmpty,
  children,
}: HexBoardProps) {
  const viewBox = useMemo(() => fitViewBox(hexesWithinRadius(radius)), [radius])

  return (
    <svg
      data-testid="hex-board"
      className="absolute inset-0 h-full w-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onSelectEmpty}
    >
      <MemoLattice
        radius={radius}
        {...(bandBounds ? { bandBounds } : {})}
        selectedHex={selectedHex}
        {...(onSelectHex ? { onSelectHex } : {})}
      />
      {children}
    </svg>
  )
}
