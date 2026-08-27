import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntelView } from './IntelView'
import { defaultOrbit, generateSystem } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import { emptyKnowledge, makePatrol } from './intel'

// jsdom's stubbed webgl context satisfies the availability probe but is not a
// real GL context, so THREE.WebGLRenderer construction throws — the view must
// degrade to its fallback instead of crashing.
describe('IntelView', () => {
  it('renders the GL-unavailable fallback when renderer construction fails', () => {
    const clock: SimClock = { t: 0, scale: 1, paused: true }
    const system = generateSystem(1)
    render(
      <IntelView
        system={system}
        clock={{ current: clock }}
        you={{ mode: 'idle', at: defaultOrbit(system, 'p2') }}
        patrol={makePatrol(system, ['p2', 'p4', 'p1'])}
        knowledge={{ current: emptyKnowledge() }}
        godMode={false}
      />
    )
    expect(screen.getByTestId('intel-gl-fallback')).toBeInTheDocument()
  })
})
