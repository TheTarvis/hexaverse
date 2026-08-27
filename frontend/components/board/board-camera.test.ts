import { describe, expect, it } from 'vitest'
import { RADIAL_UNIT } from '@/lib/board'
import {
  advanceDrag,
  atPanLimit,
  atZoomLimit,
  beginDrag,
  clampCamera,
  clampTarget,
  clampZoom,
  DEFAULT_CAMERA,
  DRAG_THRESHOLD_PX,
  isDefaultCamera,
  isPan,
  KEY_PAN_STEP,
  panBound,
  panByPixels,
  panBySteps,
  panToReveal,
  touchDistance,
  WHEEL_NOTCH_DELTA_Y,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomByFactor,
  zoomByNotches,
  zoomByPinch,
  zoomByWheel,
  type BoardCamera,
} from './board-camera'

const RADIUS = 16
const at = (zoom: number, x = 0, y = 0): BoardCamera => ({ zoom, target: { x, y } })

describe('the default framing', () => {
  it('is fit-to-lattice at 1x with the pan target on the core cell', () => {
    expect(DEFAULT_CAMERA).toEqual({ zoom: 1, target: { x: 0, y: 0 } })
    expect(isDefaultCamera(DEFAULT_CAMERA)).toBe(true)
  })

  it('does not report a panned or zoomed camera as default', () => {
    expect(isDefaultCamera(at(1, 10, 0))).toBe(false)
    expect(isDefaultCamera(at(2))).toBe(false)
  })
})

describe('the zoom clamp', () => {
  it('holds both ends at the spike-inherited bounds', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
    expect(clampZoom(100)).toBe(ZOOM_MAX)
    expect(clampZoom(2.5)).toBe(2.5)
  })

  it('survives a non-finite input rather than poisoning the camera', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN)
  })

  it('reports the at-limit state at each end and nowhere between', () => {
    expect(atZoomLimit(at(ZOOM_MIN))).toBe('min')
    expect(atZoomLimit(at(ZOOM_MAX))).toBe('max')
    expect(atZoomLimit(at(1))).toBeNull()
  })
})

describe('wheel zoom', () => {
  it('zooms in on a negative deltaY and out on a positive one', () => {
    expect(zoomByWheel(at(1), -100).zoom).toBeGreaterThan(1)
    expect(zoomByWheel(at(1), 100).zoom).toBeLessThan(1)
  })

  it('clamps at the ceiling and at the floor', () => {
    expect(zoomByWheel(at(ZOOM_MAX), -10_000).zoom).toBe(ZOOM_MAX)
    expect(zoomByWheel(at(ZOOM_MIN), 10_000).zoom).toBe(ZOOM_MIN)
  })

  it('leaves the pan target exactly where it was — zoom anchors on the centre', () => {
    const before = at(1, 120, -40)
    const after = zoomByWheel(before, -400)
    expect(after.zoom).toBeGreaterThan(before.zoom)
    expect(after.target).toEqual(before.target)
  })

  it('is a no-op for a zero or non-finite delta', () => {
    const c = at(2, 5, 5)
    expect(zoomByWheel(c, 0)).toBe(c)
    expect(zoomByWheel(c, Number.NaN)).toBe(c)
  })
})

describe('keyboard zoom', () => {
  it('steps by exactly one wheel notch per press', () => {
    expect(zoomByNotches(at(1), -1).zoom).toBeCloseTo(zoomByWheel(at(1), -WHEEL_NOTCH_DELTA_Y).zoom, 12)
    expect(zoomByNotches(at(1), 1).zoom).toBeCloseTo(zoomByWheel(at(1), WHEEL_NOTCH_DELTA_Y).zoom, 12)
  })

  it('respects the same clamp as wheel and pinch', () => {
    expect(zoomByNotches(at(ZOOM_MAX), -50).zoom).toBe(ZOOM_MAX)
    expect(zoomByNotches(at(ZOOM_MIN), 50).zoom).toBe(ZOOM_MIN)
  })
})

describe('pinch zoom', () => {
  it('zooms out as the fingers close and in as they spread', () => {
    expect(zoomByPinch(at(2), 200, 100).zoom).toBeCloseTo(1, 12)
    expect(zoomByPinch(at(2), 100, 200).zoom).toBeCloseTo(4, 12)
  })

  it('clamps at the pinch boundary exactly as wheel does', () => {
    expect(zoomByPinch(at(ZOOM_MAX), 100, 400).zoom).toBe(ZOOM_MAX)
    expect(zoomByPinch(at(ZOOM_MIN), 400, 100).zoom).toBe(ZOOM_MIN)
  })

  it('anchors on the camera centre, not the pinch midpoint', () => {
    const before = at(1, -90, 30)
    expect(zoomByPinch(before, 100, 300).target).toEqual(before.target)
  })

  it('ignores a degenerate distance rather than producing NaN', () => {
    const c = at(1)
    expect(zoomByPinch(c, 0, 100)).toBe(c)
    expect(zoomByPinch(c, 100, 0)).toBe(c)
  })

  it('rejects a non-positive factor outright', () => {
    const c = at(1)
    expect(zoomByFactor(c, 0)).toBe(c)
    expect(zoomByFactor(c, -2)).toBe(c)
  })

  it('measures two-finger distance as the plain hypotenuse', () => {
    expect(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('the pan bound — the lattice bounding disc', () => {
  it('is the outermost ring radius in board pixels', () => {
    expect(panBound(RADIUS)).toBe(RADIUS * RADIAL_UNIT)
  })

  it('leaves a target inside the disc untouched', () => {
    const t = { x: 100, y: -50 }
    expect(clampTarget(t, RADIUS)).toBe(t)
  })

  it('pulls a target outside the disc back onto its rim, keeping the direction', () => {
    const bound = panBound(RADIUS)
    const t = clampTarget({ x: 10_000, y: 0 }, RADIUS)
    expect(t.x).toBeCloseTo(bound, 9)
    expect(t.y).toBeCloseTo(0, 9)
  })

  it('admits no corner region a bounding box would have let through', () => {
    // A point at (bound, bound) is inside a bounding BOX and outside the disc.
    const bound = panBound(RADIUS)
    const t = clampTarget({ x: bound, y: bound }, RADIUS)
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(bound, 9)
  })

  it('reports the at-limit state only on the rim', () => {
    expect(atPanLimit(at(1, 0, 0), RADIUS)).toBe(false)
    expect(atPanLimit({ zoom: 1, target: clampTarget({ x: 9999, y: 0 }, RADIUS) }, RADIUS)).toBe(true)
  })

  it('clamps zoom and target together', () => {
    const c = clampCamera({ zoom: 99, target: { x: 9999, y: 0 } }, RADIUS)
    expect(c.zoom).toBe(ZOOM_MAX)
    expect(Math.hypot(c.target.x, c.target.y)).toBeCloseTo(panBound(RADIUS), 9)
  })
})

describe('pointer-drag pan', () => {
  it('moves the board with the pointer — the target moves the other way', () => {
    const c = panByPixels(at(1), 10, 4, 2, RADIUS)
    expect(c.target).toEqual({ x: -20, y: -8 })
  })

  it('covers more board per pixel when zoomed out, through worldPerPixel', () => {
    const near = panByPixels(at(1), 10, 0, 1, RADIUS)
    const far = panByPixels(at(1), 10, 0, 4, RADIUS)
    expect(Math.abs(far.target.x)).toBeGreaterThan(Math.abs(near.target.x))
  })

  it('never leaves the bounding disc, however far the drag runs', () => {
    const c = panByPixels(at(1), -5000, -5000, 4, RADIUS)
    expect(Math.hypot(c.target.x, c.target.y)).toBeLessThanOrEqual(panBound(RADIUS) + 1e-9)
  })

  it('leaves zoom untouched', () => {
    expect(panByPixels(at(3.5), 20, 20, 1, RADIUS).zoom).toBe(3.5)
  })
})

describe('keyboard pan', () => {
  it('steps by exactly one radial unit per press', () => {
    expect(panBySteps(at(1), 1, 0, RADIUS).target).toEqual({ x: KEY_PAN_STEP, y: 0 })
    expect(panBySteps(at(1), 0, -1, RADIUS).target).toEqual({ x: 0, y: -KEY_PAN_STEP })
    expect(KEY_PAN_STEP).toBe(RADIAL_UNIT)
  })

  it('respects the pan clamp like every other pan path', () => {
    let c = at(1)
    for (let i = 0; i < 200; i++) c = panBySteps(c, 1, 0, RADIUS)
    expect(c.target.x).toBeCloseTo(panBound(RADIUS), 9)
  })
})

describe('the click/pan discriminator', () => {
  it('is a click below the threshold and a pan at it', () => {
    const under = beginDrag(0, 0)
    advanceDrag(under, DRAG_THRESHOLD_PX - 1, 0)
    expect(isPan(under)).toBe(false)

    const on = beginDrag(0, 0)
    advanceDrag(on, DRAG_THRESHOLD_PX, 0)
    expect(isPan(on)).toBe(true)
  })

  it('accumulates TOTAL travel, so a drag out and back is still a pan', () => {
    const d = beginDrag(0, 0)
    advanceDrag(d, 6, 0)
    advanceDrag(d, 0, 0)
    expect(d.moved).toBe(12)
    expect(isPan(d)).toBe(true)
  })

  it('reports each frame delta for the pan path to consume', () => {
    const d = beginDrag(100, 100)
    expect(advanceDrag(d, 103, 96)).toEqual({ dx: 3, dy: -4 })
    expect(d.moved).toBe(5)
  })
})

describe('panToReveal', () => {
  const viewport = { w: 800, h: 600 }

  it('leaves a rect already inside the viewport alone', () => {
    const c = at(1, 10, 10)
    expect(panToReveal(c, { left: 100, top: 100, right: 140, bottom: 140 }, viewport, 2, RADIUS)).toBe(c)
  })

  it('brings a rect past the right edge in by the minimum displacement', () => {
    const c = panToReveal(at(1), { left: 790, top: 100, right: 830, bottom: 140 }, viewport, 2, RADIUS)
    // The rect must move 30px left; the target moves 30px right.
    expect(c.target).toEqual({ x: 60, y: 0 })
  })

  it('brings a rect past the top edge in by the minimum displacement', () => {
    const c = panToReveal(at(1), { left: 100, top: -20, right: 140, bottom: 20 }, viewport, 2, RADIUS)
    expect(c.target).toEqual({ x: 0, y: -40 })
  })

  it('preserves zoom — pan alone suffices', () => {
    expect(panToReveal(at(4), { left: -50, top: 0, right: -10, bottom: 40 }, viewport, 2, RADIUS).zoom).toBe(4)
  })
})
