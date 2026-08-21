// probe.ts — the pre-flight WebGL2 capability probe (design.md, "the shared
// guard module's public API").
//
// Non-negotiable rules pinned by the architect:
//   - Never throws. A missing context is an ordinary `null` return, not an
//     exception; a `getContext` implementation that itself throws (a driver
//     that misbehaves) is still swallowed and reported as unsupported.
//   - On a successful probe, the context it created is released immediately
//     (`getExtension('WEBGL_lose_context')?.loseContext()`) so a probe never
//     charges against the browser's live-context budget.
//   - Not memoized at module scope — every call re-probes, which is what
//     retry depends on to see a different answer the second time.
//
// The one-shot `webglcontextcreationerror` listener captures the browser's
// own diagnostic (`statusMessage`) as `detail` — recorded by the caller, but
// per design.md 1.4/RendererStateNotice never displayed verbatim to the
// player.

export type ProbeOutcome = { supported: true } | { supported: false; detail?: string }

export function probeWebgl2(): ProbeOutcome {
  let detail: string | undefined

  try {
    const canvas = document.createElement('canvas')

    const onCreationError = (event: Event) => {
      const statusMessage = (event as unknown as { statusMessage?: string }).statusMessage
      if (typeof statusMessage === 'string') {
        detail = statusMessage
      }
    }
    canvas.addEventListener('webglcontextcreationerror', onCreationError, { once: true })

    let ctx: unknown
    try {
      ctx = canvas.getContext('webgl2')
    } finally {
      canvas.removeEventListener('webglcontextcreationerror', onCreationError)
    }

    if (!ctx) {
      return detail === undefined ? { supported: false } : { supported: false, detail }
    }

    releaseProbeContext(ctx)
    return { supported: true }
  } catch {
    return detail === undefined ? { supported: false } : { supported: false, detail }
  }
}

function releaseProbeContext(ctx: unknown): void {
  try {
    const getExtension = (ctx as { getExtension?: (name: string) => unknown }).getExtension
    const loseContextExt = getExtension?.call(ctx, 'WEBGL_lose_context') as
      | { loseContext?: () => void }
      | null
      | undefined
    loseContextExt?.loseContext?.()
  } catch {
    // Releasing the probe context is best-effort; a probe that failed to
    // release its own context must still report success — the whole point
    // was that a context WAS created.
  }
}
