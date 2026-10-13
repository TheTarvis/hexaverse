import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SpaceWorld } from './webgl/SpaceWorld'
import { defaultCamera } from './space-camera'
import { viewBasisOf } from './space-projection'
import React from 'react'
import { stubUnsupported } from '@/components/render-guard/test-canvas'
import { SpaceCanvas, type SpaceRendererBindings } from './SpaceCanvas'

const camera = defaultCamera(100)
const frameRef = { current: { camera, scene: { marks: [], curves: [], beltFields: [], orbitRings: [], omissions: [], positionTimeMs: 0, decorativeTimeMs: 0 }, basis: viewBasisOf(camera, { width: 320, height: 200 }), projected: new Map() } }
const world = (canvas: HTMLCanvasElement, bindings: SpaceRendererBindings) => <SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} {...bindings} />

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
})

describe('SpaceCanvas', () => {
  it('mounts the world against the guarded canvas element itself', async () => {
    const seen: HTMLCanvasElement[] = []
    render(
      <SpaceCanvas
        renderWorld={(canvas, bindings) => {
          seen.push(canvas)
          return world(canvas, bindings)
        }}
      >
        <div data-testid="layers" />
      </SpaceCanvas>,
    )
    const canvas = await screen.findByTestId('space-canvas')
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0], 'the world must attach to the element the guard listens on').toBe(canvas)
    await waitFor(() => expect(screen.getByTestId('layers')).toBeInTheDocument())
  })

  it('reports availability to its consumer', async () => {
    const onAvailabilityChange = vi.fn()
    render(<SpaceCanvas renderWorld={world} onAvailabilityChange={onAvailabilityChange} />)
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith(true))
  })

  it('replaces the region — layers included — with the notice when no context can be created', async () => {
    restore = stubUnsupported()
    const onAvailabilityChange = vi.fn()
    render(
      <SpaceCanvas renderWorld={world} onAvailabilityChange={onAvailabilityChange}>
        <div data-testid="layers" />
      </SpaceCanvas>,
    )
    await screen.findByTestId('renderer-unsupported')
    expect(screen.queryByTestId('space-canvas')).toBeNull()
    expect(screen.queryByTestId('layers'), 'a hit target over a dead canvas is a mark with nothing under it').toBeNull()
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith(false))
  })

  it('names this view as the failing surface, never the retired board', async () => {
    restore = stubUnsupported()
    render(<SpaceCanvas renderWorld={world} />)
    const notice = await screen.findByTestId('renderer-unsupported')
    expect(notice.getAttribute('data-surface')).toBe('space')
  })
})
