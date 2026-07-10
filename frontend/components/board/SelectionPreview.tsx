'use client'

// SelectionPreview — the pending (uncommitted) order overlay (#0007): a dashed
// route from the acting fleet to the meeting point, and a crosshair marker where
// it will arrive. For a led intercept the meeting point tracks the target as the
// world turns, because the parent recomputes the MovePlan each frame with a fresh
// worldTime. Purely presentational — the plan is computed by move-preview.

import type { MovePlan } from './move-preview'
import { hexToPixel } from '@/lib/hex/pixel'
import { PREVIEW_MEET, PREVIEW_ROUTE } from './board-palette'

export interface SelectionPreviewProps {
  plan: MovePlan | null
}

export function SelectionPreview({ plan }: SelectionPreviewProps) {
  if (!plan || plan.path.length === 0) return null
  const points = plan.path
    .map((h) => {
      const p = hexToPixel(h.q, h.r)
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
    })
    .join(' ')
  const meet = hexToPixel(plan.meetHex.q, plan.meetHex.r)
  return (
    <g data-testid="selection-preview" pointerEvents="none">
      <polyline
        points={points}
        fill="none"
        stroke={PREVIEW_ROUTE}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <g transform={`translate(${meet.x.toFixed(2)}, ${meet.y.toFixed(2)})`}>
        <circle r={12} fill="none" stroke={PREVIEW_MEET} strokeWidth={1.5} strokeDasharray="3 3" />
        <line x1={-16} y1={0} x2={16} y2={0} stroke={PREVIEW_MEET} strokeWidth={1} />
        <line x1={0} y1={-16} x2={0} y2={16} stroke={PREVIEW_MEET} strokeWidth={1} />
      </g>
    </g>
  )
}
