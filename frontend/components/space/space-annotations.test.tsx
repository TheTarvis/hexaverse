import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Annotation behavior is observed through the approved public SpaceStage seam.
// Keep this companion suite with space-annotations.ts for file organization;
// it does not call the placement helper or reach into its implementation.

const onSelect = vi.fn()

const marks = [
  { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5.2, pickable: false, selected: false },
  { id: 'feat-body-0', kind: 'body', position: { x: 18, y: -3, z: -15 }, radius: 1.7, pickable: true, selected: false },
  { id: 'feat-body-1', kind: 'body', position: { x: -34, y: 0, z: -42 }, radius: 2.1, pickable: true, selected: false },
  { id: 'gate-sys_-6_16', kind: 'gate', position: { x: 694, y: 0, z: -207 }, radius: 1.2, pickable: true, selected: false },
  { id: 'gate-sys_-7_18', kind: 'gate', position: { x: 241, y: 0, z: 683 }, radius: 1.2, pickable: true, selected: false },
  {
    id: 'contact-0',
    kind: 'contact',
    position: { x: 120, y: 4, z: -60 },
    radius: 0.6,
    pickable: false,
    selected: false,
    emitting: true,
    scanning: false,
    velocity: { x: 2.5, y: 0, z: -1 },
  },
]

const scene = {
  marks,
  curves: [],
  beltFields: [],
    orbitRings: [],
  positionTimeMs: 1,
  decorativeTimeMs: 1,
  omissions: [],
}

import { SpaceStage } from './SpaceStage'

const W = 1200
const H = 900
const EXTENT = 658.7081316032265

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => W })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H })
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
})

async function stage(over: Record<string, unknown> = {}) {
  const available = vi.fn()
  const mounted = render(
     
    <SpaceStage
      systemId="sys_-7_17"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene={scene as any}
      extent={EXTENT}
      worldTime={1}
      scale={1}
      selection={null}
      onSelect={onSelect}
      // fix-world-time-render-loop, task 4.7 migration: static-scene mode —
      // this file exercises the DOM interaction surface, not the frame loop.
      frameSource={null}
      onAvailabilityChange={available}
      {...over}
    />,
  )
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(true))
  return mounted
}

describe('SpaceStage — annotation placement', () => {
  it('restrains passive labels in a dense view while selected and hovered objects remain disclosed', async () => {
    // Density and disclosure use lightweight valid bodies; procedural planet
    // texture construction belongs to art coverage, not this interaction seam.
    const crowded = Array.from({ length: 48 }, (_, index) => ({ ...marks[1], id: `dense-${index}`, bodyType: 'debris', position: { x: (index % 8 - 3.5) * 45, y: (Math.floor(index / 8) - 2.5) * 30, z: 0 }, selected: index === 47 }))
    await stage({ scene: { ...scene, marks: crowded }, selection: { bodyId: 'dense-47' } })
    const selected = screen.getByTestId('space-annotation-dense-47')
    await waitFor(() => expect(selected).toBeVisible())
    const labels = screen.getAllByTestId(/^space-annotation-/)
    const visible = () => labels.filter(label => label.style.visibility === 'visible')
    // Plenty of spatially separated objects fit; passive text must still leave
    // most of the scene available for inspecting their surfaces.
    expect(visible().length).toBeLessThan(crowded.length / 2)
    const suppressed = labels.find(label => label.style.visibility === 'hidden')!
    const id = suppressed.dataset.testid!.replace('space-annotation-', '')
    fireEvent.pointerOver(screen.getByTestId(`body-hit-${id}`))
    await waitFor(() => expect(suppressed).toBeVisible())
    expect(suppressed).toHaveTextContent('debris')
    expect(selected).toBeVisible()
    expect(visible().length).toBeLessThan(crowded.length / 2)
  })

  it('keeps the selected object labeled in a crowd and suppresses colliding labels', async () => {
    const crowded = Array.from({ length: 12 }, (_, index) => ({ ...marks[1], id: `world-${index}`, position: { x: 0, y: 0, z: 0 }, selected: index === 11 }))
    await stage({ scene: { ...scene, marks: crowded }, selection: { bodyId: 'world-11' } })
    await waitFor(() => expect(screen.getByTestId('space-annotation-world-11')).toBeVisible())
    expect(screen.getAllByTestId(/^space-annotation-/).filter(el => el.style.visibility === 'visible').length).toBeLessThan(12)
    fireEvent.pointerOver(screen.getByTestId('body-hit-world-10'))
    await waitFor(() => expect(screen.getByTestId('space-annotation-world-10')).toBeVisible())
    expect(screen.getByTestId('space-annotation-world-11')).toBeVisible()
  })

  it('tracks camera movement without losing touch and keyboard selection', async () => {
    await stage()
    const label = screen.getByTestId('space-annotation-feat-body-0')
    await waitFor(() => expect(label).toBeVisible())
    const before = label.style.transform
    fireEvent.keyDown(screen.getByTestId('camera-orbit'), { key: 'ArrowRight' })
    await waitFor(() => expect(label.style.transform).not.toBe(before))
    const hit = screen.getByTestId('body-hit-feat-body-0')
    fireEvent.touchStart(hit, { touches: [{ identifier: 1, clientX: 300, clientY: 300 }] })
    fireEvent.touchEnd(hit, { changedTouches: [{ identifier: 1, clientX: 300, clientY: 300 }] })
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
    onSelect.mockClear()
    hit.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })
  })

  it('uses a disclosed name without adding contact identity to annotations', async () => {
    await stage({ scene: { ...scene, marks: marks.map(mark => mark.id === 'feat-body-0' ? { ...mark, name: 'Pelagos' } : mark) } })
    expect(screen.getByTestId('space-annotation-feat-body-0')).toHaveTextContent('Pelagos')
    expect(screen.queryByTestId('space-annotation-contact-0')).toBeNull()
  })
})
