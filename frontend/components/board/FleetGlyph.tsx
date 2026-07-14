'use client'

// FleetGlyph — one fleet drawn at a screen point. An OWN fleet reads in full: an
// accent ring encoding its mode (coast/burn/docked), a hull pointed along its
// heading, and a thruster flame while burning. A FOREIGN fleet is a bare snapshot
// marker — the fogged read gives only its position, never a path or ETA
// (#0004/#0007), so there is nothing more to draw.

import type { Fleet } from '@/lib/types/fleet'
import type { Point } from '@/lib/hex/pixel'
import { HEX_SIZE } from '@/lib/hex/pixel'
import { stateAt } from '@/lib/hex'
import { FLEET_ACCENT, FLEET_FOREIGN, SELECTION_STROKE, THRUSTER } from './board-palette'

export interface FleetGlyphProps {
  fleet: Fleet
  point: Point
  worldTime: number
  headingDeg?: number
  selected?: boolean
  onSelect?: (id: string) => void
}

export function FleetGlyph({ fleet, point, worldTime, headingDeg = 0, selected, onSelect }: FleetGlyphProps) {
  // Accent/thruster/dock ring read the EFFECTIVE mode: an arrived burn is already
  // docked/coasting, so the glyph doesn't keep its flame lit waiting on a refetch.
  const mode = stateAt(fleet.state, worldTime).mode
  const accent = fleet.own ? FLEET_ACCENT[mode] : FLEET_FOREIGN
  const ring = HEX_SIZE * 0.42
  return (
    <g
      data-testid={`fleet-glyph-${fleet.id}`}
      data-own={fleet.own}
      transform={`translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(fleet.id)
      }}
    >
      {selected && <circle r={ring + 5} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} />}
      {fleet.own ? (
        <>
          <circle r={ring} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.9} />
          <g transform={`rotate(${headingDeg.toFixed(1)})`}>
            <path d={`M ${ring * 0.9} 0 L ${-ring * 0.55} ${ring * 0.5} L ${-ring * 0.55} ${-ring * 0.5} Z`} fill={accent} />
            {/* A trip's leg 0 is a burn — the ship only appears here while it's
                still crossing this board to the gate, so it's under thrust too. */}
            {(mode === 'burn' || mode === 'laneTransit') && (
              <path d={`M ${-ring * 0.55} 0 L ${-ring * 1.2} ${ring * 0.25} L ${-ring * 1.2} ${-ring * 0.25} Z`} fill={THRUSTER} />
            )}
          </g>
          {mode === 'docked' && (
            <circle r={ring + 3} fill="none" stroke={accent} strokeWidth={0.75} strokeDasharray="3 3" />
          )}
        </>
      ) : (
        <rect x={-ring * 0.5} y={-ring * 0.5} width={ring} height={ring} fill="none" stroke={FLEET_FOREIGN} strokeWidth={1.5} transform="rotate(45)" />
      )}
      <circle r={HEX_SIZE * 0.5} fill="transparent" />
    </g>
  )
}
