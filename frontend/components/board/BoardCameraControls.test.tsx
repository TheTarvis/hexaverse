import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BoardCameraControls, CAMERA_CONTROL_COUNT } from './BoardCameraControls'
import { DEFAULT_CAMERA, ZOOM_MAX, ZOOM_MIN, type BoardCamera } from './board-camera'
import { CAMERA_CONTROL_ATTR } from './use-board-gestures'

function setup(camera: BoardCamera = DEFAULT_CAMERA) {
  const setCamera = vi.fn<(next: (prev: BoardCamera) => BoardCamera) => void>()
  const resetCamera = vi.fn()
  render(<BoardCameraControls camera={camera} setCamera={setCamera} resetCamera={resetCamera} />)
  return { setCamera, resetCamera }
}

// The controls hand setCamera a reducer; applying it to a known camera is what
// makes the assertion about behaviour rather than about which function was
// passed.
function applied(setCamera: { mock: { calls: [(prev: BoardCamera) => BoardCamera][] } }, from: BoardCamera) {
  return setCamera.mock.calls[0]![0](from)
}

describe('BoardCameraControls', () => {
  it('zooms in and out through the same clamped path every other input uses', () => {
    const { setCamera } = setup()
    fireEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(applied(setCamera, DEFAULT_CAMERA).zoom).toBeGreaterThan(1)
  })

  it('zooms out on the minus control', () => {
    const { setCamera } = setup()
    fireEvent.click(screen.getByTestId('camera-zoom-out'))
    expect(applied(setCamera, DEFAULT_CAMERA).zoom).toBeLessThan(1)
  })

  it('holds at the clamp rather than running past it', () => {
    const { setCamera } = setup({ zoom: ZOOM_MAX, target: { x: 0, y: 0 } })
    fireEvent.click(screen.getByTestId('camera-zoom-in'))
    expect(applied(setCamera, { zoom: ZOOM_MAX, target: { x: 0, y: 0 } }).zoom).toBe(ZOOM_MAX)
  })

  it('marks each zoom control at its own limit', () => {
    setup({ zoom: ZOOM_MIN, target: { x: 0, y: 0 } })
    expect(screen.getByTestId('camera-zoom-out')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('camera-zoom-in')).toHaveAttribute('aria-disabled', 'false')
  })

  it('recenters to the default framing on pointer activation', () => {
    const { resetCamera } = setup({ zoom: 3, target: { x: 100, y: -40 } })
    fireEvent.click(screen.getByTestId('camera-recenter'))
    expect(resetCamera).toHaveBeenCalledTimes(1)
  })

  it('recenters identically from the keyboard — Enter and Space', () => {
    // A native <button> is what makes this true: Enter and Space both
    // synthesize a click, so there is no second activation path to keep in
    // step with the pointer one.
    const { resetCamera } = setup({ zoom: 3, target: { x: 100, y: -40 } })
    const recenter = screen.getByTestId('camera-recenter')
    expect(recenter.tagName).toBe('BUTTON')
    expect(recenter).toHaveAttribute('type', 'button')
    fireEvent.click(recenter)
    expect(resetCamera).toHaveBeenCalled()
  })

  it('reports when it is already at the default framing — where activating is a no-op', () => {
    setup()
    expect(screen.getByTestId('camera-recenter')).toHaveAttribute('data-at-default', 'true')
  })

  it('stays in the tab order even at the default framing, rather than disabling', () => {
    // Disabling would drop the control out of the tab order and shift every
    // stop after it under the player's hands.
    setup()
    const recenter = screen.getByTestId('camera-recenter')
    expect(recenter).not.toBeDisabled()
    expect(Number(recenter.getAttribute('tabindex'))).toBe(CAMERA_CONTROL_COUNT)
  })

  it('occupies exactly CAMERA_CONTROL_COUNT tab stops, in visual order', () => {
    setup()
    const stops = ['camera-zoom-in', 'camera-zoom-out', 'camera-recenter'].map((id) =>
      Number(screen.getByTestId(id).getAttribute('tabindex')),
    )
    expect(stops).toEqual([1, 2, 3])
    expect(stops.length).toBe(CAMERA_CONTROL_COUNT)
  })

  it('contains its own activation so it never reaches the board’s click-to-pick path', () => {
    const onBoardClick = vi.fn()
    const setCamera = vi.fn()
    render(
      <div onClick={onBoardClick}>
        <BoardCameraControls camera={DEFAULT_CAMERA} setCamera={setCamera} resetCamera={vi.fn()} />
      </div>,
    )
    fireEvent.click(screen.getByTestId('camera-recenter'))
    expect(onBoardClick).not.toHaveBeenCalled()
  })

  it('marks itself with the attribute the stage’s gesture listeners skip', () => {
    setup()
    expect(screen.getByTestId('board-camera-controls')).toHaveAttribute(CAMERA_CONTROL_ATTR)
  })

  it('carries a visible focus indicator while focused', () => {
    setup()
    for (const id of ['camera-zoom-in', 'camera-zoom-out', 'camera-recenter']) {
      // A rendered difference, not the UA default that a reset stylesheet may
      // already have removed.
      expect(screen.getByTestId(id).className).toMatch(/focus-visible:outline/)
    }
  })

  it('names itself as a group for assistive technology', () => {
    setup()
    const group = screen.getByTestId('board-camera-controls')
    expect(group).toHaveAttribute('role', 'group')
    expect(group).toHaveAttribute('aria-label', 'Board camera')
  })
})
