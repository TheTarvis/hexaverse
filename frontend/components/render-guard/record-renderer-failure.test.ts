// record-renderer-failure.test.ts — the recorded-by-cause sink
// (design.md: "Sink is console.error pending Travis's answer").
//
// Covers (both capabilities): Renderer failures are recorded distinguishably
// by cause.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { recordRendererFailure, type RenderFailureRecord } from './record-renderer-failure'

describe('recordRendererFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a diagnostic entry to console.error naming the surface and cause', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record: RenderFailureRecord = { surface: 'board', cause: 'creation' }
    recordRendererFailure(record)
    expect(spy).toHaveBeenCalled()
    const text = spy.mock.calls.map((c) => c.join(' ')).join(' ')
    expect(text).toMatch(/board/i)
    expect(text).toMatch(/creation/i)
  })

  it('distinguishes all three causes (creation / lost / restore-failed) from one another', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const causes: RenderFailureRecord['cause'][] = ['creation', 'lost', 'restore-failed']
    for (const cause of causes) {
      spy.mockClear()
      recordRendererFailure({ surface: 'galaxy', cause })
      const text = spy.mock.calls.map((c) => c.join(' ')).join(' ')
      expect(text).toMatch(new RegExp(cause, 'i'))
    }
  })

  it('includes the browser-reported diagnostic message when available', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    recordRendererFailure({
      surface: 'board',
      cause: 'creation',
      detail: 'CONTEXT_CREATION_FAILED: out of memory',
    })
    const text = spy.mock.calls.map((c) => c.join(' ')).join(' ')
    expect(text).toContain('CONTEXT_CREATION_FAILED: out of memory')
  })

  it('omits any diagnostic-message segment when none is available, without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => recordRendererFailure({ surface: 'galaxy', cause: 'lost' })).not.toThrow()
    expect(spy).toHaveBeenCalled()
  })

  it('never throws — recording must never block the unsupported/interrupted state from rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      // A misbehaving floor sink still shouldn't be able to make recording
      // itself throw back out at the caller in this direct unit test — the
      // caller-side guarantee (use-render-guard wraps every call) is tested
      // separately in use-render-guard.test.tsx.
    })
    expect(() => recordRendererFailure({ surface: 'board', cause: 'restore-failed' })).not.toThrow()
  })
})
