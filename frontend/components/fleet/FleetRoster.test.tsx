import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FleetRoster } from './FleetRoster'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import type { Fleet } from '@/lib/types/fleet'

vi.mock('@/hooks/use-fleets', () => ({ useMyFleets: vi.fn() }))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))

const mockFleets = vi.mocked(useMyFleets)
const mockGalaxy = vi.mocked(useGalaxy)

const fleet = (id: string, systemId: string, state: Fleet['state']): Fleet => ({
  id,
  corporationId: 'corp',
  systemId,
  state,
  position: { q: 0, r: 0 },
  own: true,
  worldTime: 0,
})

const coasting = fleet('fleet_1', 'sys-0', {
  mode: 'coast',
  coast: { ring: 2, angle0: 0, period: 1000, dir: 1 },
})
const travelling = fleet('fleet_2', 'sys-0', {
  mode: 'laneTransit',
  laneTransit: {
    route: ['sys-0', 'sys-1'],
    legEtas: [0, 120_000],
    departTime: 0,
    arriveTime: 120_000,
    entryGate: { q: 0, r: 0 },
  },
})

function setFleets(fleets: Fleet[]) {
  mockFleets.mockReturnValue({ data: fleets } as unknown as ReturnType<typeof useMyFleets>)
}

describe('FleetRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGalaxy.mockReturnValue({
      data: {
        nodes: [
          { id: 'sys-0', name: 'Axion' },
          { id: 'sys-1', name: 'Borealis' },
        ],
      },
    } as unknown as ReturnType<typeof useGalaxy>)
    setFleets([])
  })

  it('says nothing at all when the player has no fleets yet', () => {
    render(<FleetRoster worldTime={0} />)
    expect(screen.queryByTestId('fleet-roster')).not.toBeInTheDocument()
  })

  // Spec: 0011/S1
  it('lists every fleet with where it is and what it is doing', () => {
    setFleets([coasting, travelling])
    render(<FleetRoster worldTime={60_000} />)

    expect(screen.getByTestId('fleet-roster')).toHaveTextContent('Fleets')
    const idle = screen.getByTestId('fleet-row-fleet_1')
    expect(idle).toHaveTextContent('Axion')
    expect(idle).toHaveTextContent('On station')

    // The travelling one names the lane it's on and counts down to arrival.
    const moving = screen.getByTestId('fleet-row-fleet_2')
    expect(moving).toHaveTextContent('Axion → Borealis')
    expect(moving).toHaveTextContent('In transit')
    expect(screen.getByTestId('fleet-row-eta-fleet_2')).toHaveTextContent('1m')
  })

  it('marks the fleet the view is commanding, and the ones on the open board', () => {
    setFleets([coasting])
    render(<FleetRoster worldTime={0} activeFleetId="fleet_1" currentSystemId="sys-0" />)

    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveTextContent('here')
  })

  it('hands a clicked fleet back to the view', () => {
    setFleets([coasting])
    const onSelect = vi.fn()
    render(<FleetRoster worldTime={0} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('fleet-row-fleet_1'))
    expect(onSelect).toHaveBeenCalledWith(coasting)
  })

  it('collapses to its header', () => {
    setFleets([coasting])
    render(<FleetRoster worldTime={0} />)

    fireEvent.click(screen.getByTestId('fleet-roster-toggle'))
    expect(screen.queryByTestId('fleet-row-fleet_1')).not.toBeInTheDocument()
    expect(screen.getByTestId('fleet-roster')).toHaveTextContent('Fleets')
  })
})
