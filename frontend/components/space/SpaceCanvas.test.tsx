import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { stubUnsupported } from '@/components/render-guard/test-canvas'
import { SpaceCanvas } from './SpaceCanvas'

// Implementer-authored (openspec build-production-space-view, tasks.md 6.1).
// `SpaceStage.renderer.test.tsx` covers this composition through the stage;
// what is pinned HERE is the slot's own contract, at the seam its consumers
// depend on: the world is mounted against the SAME canvas element the guard
// listens on, the interactive layers exist only while the context is live,
// and availability is reported for `status === 'live'` — never for
// "not unsupported", which would keep offering commands mid-interruption.

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
        renderWorld={(canvas) => {
          seen.push(canvas)
          return null
        }}
      >
        <div data-testid="layers" />
      </SpaceCanvas>,
    )
    const canvas = await screen.findByTestId('space-canvas')
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0], 'the world must attach to the element the guard listens on').toBe(canvas)
    expect(screen.getByTestId('layers')).toBeInTheDocument()
  })

  it('reports availability to its consumer', async () => {
    const onAvailabilityChange = vi.fn()
    render(<SpaceCanvas onAvailabilityChange={onAvailabilityChange} />)
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith(true))
  })

  it('replaces the region — layers included — with the notice when no context can be created', async () => {
    restore = stubUnsupported()
    const onAvailabilityChange = vi.fn()
    render(
      <SpaceCanvas onAvailabilityChange={onAvailabilityChange}>
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
    render(<SpaceCanvas />)
    const notice = await screen.findByTestId('renderer-unsupported')
    expect(notice.getAttribute('data-surface')).toBe('space')
  })
})
