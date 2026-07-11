'use client'

// GateGlyph — a charted lane's departure gate on the board rim (#0008). Purely
// presentational: the parent computes the rim point (hexToPixel of the gate tile)
// and passes it in. Drawn as a portal ring with an outward-pointing chevron —
// aimed away from the core, toward the lane it opens onto — so a gate reads as an
// exit, distinct from the body glyphs inside. Selecting one arms the depart verb.

import type { Point } from '@/lib/hex/pixel'
import { HEX_SIZE } from '@/lib/hex/pixel'
import { GATE_ACCENT, SELECTION_STROKE } from './board-palette'

export interface GateGlyphProps {
  destSystemId: string
  point: Point
  selected?: boolean
  onSelect?: (destSystemId: string) => void
}

const R = HEX_SIZE * 0.4

export function GateGlyph({ destSystemId, point, selected, onSelect }: GateGlyphProps) {
  // Orient the chevron outward: the rim point's direction from the core (0,0).
  const angleDeg = (Math.atan2(point.y, point.x) * 180) / Math.PI
  return (
    <g
      data-testid={`gate-glyph-${destSystemId}`}
      transform={`translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(destSystemId)
      }}
    >
      {selected && <circle r={R + 6} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} />}
      <circle r={R} fill="none" stroke={GATE_ACCENT} strokeWidth={1.5} strokeOpacity={0.85} />
      <circle r={R * 0.4} fill={GATE_ACCENT} fillOpacity={0.5} />
      <g transform={`rotate(${angleDeg.toFixed(1)})`}>
        <path
          d={`M ${(R * 0.55).toFixed(1)} ${(-R * 0.5).toFixed(1)} L ${(R * 1.15).toFixed(1)} 0 L ${(R * 0.55).toFixed(1)} ${(R * 0.5).toFixed(1)}`}
          fill="none"
          stroke={GATE_ACCENT}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Generous transparent hit target so a rim gate is easy to click. */}
      <circle r={HEX_SIZE * 0.55} fill="transparent" />
    </g>
  )
}
