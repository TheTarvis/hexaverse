import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, render } from '@testing-library/react'
import React from 'react'
import {
  projectWorldTime,
  wallClock,
  createWorldClock,
  useWorldClock,
  useCoarseWorldTime,
  wallMsUntil,
  COARSE_TICK_MS,
} from './index'

// RED-PHASE SUITE — openspec change `fix-world-time-render-loop`, impl
// contract §2/§10. `projectWorldTime`'s two cases are MOVED VERBATIM from the
// deleted per-frame world-clock hook's own test file (task 3.1); everything
// else is new coverage for the clock object (design.md Decision 1) and the
// two hooks built on it (tasks 3.2, 3.6, 3.7).

describe('projectWorldTime', () => {
  it('extrapolates world time from an anchor at scale 1', () => {
    const anchor = { world: 1_000, wall: 500 }
    // 200 wall-ms later → 200 world-ms later at scale 1.
    expect(projectWorldTime(anchor, 700, 1)).toBe(1_200)
  })

  it('warps by the scale factor', () => {
    const anchor = { world: 0, wall: 0 }
    // A 60× world advances 60 world-ms per wall-ms.
    expect(projectWorldTime(anchor, 10, 60)).toBe(600)
  })
})

describe('wallMsUntil — a served world instant becomes a wall-clock delay', () => {
  it('returns the raw remaining at scale 1, where world ms and wall ms coincide', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    expect(wallMsUntil(clock, 5_000)).toBe(4_000)
  })

  it('divides by the scale on a warped world — the case a subtraction gets wrong', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 5)
    // 4000 world-ms of remaining flight elapses in 800 wall-ms at 5x. Scheduling
    // the undivided 4000 would refetch five times later than the arrival.
    expect(wallMsUntil(clock, 5_000)).toBe(800)
  })

  it('never returns a negative delay for an instant already past', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(10_000, 5)
    expect(wallMsUntil(clock, 1_000)).toBe(0)
  })

  it('falls back to scale 1 before the clock has any reading', () => {
    const clock = createWorldClock(() => 0)
    expect(wallMsUntil(clock, 3_000)).toBe(3_000)
  })
})

describe('wallClock', () => {
  it('reads a monotonic, non-decreasing instant', () => {
    const a = wallClock()
    const b = wallClock()
    expect(b).toBeGreaterThanOrEqual(a)
  })
})

describe('createWorldClock — Scenario: now() before any anchor (task 3.6, design.md Decision 1)', () => {
  it('now() returns 0 and never throws before the first anchor()', () => {
    const clock = createWorldClock(() => 12_345)
    expect(() => clock.now()).not.toThrow()
    expect(clock.now()).toBe(0)
  })

  it('hasReading() is false before the first anchor()', () => {
    const clock = createWorldClock(() => 0)
    expect(clock.hasReading()).toBe(false)
    expect(clock.reading()).toBeNull()
  })

  it('a frame loop building at clock.now() before the first served reading has a finite, usable input (task 3.6, second half)', () => {
    const clock = createWorldClock(() => 0)
    const worldTimeMs = clock.now()
    expect(Number.isFinite(worldTimeMs)).toBe(true)
    expect(worldTimeMs).toBe(0)
  })
})

describe('createWorldClock — anchor() and now() (design.md Decision 1)', () => {
  it('hasReading() becomes true and now() projects forward once anchor()ed', () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(1_000, 2)
    expect(clock.hasReading()).toBe(true)
    wall.t = 500
    expect(clock.now()).toBe(1_000 + 500 * 2)
  })

  it('anchor() replaces the reading with ONE new object; the previous reading is never mutated', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    const first = clock.reading()
    clock.anchor(2_000, 3)
    const second = clock.reading()
    expect(second).not.toBe(first)
    expect(first).toEqual({ world: 1_000, wall: 0, scale: 1 })
    expect(second).toEqual({ world: 2_000, wall: 0, scale: 3 })
  })

  it('reading() returns the SAME object across repeated calls, changing identity only when anchor() runs', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    const r1 = clock.reading()
    const r2 = clock.reading()
    expect(r1).toBe(r2)
  })

  it('a non-finite world is a no-op', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    const before = clock.reading()
    clock.anchor(NaN, 1)
    expect(clock.reading()).toBe(before)
    clock.anchor(Infinity, 1)
    expect(clock.reading()).toBe(before)
  })

  it('a non-finite scale is a no-op', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    const before = clock.reading()
    clock.anchor(2_000, NaN)
    expect(clock.reading()).toBe(before)
    clock.anchor(2_000, -Infinity)
    expect(clock.reading()).toBe(before)
  })

  it('now() equals projectWorldTime(reading, wall(), reading.scale)', () => {
    const wall = { t: 100 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(50, 5)
    wall.t = 130
    expect(clock.now()).toBe(projectWorldTime({ world: 50, wall: 100 }, 130, 5))
  })
})

describe('useWorldClock — one stable clock per mount, anchored immediately (task 3.2)', () => {
  it('is referentially stable across rerenders with the same props', () => {
    const { result, rerender } = renderHook(
      ({ t, s }: { t: number; s: number }) => useWorldClock(t, s),
      { initialProps: { t: 1_000, s: 1 } },
    )
    const first = result.current
    rerender({ t: 1_000, s: 1 })
    expect(result.current).toBe(first)
  })

  it('anchors during the FIRST render when both a served world time and a scale are finite', () => {
    const { result } = renderHook(() => useWorldClock(5_000, 1))
    expect(result.current.hasReading()).toBe(true)
  })

  it('never anchors on a reading alone — a served world time with no served scale leaves hasReading() false (design m18)', () => {
    const { result } = renderHook(() => useWorldClock(5_000, undefined))
    expect(result.current.hasReading()).toBe(false)
  })

  it('re-anchors once a fresh reading AND a scale both arrive, and not again for the identical pair', () => {
    const initialProps: { t: number | undefined; s: number | undefined } = { t: undefined, s: undefined }
    const { result, rerender } = renderHook(
      ({ t, s }: { t: number | undefined; s: number | undefined }) => useWorldClock(t, s),
      { initialProps },
    )
    expect(result.current.hasReading()).toBe(false)

    rerender({ t: 5_000, s: 1 })
    expect(result.current.hasReading()).toBe(true)
    const anchored = result.current.reading()

    // The SAME pair repeats — no re-anchor, no new reading object.
    rerender({ t: 5_000, s: 1 })
    expect(result.current.reading()).toBe(anchored)
  })

  it('re-anchors again when only the scale changes (a fresh scale is a fresh reading)', () => {
    const { result, rerender } = renderHook(
      ({ t, s }: { t: number; s: number }) => useWorldClock(t, s),
      { initialProps: { t: 5_000, s: 1 } },
    )
    const first = result.current.reading()
    rerender({ t: 5_000, s: 60 })
    expect(result.current.reading()).not.toBe(first)
    expect(result.current.reading()?.scale).toBe(60)
  })

  it('re-anchors again when only the served world time changes', () => {
    const { result, rerender } = renderHook(
      ({ t, s }: { t: number; s: number }) => useWorldClock(t, s),
      { initialProps: { t: 5_000, s: 1 } },
    )
    const first = result.current.reading()
    rerender({ t: 9_000, s: 1 })
    expect(result.current.reading()).not.toBe(first)
    expect(result.current.reading()?.world).toBe(9_000)
  })
})

describe('useCoarseWorldTime — one coarse tick for everything React shows (tasks 3.2, 3.7)', () => {
  it('initial state is clock.now()', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(1_000, 1)
    const { result } = renderHook(() => useCoarseWorldTime(clock))
    expect(result.current).toBe(clock.now())
  })

  it('does nothing while the clock has no reading — an unanchored clock causes no renders', async () => {
    const clock = createWorldClock(() => 0)
    const onRender = vi.fn()
    function Probe() {
      onRender()
      useCoarseWorldTime(clock)
      return null
    }
    vi.useFakeTimers()
    try {
      render(<Probe />)
      onRender.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COARSE_TICK_MS * 3)
      })
      expect(onRender).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ticks once per wall second while a reading exists', async () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(1_000, 1)
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useCoarseWorldTime(clock))
      expect(result.current).toBe(1_000)
      wall.t = COARSE_TICK_MS
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COARSE_TICK_MS)
      })
      expect(result.current).toBe(2_000)
      wall.t = COARSE_TICK_MS * 2
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COARSE_TICK_MS)
      })
      expect(result.current).toBe(3_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('updates immediately on re-anchor, without waiting for the next tick (Decision 2)', () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(1_000, 1)
    const { result, rerender } = renderHook(() => useCoarseWorldTime(clock))
    expect(result.current).toBe(1_000)
    wall.t = 100
    clock.anchor(9_000, 1)
    rerender()
    expect(result.current).toBe(9_000)
  })

  it('returns unrounded world-ms; callers round it themselves', () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(1_000.7, 1)
    const { result } = renderHook(() => useCoarseWorldTime(clock))
    expect(result.current).toBe(1_000.7)
  })

  it('clears its interval and its visibility listener on unmount', () => {
    const clock = createWorldClock(() => 0)
    clock.anchor(0, 1)
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = renderHook(() => useCoarseWorldTime(clock))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(clearSpy).toHaveBeenCalled()
  })

  // Scenario: A figure resyncs promptly when the tab regains visibility
  it('Scenario: A figure resyncs promptly when the tab regains visibility', () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(0, 1)
    const { result } = renderHook(() => useCoarseWorldTime(clock))
    expect(result.current).toBe(0)

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    // Simulate a long hidden interval — fake timers are NOT advanced here:
    // the interval alone is subject to the browser's background-timer
    // policy, so only the wall clock moves.
    wall.t = 60_000

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(clock.now())
    expect(result.current).toBe(60_000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).visibilityState
  })

  it('SDET-added: a visibilitychange to hidden does not itself force a recompute', () => {
    const wall = { t: 0 }
    const clock = createWorldClock(() => wall.t)
    clock.anchor(0, 1)
    const { result } = renderHook(() => useCoarseWorldTime(clock))
    wall.t = 5_000
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    // Going hidden must not itself jump the value forward — only becoming
    // visible resyncs (the scenario above).
    expect(result.current).toBe(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).visibilityState
  })
})
