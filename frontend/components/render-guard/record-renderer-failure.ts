// record-renderer-failure.ts — the recorded-by-cause sink (design.md:
// "Sink is console.error pending Travis's answer" — the open question in
// design.md/Open Questions is about a future reporting service, not about
// whether recording happens at all).
//
// Contract: never throws. Recording must never block the unsupported/
// interrupted state from rendering (design.md task 1.9) — the caller
// (use-render-guard.ts) additionally wraps every call of this in its own
// try/catch, but this module holds up its own end of that guarantee too.

import type { FailureCause } from './guard-machine'

export interface RenderFailureRecord {
  surface: 'board' | 'galaxy'
  cause: FailureCause
  detail?: string
}

export type RecordFn = (record: RenderFailureRecord) => void

export function recordRendererFailure(record: RenderFailureRecord): void {
  try {
    const parts = [`[render-guard] ${record.surface} renderer failure: ${record.cause}`]
    if (record.detail) {
      parts.push(`— ${record.detail}`)
    }
    console.error(parts.join(' '))
  } catch {
    // A misbehaving console (or a sink swapped in by a test/consumer) must
    // never propagate back out — recording is best-effort observability,
    // never load-bearing for the UI state it accompanies.
  }
}
