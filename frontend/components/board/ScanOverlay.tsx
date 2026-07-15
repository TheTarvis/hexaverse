'use client'

// ScanOverlay — the 360° sweep overlay (#0006 Decision #21): a sensor marker
// on the origin and the SHADOW cells a sweep from there would not reveal
// (everything else is covered — the shadow is the signal). Two variants share
// the geometry: 'aim' previews while the player considers the Scan verb;
// 'active' is the committed sweep of a RUNNING scan (origin and occluders at
// its eta), drawn until the eta passes. Purely presentational — scan-preview
// computes the plan.

import type { ScanPlan } from './scan-preview'
import { hexToPixel, hexPolygonPoints, HEX_SIZE } from '@/lib/hex/pixel'
import { SCAN_BUBBLE_STROKE } from './board-palette'

export interface ScanOverlayProps {
  plan: ScanPlan | null
  variant: 'aim' | 'active'
  // Suppress the static origin rings — for the active variant when ScanPing
  // is drawing the animated echo front on the live pivot instead.
  hideOrigin?: boolean
}

export function ScanOverlay({ plan, variant, hideOrigin = false }: ScanOverlayProps) {
  if (!plan) return null
  const active = variant === 'active'
  const origin = hexToPixel(plan.origin.q, plan.origin.r)
  return (
    <g data-testid={`scan-overlay-${variant}`} pointerEvents="none" opacity={active ? 1 : 0.7}>
      {/* The sensor origin: concentric sweep rings around the scanning fleet. */}
      {!hideOrigin && (
        <g transform={`translate(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`}>
          <circle r={HEX_SIZE * 0.9} fill="none" stroke={SCAN_BUBBLE_STROKE} strokeWidth={1.5} />
          <circle
            r={HEX_SIZE * 1.6}
            fill="none"
            stroke={SCAN_BUBBLE_STROKE}
            strokeWidth={1}
            strokeDasharray="4 6"
          />
        </g>
      )}
      {/* Shadow cells: inside the board, behind a large body — a sweep from
          here leaves these dark. */}
      {plan.shadowed.map((h) => (
        <polygon
          key={`x-${h.q},${h.r}`}
          points={hexPolygonPoints(hexToPixel(h.q, h.r))}
          fill="rgba(0, 0, 0, 0.35)"
          stroke={SCAN_BUBBLE_STROKE}
          strokeWidth={0.5}
          strokeDasharray="2 4"
          opacity={0.6}
        />
      ))}
    </g>
  )
}
