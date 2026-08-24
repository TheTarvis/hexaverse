'use client'

// BalanceReadout (#0011) — the corporation's credit balance on the board.
//
// Sourced from session data (the corporation record), not a bespoke read: the
// balance already rides GET /v1/corporations/me, and a settled sale invalidates
// it. Credits are instant and location-independent, so there is never a pending
// or in-flight state to render here.

import { useEffect, useRef, useState } from 'react'

export interface BalanceReadoutProps {
  credits: number | null | undefined
  // The most recent sale's proceeds, if one just settled — shown briefly as a
  // delta so the change is legible rather than the number silently ticking up.
  lastDelta?: number | null
  // A failed sale's player-facing message. Announced through the same live
  // region, so a failure is never conveyed by visual change alone.
  failure?: string | null
}

export function BalanceReadout({ credits, lastDelta = null, failure = null }: BalanceReadoutProps) {
  // The live region's text. Kept in state (rather than derived) so a repeated
  // identical announcement still re-fires for assistive technology.
  const [announcement, setAnnouncement] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (failure) {
      seq.current += 1
      setAnnouncement(`${failure} (${seq.current})`)
      return
    }
    if (lastDelta && credits !== null && credits !== undefined) {
      seq.current += 1
      setAnnouncement(`Sold for ${lastDelta} credits. Balance ${credits} credits. (${seq.current})`)
    }
  }, [lastDelta, failure, credits])

  return (
    <div data-testid="balance-readout" className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">credits</span>
      <span
        data-testid="balance-value"
        className="font-mono text-sm text-zinc-200 tabular-nums"
      >
        {credits ?? '—'}
      </span>
      {lastDelta ? (
        <span data-testid="balance-delta" className="font-mono text-xs text-emerald-400 tabular-nums">
          +{lastDelta}
        </span>
      ) : null}

      {/* A balance change and a sale failure are both announced here. Without
          this, both would be conveyed by visual change alone — invisible to a
          screen reader, and easy to miss even sighted. The sequence suffix
          forces a re-announcement when the same message repeats. */}
      <span
        data-testid="balance-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </span>
    </div>
  )
}
