'use client'

// RendererStateNotice.tsx — the unsupported/interrupted presentation, retry
// control, live region, and focus move (design.md, pinned testids:
// `renderer-unsupported`, `renderer-interrupted`, `renderer-retry`, plus
// `data-surface="board"|"galaxy"`).
//
// Displayed-cause rule (design.md task 1.4, "The displayed cause is a
// user-actionable category, not raw diagnostic text"): this component never
// receives a raw diagnostic string at all — only `cause`, one of a fixed
// FailureCause enum — so it structurally cannot render the browser's
// `webglcontextcreationerror.statusMessage` or an exception's stack. That
// diagnostic is recorded (record-renderer-failure.ts), never displayed.

import { useEffect, useRef } from 'react'
import { Button } from '../catalyst/button'
import type { FailureCause, GuardStatus } from './guard-machine'

export interface RendererStateNoticeProps {
  status: Extract<GuardStatus, 'unsupported' | 'interrupted'>
  cause: FailureCause | null
  surface: 'board' | 'galaxy' | 'space'
  retrying: boolean
  onRetry?: () => void
  // True iff focus was inside the canvas region at the moment this notice
  // replaced it (design.md task 1.8c) — drives the mount-time focus move.
  claimFocus?: boolean
}

const CAUSE_COPY: Record<FailureCause, string> = {
  creation: 'Your browser or graphics hardware could not initialize WebGPU or WebGL2 rendering.',
  lost: 'The rendering context was lost.',
  'restore-failed': 'The rendering context could not be re-established after a restore attempt.',
}

const FALLBACK_COPY = 'The renderer is unavailable.'

const SURFACE_LABEL: Record<'board' | 'galaxy' | 'space', string> = {
  board: 'board',
  galaxy: 'galaxy view',
  space: 'system space view',
}

export function RendererStateNotice({
  status,
  cause,
  surface,
  retrying,
  onRetry,
  claimFocus,
}: RendererStateNoticeProps) {
  const retryRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)

  useEffect(
    () => {
      if (!claimFocus) return
      if (onRetry) {
        retryRef.current?.focus()
      } else {
        textRef.current?.focus()
      }
    },
    // Intentionally mount-only: `claimFocus` names a one-shot fact about
    // the moment this notice replaced the canvas region, not a value to
    // re-react to on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const testId = status === 'unsupported' ? 'renderer-unsupported' : 'renderer-interrupted'
  const heading = status === 'unsupported' ? 'Rendering unavailable' : 'Rendering interrupted'
  const causeText = cause ? CAUSE_COPY[cause] : FALLBACK_COPY
  const liveMessage = `${heading} — ${SURFACE_LABEL[surface]} renderer. ${causeText}`

  return (
    <div
      data-testid={testId}
      data-surface={surface}
      role="status"
      aria-live="polite"
      className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800/50 dark:bg-white/[0.12]"
    >
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{heading}</h3>
      <p
        ref={textRef}
        tabIndex={-1}
        className="max-w-md text-sm text-zinc-600 outline-none dark:text-zinc-400"
      >
        {causeText}
      </p>
      {/* The state change, announced. `data-testid` names it so a view can
          assert its own wiring reaches assistive technology. */}
      <span className="sr-only" data-testid="renderer-live-region" aria-live="polite">
        {liveMessage}
      </span>
      {onRetry && (
        <Button
          type="button"
          color="dark/zinc"
          data-testid="renderer-retry"
          onClick={onRetry}
          disabled={retrying}
          ref={retryRef}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </div>
  )
}
