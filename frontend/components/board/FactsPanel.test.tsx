import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactsPanel, type BoardSelection } from './FactsPanel'
import { planToHex } from './move-preview'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 's',
  state: { mode: 'coast' },
  position: { q: 3, r: 0 },
  own: true,
  worldTime: 0,
}

const base = {
  starClass: 'G',
  character: 'star_rich',
  radius: 16,
  featureCount: 4,
  worldTime: 1_000_000,
  pending: false,
  route: null,
  onMove: vi.fn(),
  onScan: vi.fn(),
  onCancel: vi.fn(),
  onDepart: vi.fn(),
}

function feature(over: Partial<BoardFeature>): BoardFeature {
  return { id: 'f', type: 'rocky', footprint: [{ q: 2, r: 0 }], band: 'visible', live: true, ...over }
}

describe('FactsPanel', () => {
  it('offers scan on the active fleet and reports its mode', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={ownFleet} plan={null} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('coast')
    expect(screen.getByTestId('scan-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('scan-button'))
    expect(base.onScan).toHaveBeenCalled()
  })

  it('shows a move commit + ETA for a selected body', () => {
    const selection: BoardSelection = { kind: 'feature', feature: feature({ id: 'p1' }) }
    const plan = planToHex({ q: 3, r: 0 }, { q: 2, r: 0 }, 0)
    render(<FactsPanel {...base} selection={selection} activeFleet={ownFleet} plan={plan} />)
    expect(screen.getByTestId('move-button')).toHaveTextContent('Intercept')
    expect(screen.getByTestId('move-eta')).toHaveTextContent('ETA')
  })

  it('blocks moving onto the star (no plan → no move button, shows a note)', () => {
    const star: BoardSelection = { kind: 'feature', feature: feature({ id: 'star', type: 'star', fixed: true }) }
    render(<FactsPanel {...base} selection={star} activeFleet={ownFleet} plan={null} />)
    expect(screen.queryByTestId('move-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('core-blocked')).toBeInTheDocument()
  })

  it('ghosts a remembered body with its last-seen age; hides worth on astronomical', () => {
    const remembered: BoardSelection = {
      kind: 'feature',
      feature: feature({ band: 'remembered', asOf: 1_000_000 - 120_000 }),
    }
    const { rerender } = render(
      <FactsPanel {...base} selection={remembered} activeFleet={null} plan={null} />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent(/last seen/i)

    const astro: BoardSelection = { kind: 'feature', feature: feature({ band: 'astronomical' }) }
    rerender(<FactsPanel {...base} selection={astro} activeFleet={null} plan={null} />)
    expect(screen.getByTestId('selection')).toHaveTextContent(/scan to reveal/i)
  })

  const gate: LaneGate = { destSystemId: 'sys-neighbour', hex: { q: 16, r: 0 } }
  const gateSelection: BoardSelection = { kind: 'gate', gate }

  it('previews the route and departs through a selected gate', () => {
    const route: RoutePreview = {
      route: ['sys-here', 'sys-neighbour'],
      legEtas: [1_030_000, 1_120_000], // gate ETA, then arrival
      totalEta: 1_120_000,
      departGate: { q: 16, r: 0 },
      worldTime: 1_000_000,
    }
    render(
      <FactsPanel
        {...base}
        selection={gateSelection}
        activeFleet={ownFleet}
        plan={null}
        route={{ isLoading: false, isError: false, data: route }}
      />,
    )
    expect(screen.getByTestId('gate-facts')).toBeInTheDocument()
    const depart = screen.getByTestId('depart-button')
    expect(depart).toHaveTextContent('Depart')
    fireEvent.click(depart)
    expect(base.onDepart).toHaveBeenCalled()
  })

  it('reports no charted route through a gate', () => {
    render(
      <FactsPanel
        {...base}
        selection={gateSelection}
        activeFleet={ownFleet}
        plan={null}
        route={{ isLoading: false, isError: true }}
      />,
    )
    expect(screen.getByTestId('gate-no-route')).toBeInTheDocument()
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  it('asks for a fleet before departing when none is here', () => {
    render(
      <FactsPanel {...base} selection={gateSelection} activeFleet={null} plan={null} route={null} />,
    )
    expect(screen.getByTestId('gate-facts')).toHaveTextContent(/bring a fleet here/i)
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  it('offers cancel only while the active fleet is burning', () => {
    // The burn's ETA sits ahead of the panel's worldTime — a past-ETA burn IS
    // already settled (stateAt) and correctly offers no cancel.
    const burning: Fleet = {
      ...ownFleet,
      state: {
        mode: 'burn',
        burn: {
          path: [{ q: 0, r: 0 }],
          startTime: 0,
          arriveTime: 2_000_000,
          target: { hex: { q: 0, r: 0 } },
        },
      },
    }
    render(<FactsPanel {...base} selection={null} activeFleet={burning} plan={null} />)
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
    // Scan is blocked while burning (single action slot).
    expect(screen.getByTestId('scan-button')).toBeDisabled()
  })
})
