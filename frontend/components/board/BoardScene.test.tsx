import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { BoardScene } from './BoardScene'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'

const star: BoardFeature = { id: 'star', type: 'star', fixed: true, footprint: [{ q: 0, r: 0 }], band: 'visible', live: true }
const planet: BoardFeature = {
  id: 'p1',
  type: 'rocky',
  orbit: { ring: 4, angle0: 0, period: 2 ** 60, dir: 1 },
  footprint: [{ q: 4, r: 0 }],
  band: 'astronomical',
  live: false,
}

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 's',
  state: { mode: 'coast', coast: { ring: 2, angle0: 0, period: 2 ** 60, dir: 1 } },
  position: { q: 2, r: 0 },
  own: true,
  worldTime: 0,
}
const foreignFleet: Fleet = { ...ownFleet, id: 'theirs', own: false, corporationId: 'corp-other' }

function renderScene(fleets: Fleet[]) {
  return render(
    <svg>
      <BoardScene worldTime={0} features={[star, planet]} fleets={fleets} selectedId="p1" />
    </svg>,
  )
}

describe('BoardScene', () => {
  it('draws a glyph per feature and per fleet, plus rings and a bubble', () => {
    renderScene([ownFleet, foreignFleet])
    expect(screen.getByTestId('feature-glyph-star')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-p1')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-glyph-mine')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-glyph-theirs')).toBeInTheDocument()
    // The planet sits on ring 4, so an orbit ring is drawn.
    expect(screen.getByTestId('orbit-rings').querySelectorAll('polygon').length).toBeGreaterThan(0)
  })

  it('draws a gate glyph per lane gate and reports clicks', () => {
    const gates: LaneGate[] = [
      { destSystemId: 'sys-e', hex: { q: 16, r: 0 } },
      { destSystemId: 'sys-n', hex: { q: 0, r: 16 } },
    ]
    const onSelectGate = vi.fn()
    render(
      <svg>
        <BoardScene worldTime={0} features={[star]} fleets={[]} gates={gates} onSelectGate={onSelectGate} />
      </svg>,
    )
    expect(screen.getByTestId('gate-glyph-sys-e')).toBeInTheDocument()
    expect(screen.getByTestId('gate-glyph-sys-n')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('gate-glyph-sys-e'))
    expect(onSelectGate).toHaveBeenCalledWith('sys-e')
  })

  // Spec: 0008/S5, 0008/S6
  it('draws a departing fleet on its board leg, path and all, then drops it at the gate', () => {
    const departing: Fleet = {
      ...ownFleet,
      state: {
        mode: 'laneTransit',
        laneTransit: {
          boardLeg: {
            path: [
              { q: 2, r: 0 },
              { q: 3, r: 0 },
              { q: 4, r: 0 },
            ],
            startTime: 0,
            gateEta: 10_000,
          },
          route: ['s', 'sys-e'],
          legEtas: [10_000, 60_000],
          departTime: 0,
          arriveTime: 60_000,
          entryGate: { q: -16, r: 0 },
        },
      },
    }

    // Mid-leg: still on this board, with its run out to the gate drawn.
    const { container, rerender } = render(
      <svg>
        <BoardScene worldTime={5_000} features={[star]} fleets={[departing]} />
      </svg>,
    )
    expect(within(container).getByTestId('fleet-glyph-mine')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="burn-paths"] polyline').length).toBe(1)

    // Past the gate ETA it's out on the lane — the galaxy view's picture, not this
    // board's. It must not fall back to the star's (0,0) cell.
    rerender(
      <svg>
        <BoardScene worldTime={20_000} features={[star]} fleets={[departing]} />
      </svg>,
    )
    expect(within(container).queryByTestId('fleet-glyph-mine')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="burn-paths"] polyline').length).toBe(0)
    expect(container.querySelectorAll('[data-testid="scan-bubble"] polygon').length).toBe(0)
  })

  it('draws the sensor bubble only around own units', () => {
    const withOwn = renderScene([ownFleet]).container.querySelectorAll(
      '[data-testid="scan-bubble"] polygon',
    ).length
    expect(withOwn).toBeGreaterThan(0)

    // A foreign-only system shows no own sensor bubble.
    const foreignOnly = render(
      <svg>
        <BoardScene worldTime={0} features={[star]} fleets={[foreignFleet]} />
      </svg>,
    )
    expect(
      foreignOnly.container.querySelectorAll('[data-testid="scan-bubble"] polygon').length,
    ).toBe(0)
  })
})
