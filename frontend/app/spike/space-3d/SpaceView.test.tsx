import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpaceView } from './SpaceView'
import { defaultOrbit, generateSystem } from './sim'
import type { SimClock } from './SpaceView'

// jsdom's stubbed webgl context satisfies the availability probe but is not a
// real GL context, so THREE.WebGLRenderer construction throws — which is the
// path this asserts: the view degrades to its fallback instead of crashing.
describe('SpaceView', () => {
  it('renders the GL-unavailable fallback when renderer construction fails', () => {
    const clock: SimClock = { t: 0, scale: 1, paused: true }
    const system = generateSystem(1)
    render(
      <SpaceView
        system={system}
        clock={{ current: clock }}
        ship={{ mode: 'idle', at: defaultOrbit(system, 'p1') }}
        preview={null}
        selected={null}
        onPick={vi.fn()}
        onArrive={vi.fn()}
      />
    )
    expect(screen.getByTestId('space-gl-fallback')).toBeInTheDocument()
  })
})
