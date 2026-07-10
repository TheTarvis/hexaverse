'use client'

// FeatureGlyph — one body drawn at a screen point, shaped by its type and dimmed
// by its fog band (#0006/#0007). Purely presentational: the parent computes the
// glided point (glyph-geometry) and passes it in. Live bodies read at full
// strength; remembered/astronomical ones dim and gain a dashed "last known" ring
// (fog by subtraction — unseen bodies aren't drawn at all, they're simply absent
// from `features`).

import type { BoardFeature } from '@/lib/types/system-board'
import type { Point } from '@/lib/hex/pixel'
import { HEX_SIZE } from '@/lib/hex/pixel'
import { FEATURE_STYLE, FOG_TREATMENT, SELECTION_STROKE, type GlyphShape } from './board-palette'

export interface FeatureGlyphProps {
  feature: BoardFeature
  point: Point
  selected?: boolean
  onSelect?: (id: string) => void
}

const R = HEX_SIZE * 0.34

export function FeatureGlyph({ feature, point, selected, onSelect }: FeatureGlyphProps) {
  const style = FEATURE_STYLE[feature.type]
  const fog = FOG_TREATMENT[feature.band]
  return (
    <g
      data-testid={`feature-glyph-${feature.id}`}
      data-band={feature.band}
      transform={`translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`}
      opacity={fog.opacity}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(feature.id)
      }}
    >
      {selected && <circle r={R + 6} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} />}
      {fog.ghost && (
        <circle r={R} fill="none" stroke={style.color} strokeOpacity={0.5} strokeDasharray="2 3" strokeWidth={0.75} />
      )}
      <Shape shape={style.shape} color={style.color} />
      {/* Generous transparent hit target so small bodies are easy to click. */}
      <circle r={HEX_SIZE * 0.5} fill="transparent" />
    </g>
  )
}

function Shape({ shape, color }: { shape: GlyphShape; color: string }) {
  switch (shape) {
    case 'star':
      return (
        <>
          <circle r={R * 2.2} fill={color} opacity={0.18} />
          <circle r={R} fill={color} />
        </>
      )
    case 'giant':
      return (
        <>
          <ellipse rx={R * 1.7} ry={R * 0.5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
          <circle r={R} fill={color} />
        </>
      )
    case 'belt':
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (Math.PI / 3) * i
            return <circle key={i} cx={Math.cos(a) * R * 1.2} cy={Math.sin(a) * R * 1.2} r={1.6} fill={color} />
          })}
        </>
      )
    case 'moon':
      return <circle r={R * 0.6} fill={color} />
    case 'diamond':
      return <rect x={-R * 0.8} y={-R * 0.8} width={R * 1.6} height={R * 1.6} fill={color} transform="rotate(45)" />
    case 'square':
      return <rect x={-R * 0.75} y={-R * 0.75} width={R * 1.5} height={R * 1.5} fill={color} transform="rotate(20)" />
    default:
      return <circle r={R} fill={color} />
  }
}
