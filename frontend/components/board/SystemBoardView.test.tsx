import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SystemBoardView } from './SystemBoardView'
import { useSystemBoard } from '@/hooks/use-system-board'
import { useFleetsInSystem, useFleetOrders, useScan } from '@/hooks/use-fleets'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/use-system-board', () => ({ useSystemBoard: vi.fn() }))
vi.mock('@/hooks/use-fleets', () => ({
  useFleetsInSystem: vi.fn(),
  useFleetOrders: vi.fn(),
  useScan: vi.fn(),
}))
// The world clock is frozen and realtime is a no-op so the composed tree is
// deterministic; the real HexBoard/BoardScene/FactsPanel all render.
vi.mock('@/hooks/use-world-time', () => ({ useWorldTime: () => 0 }))
vi.mock('@/hooks/use-board-realtime', () => ({ useBoardRealtime: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockBoard = vi.mocked(useSystemBoard)
const mockFleets = vi.mocked(useFleetsInSystem)
const mockOrders = vi.mocked(useFleetOrders)
const mockScan = vi.mocked(useScan)

const orderMutate = vi.fn()
const cancelMutate = vi.fn()
const scanMutate = vi.fn()

function boardFixture(): SystemBoard {
  return {
    systemId: 'sys-7',
    radius: 3,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    features: [
      { id: 'f-star', type: 'star', fixed: true, footprint: [{ q: 0, r: 0 }], band: 'visible', live: true },
      {
        id: 'p-1',
        type: 'rocky',
        orbit: { ring: 2, angle0: 0, period: 2 ** 60, dir: 1 },
        footprint: [{ q: 2, r: 0 }],
        band: 'astronomical',
        live: false,
      },
    ],
  }
}

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 'sys-7',
  state: { mode: 'coast', coast: { ring: 3, angle0: 0, period: 2 ** 60, dir: 1 } },
  position: { q: 3, r: 0 },
  own: true,
  worldTime: 0,
}

function boardState(state: Partial<UseQueryResult<SystemBoard, Error>>) {
  mockBoard.mockReturnValue(state as UseQueryResult<SystemBoard, Error>)
}
function fleetsState(fleets: Fleet[]) {
  mockFleets.mockReturnValue({ data: fleets } as UseQueryResult<Fleet[], Error>)
}

describe('SystemBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrders.mockReturnValue({
      order: { mutate: orderMutate, isPending: false },
      cancel: { mutate: cancelMutate, isPending: false },
    } as unknown as ReturnType<typeof useFleetOrders>)
    mockScan.mockReturnValue({ mutate: scanMutate, isPending: false } as unknown as ReturnType<typeof useScan>)
    fleetsState([])
  })

  it('shows a charting placeholder while loading', () => {
    boardState({ isLoading: true, isError: false, data: undefined })
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.queryByTestId('hex-board')).not.toBeInTheDocument()
    expect(screen.getByText(/charting the system/i)).toBeInTheDocument()
  })

  it('shows an error panel when the read fails', () => {
    boardState({ isLoading: false, isError: true, data: undefined, error: new Error('boom') })
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByText(/couldn’t load the system/i)).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('mounts the real board, scene, and facts panel on success', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    expect(screen.getByTestId('hex-board')).toBeInTheDocument()
    expect(screen.getByTestId('hex-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-f-star')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-glyph-mine')).toBeInTheDocument()
    const facts = screen.getByTestId('facts-panel')
    expect(facts).toHaveTextContent('Class G system')
    // An own fleet is present, so the scan verb is offered.
    expect(screen.getByTestId('scan-button')).toBeInTheDocument()
  })

  it('previews and commits a move to a selected body', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    // Select the planet → a move button + ETA preview appear.
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    expect(screen.getByTestId('move-button')).toBeInTheDocument()
    expect(screen.getByTestId('move-eta')).toBeInTheDocument()
    expect(screen.getByTestId('selection-preview')).toBeInTheDocument()

    // Commit → orders the active fleet to intercept that feature.
    fireEvent.click(screen.getByTestId('move-button'))
    expect(orderMutate).toHaveBeenCalledWith(
      { fleetId: 'mine', target: { featureId: 'p-1' } },
      expect.anything(),
    )
  })

  it('commits a scan on the active fleet', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('scan-button'))
    expect(scanMutate).toHaveBeenCalledWith('mine', expect.anything())
  })
})
