// probe.test.ts — the pre-flight capability probe (design.md, pinned API):
//   export type ProbeOutcome = { supported: true } | { supported: false; detail?: string }
//   export function probeWebgl2(): ProbeOutcome
//
// Covers (both capabilities): Context creation failure shows a named
// unsupported state; The displayed cause is a user-actionable category, not
// raw diagnostic text (the probe is the only place `detail` originates, so
// this test pins that `detail` carries the RAW browser string — it is
// RendererStateNotice's job, tested separately, never to display it
// verbatim); Renderer failures are recorded distinguishably by cause (the
// probe's `detail` is what a creation-failure record wants).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeWebgl2 } from './probe'
import { fakeGlContext, stubUnsupported, stubCreationError } from './test-canvas'

describe('probeWebgl2', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('reports supported against the default (available) test world', () => {
    expect(probeWebgl2()).toEqual({ supported: true })
  })

  it('reports unsupported, no detail, when getContext(webgl2) returns null with no diagnostic event (Scenario: Context creation failure shows a named unsupported state)', () => {
    restore = stubUnsupported()
    const outcome = probeWebgl2()
    expect(outcome.supported).toBe(false)
    expect((outcome as { detail?: string }).detail).toBeUndefined()
  })

  it('carries the browser-reported statusMessage as `detail` when webglcontextcreationerror fires (Scenario: Renderer failures are recorded distinguishably by cause)', () => {
    restore = stubCreationError('CONTEXT_CREATION_FAILED: out of memory')
    const outcome = probeWebgl2()
    expect(outcome).toEqual({ supported: false, detail: 'CONTEXT_CREATION_FAILED: out of memory' })
  })

  it('never throws, even if getContext itself throws', () => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error('driver exploded')
    }
    restore = () => {
      HTMLCanvasElement.prototype.getContext = original
    }
    expect(() => probeWebgl2()).not.toThrow()
    expect(probeWebgl2().supported).toBe(false)
  })

  it('releases the probe context on a successful probe — calls getExtension("WEBGL_lose_context").loseContext() (design.md: "a probe that keeps its context is a context leak")', () => {
    const ctx = fakeGlContext()
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx as any,
    )
    restore = () => spy.mockRestore()

    const outcome = probeWebgl2()

    expect(outcome).toEqual({ supported: true })
    expect(ctx.getExtension).toHaveBeenCalledWith('WEBGL_lose_context')
    expect(ctx.loseContext).toHaveBeenCalledTimes(1)
  })

  it('does not release anything on a failed probe (no context was created to release)', () => {
    restore = stubUnsupported()
    // Not asserting a spy here — the point is merely that a failed probe
    // must not throw trying to release a context that never existed.
    expect(() => probeWebgl2()).not.toThrow()
  })

  it('is NOT memoized at module scope — a second call can answer differently (Scenario: The unsupported state offers a retry affordance — retry re-probes)', () => {
    expect(probeWebgl2()).toEqual({ supported: true })
    const undo = stubUnsupported()
    expect(probeWebgl2().supported).toBe(false)
    undo()
    // And back again — a third call sees the restored default, proving the
    // second call didn't get cached and returned forever.
    expect(probeWebgl2()).toEqual({ supported: true })
  })

  it('SDET-added: an unrelated getExtension name never confused with WEBGL_lose_context', () => {
    const ctx = fakeGlContext()
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx as any,
    )
    restore = () => spy.mockRestore()
    probeWebgl2()
    expect(ctx.getExtension).not.toHaveBeenCalledWith('WEBGL_debug_renderer_info')
  })
})
