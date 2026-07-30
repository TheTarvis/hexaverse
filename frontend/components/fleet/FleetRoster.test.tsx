import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FleetRoster } from './FleetRoster'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { queryKeys } from '@/lib/query-keys'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'

vi.mock('@/hooks/use-fleets', () => ({ useMyFleets: vi.fn() }))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))

const mockFleets = vi.mocked(useMyFleets)
const mockGalaxy = vi.mocked(useGalaxy)

// The roster sweeps the query cache for running mines (add-mine-ui), so every
// render mounts inside a provider; tests seed the cache through `qc`.
let qc: QueryClient
function render(ui: React.ReactElement) {
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

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
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

  // add-mine-ui, fleet-roster delta: the honest mining label, read from the
  // cached running-actions query — no per-row fetching.
  it('reads a docked fleet with a cached running mine as Mining, with a countdown', () => {
    const docked = fleet('fleet_1', 'sys-0', { mode: 'docked', docked: { parentId: 'p1' } })
    setFleets([docked])
    const mineAction: GameAction = {
      id: 'action_mine',
      type: 'mine',
      actor: 'fleet_1',
      scope: 'sys-0',
      params: { featureId: 'p1', kind: 'metals', tons: 40 },
      committedAt: 0,
      eta: 90_000,
      status: 'running',
      worldTime: 0,
    }
    qc.setQueryData(queryKeys.actions.running('fleet_1'), [mineAction])

    render(<FleetRoster worldTime={30_000} />)

    const row = screen.getByTestId('fleet-row-fleet_1')
    expect(row).toHaveTextContent('Mining')
    expect(screen.getByTestId('fleet-row-eta-fleet_1')).toHaveTextContent('1m')
  })

  it('drops the mining label once the run’s eta passes, by world time alone', () => {
    const docked = fleet('fleet_1', 'sys-0', { mode: 'docked', docked: { parentId: 'p1' } })
    setFleets([docked])
    qc.setQueryData(queryKeys.actions.running('fleet_1'), [
      {
        id: 'action_mine',
        type: 'mine',
        actor: 'fleet_1',
        scope: 'sys-0',
        committedAt: 0,
        eta: 90_000,
        status: 'running',
        worldTime: 0,
      } satisfies GameAction,
    ])

    render(<FleetRoster worldTime={91_000} />)

    const row = screen.getByTestId('fleet-row-fleet_1')
    expect(row).toHaveTextContent('Docked')
    expect(row).not.toHaveTextContent('Mining')
  })
})
