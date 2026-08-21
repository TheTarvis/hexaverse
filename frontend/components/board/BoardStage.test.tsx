import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { hexToPixel } from '@/lib/hex/pixel'
import type { SystemBoard } from '@/lib/types/system-board'
import { BoardStage } from './BoardStage'
import { createBoardProjection, BOARD_TILT_DEG } from './use-board-projection'

// The stage's canvas region is mocked at its seam: the mock reports the
// availability the test dictates and mounts the (also mocked) GL world so the
// first-frame signal can fire. Everything else — overlay, projection,
// picking — runs for real in jsdom.
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
    React.useEffect(() => {
      onAvailabilityChange?.(guard.available)
    }, [onAvailabilityChange])
    return React.createElement(
      'div',
      { 'data-testid': 'board-canvas-region' },
      React.createElement('canvas', { 'data-testid': 'board-canvas', ref: setCanvas }),
      canvas && guard.available ? renderWorld?.(canvas) : null,
    )
  }
  return { BoardCanvas: BoardCanvasMock, default: BoardCanvasMock }
})

vi.mock('./webgl/WebGLBoard', async () => {
  const React = await import('react')
  function WebGLBoardMock({ onFirstFrame }: { onFirstFrame?: () => void }) {
    React.useEffect(() => {
      onFirstFrame?.()
    }, [onFirstFrame])
    return null
  }
  return { WebGLBoard: WebGLBoardMock, default: WebGLBoardMock }
})

const W = 1200
const H = 900

function boardFixture(): SystemBoard {
  return {
    systemId: 'sys-7',
    radius: 3,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    laneGates: [],
    features: [
      { id: 'f-star', type: 'star', fixed: true, footprint: [{ q: 0, r: 0 }], band: 'visible', live: true },
    ],
  }
}

describe('BoardStage', () => {
  // jsdom has no layout: give the stage host a real measured size so the
  // projection hook computes the actual camera (same numbers the assertions
  // recompute through createBoardProjection).
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

  it('resolves a canvas click to the containing hex via unproject → pixelToHex', () => {
    const onSelectHex = vi.fn()
    const onSelectEmpty = vi.fn()
    render(
      <BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectHex={onSelectHex} onSelectEmpty={onSelectEmpty} />,
    )
    const projection = createBoardProjection(3, W, H, BOARD_TILT_DEG)
    const target = { q: 2, r: -1 }
    const screenPt = projection.project(hexToPixel(target.q, target.r))
    fireEvent.click(screen.getByTestId('board-stage'), { clientX: screenPt.x, clientY: screenPt.y })
    expect(onSelectHex).toHaveBeenCalledWith(target)
    expect(onSelectEmpty).not.toHaveBeenCalled()
  })

  it('clears the selection when the click lands outside the lattice', () => {
    const onSelectHex = vi.fn()
    const onSelectEmpty = vi.fn()
    render(
      <BoardStage board={boardFixture()} fleets={[]} worldTime={0} onSelectHex={onSelectHex} onSelectEmpty={onSelectEmpty} />,
    )
    fireEvent.click(screen.getByTestId('board-stage'), { clientX: 3, clientY: 3 })
    expect(onSelectEmpty).toHaveBeenCalled()
    expect(onSelectHex).not.toHaveBeenCalled()
  })

  it('tracks the hovered tile for the overlay highlight', () => {
    render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} />)
    const projection = createBoardProjection(3, W, H, BOARD_TILT_DEG)
    const screenPt = projection.project(hexToPixel(1, 1))
    // jsdom has no PointerEvent constructor; a MouseEvent with the pointermove
    // type carries the coordinates through to React's onPointerMove.
    fireEvent(
      screen.getByTestId('board-stage'),
      new MouseEvent('pointermove', { bubbles: true, clientX: screenPt.x, clientY: screenPt.y }),
    )
    expect(screen.getByTestId('hover-hex')).toBeInTheDocument()
    fireEvent.pointerLeave(screen.getByTestId('board-stage'))
    expect(screen.queryByTestId('hover-hex')).not.toBeInTheDocument()
  })

  it('reports the first rendered frame up through onFirstFrame', () => {
    const onFirstFrame = vi.fn()
    render(<BoardStage board={boardFixture()} fleets={[]} worldTime={0} onFirstFrame={onFirstFrame} />)
    expect(onFirstFrame).toHaveBeenCalled()
  })

  it('unmounts the overlay while the canvas region is not live — no hit shapes over a notice', () => {
    guard.available = false
    const onAvailabilityChange = vi.fn()
    render(
      <BoardStage board={boardFixture()} fleets={[]} worldTime={0} onAvailabilityChange={onAvailabilityChange} />,
    )
    expect(onAvailabilityChange).toHaveBeenCalledWith(false)
    expect(screen.queryByTestId('hex-board')).not.toBeInTheDocument()
  })
})
