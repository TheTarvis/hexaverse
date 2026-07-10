import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { projectWorldTime, useWorldTime } from './use-world-time'

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

describe('useWorldTime', () => {
  beforeEach(() => {
    // Freeze the wall clock so the frozen (animate:false) reading is exact.
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts at the server reading', () => {
    const { result } = renderHook(() => useWorldTime(5_000, { animate: false }))
    expect(result.current).toBe(5_000)
  })

  it('re-anchors when a fresh server reading arrives', () => {
    const { result, rerender } = renderHook(
      ({ t }: { t: number }) => useWorldTime(t, { animate: false }),
      { initialProps: { t: 5_000 } },
    )
    expect(result.current).toBe(5_000)

    act(() => rerender({ t: 9_000 }))
    expect(result.current).toBe(9_000)
  })

  it('advances on animation frames as the wall clock moves', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0)
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        // Fire one frame asynchronously so the effect's loop runs once.
        setTimeout(() => cb(0), 0)
        return 1 as unknown as number
      })

    const { result } = renderHook(() => useWorldTime(1_000, { scale: 1 }))
    expect(result.current).toBe(1_000)

    // 250 wall-ms pass, then a frame ticks.
    nowSpy.mockReturnValue(250)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1))
    })
    expect(result.current).toBe(1_250)

    rafSpy.mockRestore()
  })
})
