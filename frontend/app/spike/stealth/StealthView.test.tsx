import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StealthView } from './StealthView'
import { generateSystem } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import { makePatrol } from '../intel/intel'
import { DEFAULT_DIALS } from './stealth'

// Pure SVG — no GL gate needed. In jsdom the SVG never measures so the rAF
// loop never starts; this asserts the static frame draws the geometry.
describe('StealthView', () => {
  it('renders wedges, the observer handle, and a placed marker', () => {
    const clock: SimClock = { t: 0, scale: 1, paused: true }
    const system = generateSystem(1)
    render(
      <StealthView
        system={system}
        clock={{ current: clock }}
        patrol={makePatrol(system, ['p2', 'p4', 'p1'])}
        observer={{ x: 80, z: 60 }}
        marker={{ x: 10, z: 10 }}
        dials={DEFAULT_DIALS}
        arcBodyId="p2"
        onObserverMove={vi.fn()}
        onPlaceMarker={vi.fn()}
      />
    )
    expect(screen.getByTestId('stealth-svg')).toBeInTheDocument()
    expect(screen.getByTestId('observer-handle')).toBeInTheDocument()
    expect(screen.getByTestId('sk-marker')).toBeInTheDocument()
    // Every planet and the star cast a wedge from an outside observer.
    expect(screen.getByTestId('wedge-star')).toBeInTheDocument()
  })
})
