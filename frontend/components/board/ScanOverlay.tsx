'use client'

// ScanOverlay — the 360° sweep overlay (#0006 Decision #21): a sensor marker
// on the origin and the SHADOW cells a sweep from there would not reveal
// (everything else is covered — the shadow is the signal). Two variants share
// the geometry: 'aim' previews while the player considers the Scan verb;
// 'active' is the committed sweep of a RUNNING scan (origin and occluders at
// its eta), drawn until the eta passes. Purely presentational — scan-preview
// computes the plan.

import type { ScanPlan } from './scan-preview'
import { cellKey, cellToPoint, RADIAL_UNIT, wedgePath, type Schedule } from '@/lib/board'
import { SCAN_BUBBLE_STROKE } from './board-palette'

export interface ScanOverlayProps {
  plan: ScanPlan | null
  variant: 'aim' | 'active'
  // The board's slot schedule — what resolves each shadowed cell's wedge.
  schedule: Schedule
  // Suppress the static origin rings — for the active variant when ScanPing
  // is drawing the animated echo front on the live pivot instead.
  hideOrigin?: boolean
}

export function ScanOverlay({ plan, variant, schedule, hideOrigin = false }: ScanOverlayProps) {
  if (!plan) return null
  const active = variant === 'active'
  const origin = cellToPoint(plan.origin, schedule)
  return (
    <g data-testid={`scan-overlay-${variant}`} pointerEvents="none" opacity={active ? 1 : 0.7}>
      {/* The sensor origin: concentric sweep rings around the scanning fleet. */}
      {!hideOrigin && (
        <g transform={`translate(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`}>
          <circle r={RADIAL_UNIT * 0.9} fill="none" stroke={SCAN_BUBBLE_STROKE} strokeWidth={1.5} />
          <circle
            r={RADIAL_UNIT * 1.6}
            fill="none"
            stroke={SCAN_BUBBLE_STROKE}
            strokeWidth={1}
            strokeDasharray="4 6"
          />
        </g>
      )}
      {/* Shadow cells: inside the board, behind a large body — a sweep from
          here leaves these dark. */}
      {plan.shadowed.map((c) => (
        <path
          key={`x-${cellKey(c)}`}
          d={wedgePath(c, schedule)}
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
