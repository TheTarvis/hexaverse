import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { cellToPoint, productionSchedule } from '@/lib/board'
import type { SystemBoard } from '@/lib/types/system-board'
import { BoardStage } from './BoardStage'
import { createBoardProjection, BOARD_TILT_DEG } from './use-board-projection'
import { DRAG_THRESHOLD_PX, WHEEL_NOTCH_DELTA_Y, WHEEL_ZOOM_BASE } from './board-camera'
import { RADIAL_UNIT } from '@/lib/board'

const S = productionSchedule()

// Same seam mock as BoardStage.test.tsx: the canvas region reports whatever
// availability the test dictates, everything else (overlay, projection,
// picking, and the gesture listeners under test) runs for real in jsdom.
const guard = vi.hoisted(() => ({ available: true }))

vi.mock('./BoardCanvas', async () => {
  const React = await import('react')
  function BoardCanvasMock({
    onAvailabilityChange,
    renderWorld,
  }: {
    onAvailabilityChange?: (a: boolean) => void
    renderWorld?: (canvas: HTMLCanvasElement) => React.ReactNode
  }) {
    const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
    // Re-reports on every render (no dep array) so a test can flip `guard`
    // and drive the live → unavailable transition without a remount — a
    // remount would reset the very state the focus-rescue assertion is about.
    React.useEffect(() => {
      onAvailabilityChange?.(guard.available)
    })
    return React.createElement(
      'div',
      { 'data-testid': 'board-canvas-region' },
      React.createElement('canvas', { 'data-testid': 'board-canvas', ref: setCanvas }),
      canvas && guard.available ? renderWorld?.(canvas) : null,
      guard.available
        ? null
        : React.createElement(
            'div',
            { 'data-testid': 'renderer-unsupported' },
            React.createElement('button', { 'data-testid': 'renderer-retry' }, 'Retry'),
          ),
    )
  }
  return { BoardCanvas: BoardCanvasMock, default: BoardCanvasMock }
})

vi.mock('./webgl/WebGLBoard', () => {
  function WebGLBoardMock() {
    return null
  }
  return { WebGLBoard: WebGLBoardMock, default: WebGLBoardMock }
})

const W = 1200
const H = 900
const RADIUS = 3

function boardFixture(): SystemBoard {
  return {
    systemId: 'sys-7',
    radius: RADIUS,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    laneGates: [],
    features: [
      { id: 'f-star', type: 'star', fixed: true, footprint: [{ ring: 0, slot: 0 }], band: 'visible', live: true },
      {
        id: 'f-rock',
        type: 'rocky',
        orbit: { ring: 2, angle0: 1, period: 0, dir: 1 },
        footprint: [{ ring: 2, slot: 1 }],
        band: 'visible',
        live: true,
      },
    ],
  }
}

const stage = () => screen.getByTestId('board-stage')
const overlayTransform = () => screen.getByTestId('board-overlay').style.transform

// The camera as the overlay's published CSS transform reports it — the same
// string project() is gated against, so reading it here is reading the camera.
function readCamera(): { zoom: number; tx: number; ty: number } {
  const m = /scale\((-?[\d.]+)\) translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(overlayTransform())
  if (!m) throw new Error(`no camera in transform: ${overlayTransform()}`)
  return { zoom: Number(m[1]), tx: Number(m[2]), ty: Number(m[3]) }
}

function pointer(type: string, x: number, y: number, target: Element = stage()) {
  // jsdom has no PointerEvent constructor; a MouseEvent carrying the pointer
  // type name reaches the same listeners with the same coordinates.
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }))
}

function touch(type: string, points: { x: number; y: number }[], target: Element = stage()) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: { clientX: number; clientY: number }[]
  }
  ev.touches = points.map((p) => ({ clientX: p.x, clientY: p.y }))
  fireEvent(target, ev)
  return ev
}

// A drag of `dist` CSS pixels, as one press → move → release sequence.
function drag(dist: number, from = { x: 600, y: 450 }, target?: Element) {
  const el = target ?? stage()
  pointer('pointerdown', from.x, from.y, el)
  pointer('pointermove', from.x + dist, from.y, el)
  pointer('pointerup', from.x + dist, from.y, el)
  fireEvent.click(el, { clientX: from.x + dist, clientY: from.y })
}

describe('board camera gestures', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    }
  })
  afterAll(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  })
  beforeEach(() => {
    guard.available = true
  })

  describe('pointer drag pan', () => {
    it('pans the camera once the drag passes the movement threshold', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      expect(readCamera().tx).toBe(0)
      drag(120)
      // Dragging right moves the board right: the pan target goes left, so the
      // overlay's compensating translate goes right (positive).
      expect(readCamera().tx).toBeGreaterThan(0)
    })

    it('clamps the pan target to the lattice bounding disc, however far the drag runs', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      pointer('pointerdown', 600, 450)
      for (let i = 1; i <= 40; i++) pointer('pointermove', 600 + i * 200, 450)
      pointer('pointerup', 600, 450)
      const { tx } = readCamera()
      // The bound is ringRadius(maxRing) * RADIAL_UNIT, expressed through the
      // overlay's fit scale — finite and well short of the drag's own travel.
      expect(Math.abs(tx)).toBeLessThan(8000 * 0.5)
      expect(Number.isFinite(tx)).toBe(true)
    })

    it('leaves the camera alone for a press-release under the threshold', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      drag(DRAG_THRESHOLD_PX - 1)
      expect(readCamera().tx).toBe(0)
    })
  })

  describe('the click/pan discriminator on a mark', () => {
    it('selects the mark when the pointer moves 7 CSS pixels between press and release', () => {
      const onSelectFeature = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectFeature={onSelectFeature} />)
      drag(DRAG_THRESHOLD_PX - 1, { x: 600, y: 450 }, screen.getByTestId('feature-glyph-f-rock'))
      expect(onSelectFeature).toHaveBeenCalledWith('f-rock')
    })

    it('pans instead of selecting when the pointer moves 8 CSS pixels', () => {
      const onSelectFeature = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectFeature={onSelectFeature} />)
      drag(DRAG_THRESHOLD_PX, { x: 600, y: 450 }, screen.getByTestId('feature-glyph-f-rock'))
      expect(onSelectFeature).not.toHaveBeenCalled()
      expect(readCamera().tx).not.toBe(0)
    })

    it('never lets a pan reach the bare-cell picking path either', () => {
      const onSelectCell = vi.fn()
      const onSelectEmpty = vi.fn()
      render(
        <BoardStage
          board={boardFixture()}
          fleets={[]}
          worldTime={0}
          onSelectCell={onSelectCell}
          onSelectEmpty={onSelectEmpty}
        />,
      )
      drag(60)
      expect(onSelectCell).not.toHaveBeenCalled()
      expect(onSelectEmpty).not.toHaveBeenCalled()
    })

    it('still selects on a plain click after a pan has finished', () => {
      const onSelectCell = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectCell={onSelectCell} />)
      drag(60)
      const p = createBoardProjection(RADIUS, W, H, BOARD_TILT_DEG)
      const pt = p.project(cellToPoint({ ring: 2, slot: 1 }, S))
      fireEvent.click(stage(), { clientX: pt.x, clientY: pt.y })
      expect(onSelectCell).toHaveBeenCalled()
    })
  })

  describe('wheel zoom', () => {
    it('zooms in on a negative deltaY and out on a positive one', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.wheel(stage(), { deltaY: -400 })
      const zoomedIn = readCamera().zoom
      expect(zoomedIn).toBeGreaterThan(1)
      fireEvent.wheel(stage(), { deltaY: 800 })
      expect(readCamera().zoom).toBeLessThan(zoomedIn)
    })

    it('preventDefaults, so the page underneath does not scroll as well', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })
      fireEvent(stage(), ev)
      expect(ev.defaultPrevented).toBe(true)
    })

    it('zooms even when the gesture lands on a mark — no dead zone over glyphs', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.wheel(screen.getByTestId('feature-glyph-f-rock'), { deltaY: -400 })
      expect(readCamera().zoom).toBeGreaterThan(1)
    })

    it('keeps the camera centred on its pan target across a zoom', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      drag(90)
      const panned = readCamera()
      fireEvent.wheel(stage(), { deltaY: -400 })
      const zoomed = readCamera()
      expect(zoomed.zoom).toBeGreaterThan(panned.zoom)
      // The translate is expressed in pre-scale element pixels, so an
      // unchanged pan target reads as an unchanged translate.
      expect(zoomed.tx).toBeCloseTo(panned.tx, 6)
      expect(zoomed.ty).toBeCloseTo(panned.ty, 6)
    })
  })

  describe('touch', () => {
    it('zooms on a two-finger pinch, through the same clamp as wheel', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      touch('touchstart', [
        { x: 500, y: 450 },
        { x: 700, y: 450 },
      ])
      touch('touchmove', [
        { x: 400, y: 450 },
        { x: 800, y: 450 },
      ])
      // The fingers spread 200px → 400px: a 2x zoom.
      expect(readCamera().zoom).toBeCloseTo(2, 6)
      touch('touchend', [])
    })

    it('pinches in as well as out', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.wheel(stage(), { deltaY: -800 })
      const before = readCamera().zoom
      touch('touchstart', [
        { x: 400, y: 450 },
        { x: 800, y: 450 },
      ])
      touch('touchmove', [
        { x: 500, y: 450 },
        { x: 700, y: 450 },
      ])
      expect(readCamera().zoom).toBeCloseTo(before / 2, 6)
    })

    it('anchors the pinch on the camera centre, not the pinch midpoint', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      drag(90)
      const panned = readCamera()
      touch('touchstart', [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ])
      touch('touchmove', [
        { x: 50, y: 100 },
        { x: 250, y: 100 },
      ])
      const after = readCamera()
      expect(after.zoom).toBeGreaterThan(panned.zoom)
      expect(after.tx).toBeCloseTo(panned.tx, 6)
    })

    it('preventDefaults only while two fingers are down, so a one-finger tap keeps its click', () => {
      const onSelectFeature = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectFeature={onSelectFeature} />)
      const single = touch('touchstart', [{ x: 600, y: 450 }])
      expect(single.defaultPrevented).toBe(false)
      const moved = touch('touchmove', [{ x: 601, y: 450 }])
      expect(moved.defaultPrevented).toBe(false)
      // The synthesized click a tap produces still selects.
      fireEvent.click(screen.getByTestId('feature-glyph-f-rock'))
      expect(onSelectFeature).toHaveBeenCalledWith('f-rock')
    })

    it('suppresses the browser gesture during an actual pinch', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      touch('touchstart', [
        { x: 500, y: 450 },
        { x: 700, y: 450 },
      ])
      const moved = touch('touchmove', [
        { x: 480, y: 450 },
        { x: 720, y: 450 },
      ])
      expect(moved.defaultPrevented).toBe(true)
    })

    it('sets touch-action: none across the board’s full interactive surface', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      expect(stage().style.touchAction).toBe('none')
    })
  })

  describe('keyboard operability', () => {
    it('pans one radial unit per arrow press, in the pressed direction', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      const right = readCamera()
      expect(right.tx).toBeLessThan(0)
      fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      expect(readCamera().tx).toBeCloseTo(right.tx * 2, 6)
      fireEvent.keyDown(stage(), { key: 'ArrowDown' })
      expect(readCamera().ty).toBeLessThan(0)
    })

    it('zooms one wheel-notch equivalent per zoom-key press', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.keyDown(stage(), { key: '+' })
      const inOnce = readCamera().zoom
      expect(inOnce).toBeGreaterThan(1)
      fireEvent.keyDown(stage(), { key: '-' })
      expect(readCamera().zoom).toBeCloseTo(1, 6)
      fireEvent.keyDown(stage(), { key: '=' })
      expect(readCamera().zoom).toBeCloseTo(inOnce, 6)
    })

    it('leaves modified key presses to the browser', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.keyDown(stage(), { key: 'ArrowRight', metaKey: true })
      expect(readCamera().tx).toBe(0)
    })

    it('exposes an at-limit state in the DOM when input is given at a clamp', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      expect(stage()).not.toHaveAttribute('data-camera-at-limit')

      // Away from the clamp: no at-limit state.
      fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      expect(stage()).not.toHaveAttribute('data-camera-at-limit')

      // Drive the pan to the rim, then press again.
      for (let i = 0; i < 40; i++) fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      expect(stage()).toHaveAttribute('data-camera-at-limit', 'pan')
      expect(screen.getByTestId('camera-limit-status')).toHaveTextContent(/edge of the lattice/i)
    })

    it('reports each zoom clamp separately, and clears it on a press that moves', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      for (let i = 0; i < 40; i++) fireEvent.keyDown(stage(), { key: '+' })
      expect(stage()).toHaveAttribute('data-camera-at-limit', 'zoom-max')
      fireEvent.keyDown(stage(), { key: '-' })
      expect(stage()).not.toHaveAttribute('data-camera-at-limit')
      for (let i = 0; i < 60; i++) fireEvent.keyDown(stage(), { key: '-' })
      expect(stage()).toHaveAttribute('data-camera-at-limit', 'zoom-min')
    })

    it('brings a focused glyph the camera pushed off-screen back into view', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const glyph = screen.getByTestId('feature-glyph-f-rock')
      // jsdom has no layout, so the off-screen position is stated directly:
      // the glyph's focus indicator sits 80px past the container's right edge.
      glyph.getBoundingClientRect = () =>
        ({ left: W + 40, right: W + 80, top: 10, bottom: 50, width: 40, height: 40, x: W + 40, y: 10, toJSON: () => ({}) }) as DOMRect
      fireEvent.focusIn(glyph)
      // Panned by the minimum displacement, and by pan alone — zoom is intact.
      const after = readCamera()
      expect(after.tx).toBeLessThan(0)
      expect(after.zoom).toBe(1)
    })

    it('leaves the camera alone when focus lands on a glyph already in view', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const glyph = screen.getByTestId('feature-glyph-f-rock')
      glyph.getBoundingClientRect = () =>
        ({ left: 100, right: 140, top: 100, bottom: 140, width: 40, height: 40, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect
      fireEvent.focusIn(glyph)
      expect(readCamera()).toEqual({ zoom: 1, tx: 0, ty: 0 })
    })

    it('does not pan when focus lands on a camera control itself', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      fireEvent.focusIn(screen.getByTestId('camera-recenter'))
      expect(readCamera()).toEqual({ zoom: 1, tx: 0, ty: 0 })
    })

    it('puts the camera controls ahead of the glyph hit targets in the tab order', () => {
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const zoomIn = Number(screen.getByTestId('camera-zoom-in').getAttribute('tabindex'))
      const recenter = Number(screen.getByTestId('camera-recenter').getAttribute('tabindex'))
      const glyph = Number(screen.getByTestId('feature-glyph-f-rock').getAttribute('tabindex'))
      expect(zoomIn).toBeGreaterThan(0)
      expect(recenter).toBeGreaterThan(zoomIn)
      expect(glyph).toBeGreaterThan(recenter)
    })
  })

  describe('picking after pan and zoom', () => {
    // Keyboard input makes the resulting camera exactly predictable, so the
    // expected screen position can be derived rather than read back out of
    // the thing under test.
    const PANNED = {
      zoom: Math.pow(WHEEL_ZOOM_BASE, -WHEEL_NOTCH_DELTA_Y),
      target: { x: 2 * RADIAL_UNIT, y: 0 },
    }
    const panAndZoom = () => {
      fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      fireEvent.keyDown(stage(), { key: 'ArrowRight' })
      fireEvent.keyDown(stage(), { key: '+' })
    }

    it('resolves a bare-cell click to the cell containing that point', () => {
      const onSelectCell = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectCell={onSelectCell} />)
      panAndZoom()
      const p = createBoardProjection(RADIUS, W, H, BOARD_TILT_DEG, PANNED)
      const cell = { ring: 3, slot: 5 }
      const pt = p.project(cellToPoint(cell, S))
      fireEvent.click(stage(), { clientX: pt.x, clientY: pt.y })
      expect(onSelectCell).toHaveBeenCalledWith(cell)
    })

    it('resolves a click on a mark to that mark’s entity', () => {
      const onSelectFeature = vi.fn()
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectFeature={onSelectFeature} />)
      panAndZoom()
      // The glyph rides the overlay's camera-matched transform, so a click
      // dispatched on it IS a click at its drawn position.
      fireEvent.click(screen.getByTestId('feature-glyph-f-rock'))
      expect(onSelectFeature).toHaveBeenCalledWith('f-rock')
    })

    it('clears the selection for a click outside the lattice', () => {
      const onSelectCell = vi.fn()
      const onSelectEmpty = vi.fn()
      render(
        <BoardStage
          board={boardFixture()}
          fleets={[]}
          worldTime={0}
          onSelectCell={onSelectCell}
          onSelectEmpty={onSelectEmpty}
        />,
      )
      panAndZoom()
      const p = createBoardProjection(RADIUS, W, H, BOARD_TILT_DEG, PANNED)
      // A point well outside the rim, projected under the SAME camera.
      const pt = p.project({ x: 0, y: (RADIUS + 6) * RADIAL_UNIT })
      fireEvent.click(stage(), { clientX: pt.x, clientY: pt.y })
      expect(onSelectEmpty).toHaveBeenCalled()
      expect(onSelectCell).not.toHaveBeenCalled()
    })
  })

  describe('reset policy', () => {
    it('resets to the default framing when the route’s systemId changes', () => {
      const { rerender } = render(
        <BoardStage systemId="sys-7" board={boardFixture()} fleets={[]} worldTime={0} />,
      )
      drag(120)
      fireEvent.wheel(stage(), { deltaY: -400 })
      expect(readCamera().tx).not.toBe(0)

      rerender(<BoardStage systemId="sys-9" board={boardFixture()} fleets={[]} worldTime={0} />)
      expect(readCamera()).toEqual({ zoom: 1, tx: 0, ty: 0 })
    })

    it('leaves the camera alone across a selection change', () => {
      const board = boardFixture()
      const { rerender } = render(<BoardStage systemId="sys-7" board={board} fleets={[]} worldTime={0} />)
      drag(120)
      const panned = readCamera()
      rerender(<BoardStage systemId="sys-7" board={board} fleets={[]} worldTime={0} selectedId="f-rock" />)
      expect(readCamera()).toEqual(panned)
    })

    it('leaves the camera alone when a realtime refetch lands new board data', () => {
      const { rerender } = render(
        <BoardStage systemId="sys-7" board={boardFixture()} fleets={[]} worldTime={0} />,
      )
      drag(120)
      const panned = readCamera()
      // A fresh object off the wire with a later worldTime — the shape every
      // poll produces.
      rerender(
        <BoardStage systemId="sys-7" board={{ ...boardFixture(), worldTime: 5_000 }} fleets={[]} worldTime={5_000} />,
      )
      expect(readCamera()).toEqual(panned)
    })
  })

  describe('while the board is unavailable', () => {
    it('removes the camera controls from the tab order entirely', () => {
      guard.available = false
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      expect(screen.queryByTestId('board-camera-controls')).not.toBeInTheDocument()
    })

    it('does not swallow a wheel gesture — the page scrolls normally', () => {
      guard.available = false
      render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })
      fireEvent(stage(), ev)
      expect(ev.defaultPrevented).toBe(false)
    })

    it('moves focus to the retry affordance when a camera control held it', () => {
      const { rerender } = render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
      const recenter = screen.getByTestId('camera-recenter')
      recenter.focus()
      fireEvent.focusIn(recenter)
      expect(document.activeElement).toBe(recenter)

      guard.available = false
      rerender(<BoardStage board={boardFixture()} fleets={[]} worldTime={1} />)
      expect(document.activeElement).toBe(screen.getByTestId('renderer-retry'))
      expect(document.activeElement).not.toBe(document.body)
    })
  })
})
