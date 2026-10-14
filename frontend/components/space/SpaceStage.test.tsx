import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { SpaceStage } from './SpaceStage'
import type { SceneModel } from './space-scene'

// Implementer-authored companion to the SDET's two stage suites
// (`SpaceStage.interaction.test.tsx`, `SpaceStage.renderer.test.tsx`), which
// cover the gestures, the keyboard surface and the availability states.
// What is pinned HERE is the stage's own PROP CONTRACT — the state it
// publishes to the view above it, and the fact that it reads the scene only
// inside the guarded region.

const scene: SceneModel = {
  marks: [
    { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5, pickable: false, selected: false },
    { id: 'feat-body-0', kind: 'body', position: { x: 18, y: -3, z: -15 }, radius: 1.7, pickable: true, selected: true },
  ],
  curves: [],
  beltFields: [],
    orbitRings: [],
  positionTimeMs: 7,
  decorativeTimeMs: 7,
  omissions: [],
}

const W = 1200
const H = 900

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
})

describe('SpaceStage — the state it publishes', () => {
  it('publishes its camera, its selection and its draw stamp on the region', () => {
    render(
      <SpaceStage
        systemId="sys_-7_17"
        scene={scene}
        extent={658.7}
        worldTime={4242}
        selection={{ bodyId: 'feat-body-0' }}
        // SDET repair (add-figure-formatting build adjudications, dispute 2):
        // `scale` restored to a required key; this suite pins the stage's
        // published state, not a scale-dependent figure, so a scale-less
        // mount is the correct explicit value.
        scale={undefined}
        // fix-world-time-render-loop, task 4.7 migration: `frameSource` is a
        // required key (contract §7.1); `null` is the static-scene test mode
        // — this suite asserts published state, not the frame loop.
        frameSource={null}
      />,
    )
    const region = screen.getByTestId('space-canvas-region')
    const camera = JSON.parse(region.getAttribute('data-camera')!)
    expect(camera).toMatchObject({ target: { x: 0, y: 0, z: 0 } })
    expect(camera.distance).toBeGreaterThan(0)
    expect(region).toHaveAttribute('data-selection', 'feat-body-0')
    expect(region).toHaveAttribute('data-draw-world-time', '4242')
    // Reframing is immediate: an eased camera move under a player reaching
    // for an off-screen gate is a moving target.
    expect(region).toHaveAttribute('data-reframe-animated', 'false')
  })

  it('reports availability and its first frame upward', async () => {
    const onAvailabilityChange = vi.fn()
    const onFirstFrame = vi.fn()
    render(
      <SpaceStage
        systemId="s"
        scene={scene}
        extent={1}
        worldTime={1}
        selection={null}
        onAvailabilityChange={onAvailabilityChange}
        onFirstFrame={onFirstFrame}
        scale={undefined}
        frameSource={null}
      />,
    )
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith(true))
    // Availability is reported before the parent's first-frame effect commits.
    await waitFor(() => expect(onFirstFrame).toHaveBeenCalled())
  })

  it('publishes an empty selection rather than a stale one when nothing is selected', () => {
    render(<SpaceStage systemId="s" scene={scene} extent={1} worldTime={1} selection={null} scale={undefined} frameSource={null} />)
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', '')
  })

  it('marks a bare point selection as such, without a body id', () => {
    render(
      <SpaceStage
        systemId="s"
        scene={scene}
        extent={1}
        worldTime={1}
        selection={{ point: { x: 3, y: 0, z: 4 } }}
        scale={undefined}
        frameSource={null}
      />,
    )
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'point')
  })
})

it('focuses the enrolled starter once and leaves recenter and later refetches under player control', async () => {
  const starter = { id: 'starter', kind: 'fleet' as const, position: { x: 50, y: 2, z: 10 }, radius: 1, pickable: false, selected: false }
  const props = { systemId: 'home', scene: { ...scene, marks: [...scene.marks, starter] }, extent: 658.7, worldTime: 1, scale: 1, selection: null, frameSource: null, initialFocusFleetId: 'starter' }
  const { rerender } = render(<SpaceStage {...props} />)
  await waitFor(() => expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true'))
  const camera = () => JSON.parse(screen.getByTestId('space-canvas-region').getAttribute('data-camera')!)
  expect(camera().target).toEqual(starter.position)
  await waitFor(() => expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true'))
  fireEvent.click(screen.getByTestId('camera-recenter'))
  expect(camera().target).toEqual({ x: 0, y: 0, z: 0 })
  rerender(<SpaceStage {...props} scene={{ ...scene, marks: [{ ...starter, position: { x: 80, y: 0, z: 0 } }] }} />)
  expect(camera().target).toEqual({ x: 0, y: 0, z: 0 })
})

it('refocuses the same fleet on request at its latest position with a close camera', async () => {
  const fleet = { id: 'active', kind: 'fleet' as const, position: { x: 50, y: 0, z: 10 }, radius: 1, pickable: false, selected: false }
  const props = { systemId: 'home', scene: { ...scene, marks: [fleet] }, extent: 658.7, worldTime: 1, scale: 1, selection: null, frameSource: null }
  const { rerender } = render(<SpaceStage {...props} focusFleetRequest={{ fleetId: 'active', sequence: 1 }} />)
  const camera = () => JSON.parse(screen.getByTestId('space-canvas-region').getAttribute('data-camera')!)
  expect(camera().target).toEqual(fleet.position)
  expect(camera().distance).toBeCloseTo(props.extent * 0.3)
  await waitFor(() => expect(screen.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true'))
  fireEvent.click(screen.getByTestId('camera-recenter'))
  const moved = { ...fleet, position: { x: 90, y: 0, z: 20 } }
  rerender(<SpaceStage {...props} scene={{ ...scene, marks: [moved] }} focusFleetRequest={{ fleetId: 'active', sequence: 2 }} />)
  expect(camera().target).toEqual(moved.position)
})
