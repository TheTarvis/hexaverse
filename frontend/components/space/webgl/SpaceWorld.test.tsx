import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { SpaceWorld } from './SpaceWorld'
import type { SceneModel } from '../space-scene'
import { defaultCamera } from '../space-camera'

// Implementer-authored (openspec build-production-space-view). The one thing
// worth pinning about this module outside a browser: it FAILS SOFT. A
// context that cannot answer the calls a renderer makes — jsdom's stub, or a
// driver that refused — must leave it mounting, drawing nothing, and
// throwing nothing, because the renderer-availability guard (not this
// module) owns the player-facing unavailable state. A renderer half-built
// against such a context also attaches its own context-lost listeners and
// then throws from inside them, outside any React boundary.

const scene: SceneModel = {
  marks: [
    { id: 'feat-star', kind: 'star', position: { x: 0, y: 0, z: 0 }, radius: 5, pickable: false, selected: false },
  ],
  curves: [],
  beltFields: [],
    orbitRings: [],
  positionTimeMs: 1,
  decorativeTimeMs: 1,
  omissions: [],
}

describe('SpaceWorld', () => {
  it('mounts, draws nothing and throws nothing against a context it cannot use', () => {
    const canvas = document.createElement('canvas')
    const spy = vi.spyOn(canvas, 'getContext')
    expect(() =>
      render(<SpaceWorld canvas={canvas} scene={scene} camera={defaultCamera(658.7)} extent={658.7} />),
    ).not.toThrow()
    expect(spy, 'it must probe the context before building anything against it').toHaveBeenCalled()
  })

  it('registers no listener on a canvas it never built a renderer for', () => {
    const canvas = document.createElement('canvas')
    const added = vi.spyOn(canvas, 'addEventListener')
    render(<SpaceWorld canvas={canvas} scene={scene} camera={defaultCamera(1)} extent={1} />)
    const events = added.mock.calls.map((c) => c[0])
    expect(events).not.toContain('webglcontextrestored')
    expect(events).not.toContain('webglcontextlost')
  })

  it('renders no DOM of its own — the canvas is the whole surface', () => {
    const canvas = document.createElement('canvas')
    const { container } = render(
      <SpaceWorld canvas={canvas} scene={scene} camera={defaultCamera(1)} extent={1} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
