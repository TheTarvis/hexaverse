import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('reports availability and its first frame upward', () => {
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
      />,
    )
    expect(onAvailabilityChange).toHaveBeenCalledWith(true)
    expect(onFirstFrame).toHaveBeenCalled()
  })

  it('publishes an empty selection rather than a stale one when nothing is selected', () => {
    render(<SpaceStage systemId="s" scene={scene} extent={1} worldTime={1} selection={null} scale={undefined} />)
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
      />,
    )
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'point')
  })
})
