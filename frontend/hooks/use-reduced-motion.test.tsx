import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReducedMotion, REDUCED_MOTION_QUERY } from './use-reduced-motion'

// RED-PHASE SUITE — task 3.8 (OQ1, folded in per USER RULING 1). Makes
// `system-space-view`'s already-live *Space View Respects Reduced-Motion
// Preference* (`spec.md:1323-1337`) reachable: the requirement's "WHILE" is a
// LIVE condition, so detection must track a `change` event, never a
// mount-only read.
//
// PER-TEST matchMedia SPY WITH A REAL, LISTENER-INVOKING addEventListener
// (impl contract §10 item 6): the shared `vitest.setup.ts` stub's own
// `addEventListener` is a no-op returning a fresh object per call, so a
// dispatched `change` event never reaches it there.

function installMatchMediaSpy(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean; media: string }) => void>()
  const mql = {
    matches: initial,
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    addEventListener: (_type: string, l: (e: { matches: boolean; media: string }) => void) => {
      listeners.add(l)
    },
    removeEventListener: (_type: string, l: (e: { matches: boolean; media: string }) => void) => {
      listeners.delete(l)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    if (query === REDUCED_MOTION_QUERY) return mql as unknown as MediaQueryList
    // Any other query falls through to a fresh, inert stub — never the
    // shared one, so this spy's own call count stays exact.
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList
  })
  return {
    spy,
    mql,
    listenerCount: () => listeners.size,
    fire(next: boolean) {
      mql.matches = next
      for (const l of Array.from(listeners)) l({ matches: next, media: REDUCED_MOTION_QUERY })
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useReducedMotion', () => {
  it('reads the initial preference from matchMedia at mount — true', () => {
    installMatchMediaSpy(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('reads the initial preference from matchMedia at mount — false', () => {
    installMatchMediaSpy(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  // Scenario: Reduced motion freezes decorative animation while positions
  // keep advancing — this is the hook half; the scene-freezing half is
  // `SystemSpaceView.render-loop.test.tsx`'s 2.5.
  it('Scenario: the value flips on a dispatched change event with no remount (the requirement\'s "WHILE" is live, not a mount-only read)', () => {
    const media = installMatchMediaSpy(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => media.fire(true))
    expect(result.current).toBe(true)

    act(() => media.fire(false))
    expect(result.current).toBe(false)
  })

  it('queries matchMedia exactly once and uses that SAME object for add and remove', () => {
    const media = installMatchMediaSpy(false)
    renderHook(() => useReducedMotion())
    expect(media.spy).toHaveBeenCalledTimes(1)
    expect(media.spy).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
    expect(media.listenerCount()).toBe(1)
  })

  it('removes its listener on unmount', () => {
    const media = installMatchMediaSpy(false)
    const { unmount } = renderHook(() => useReducedMotion())
    expect(media.listenerCount()).toBe(1)
    unmount()
    expect(media.listenerCount()).toBe(0)
  })

  it('SDET-added: without a window.matchMedia function, the initial value is false rather than throwing', () => {
    const original = window.matchMedia
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).matchMedia
    try {
      expect(() => renderHook(() => useReducedMotion())).not.toThrow()
      const { result } = renderHook(() => useReducedMotion())
      expect(result.current).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })
})
