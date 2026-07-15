import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SystemBoardView } from './SystemBoardView'
import { useSystemBoard } from '@/hooks/use-system-board'
import {
  useFleetsInSystem,
  useFleetOrders,
  useScan,
  useRoutePreview,
  useFleetTravel,
  useMyFleets,
} from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useRunningScan } from '@/hooks/use-actions'
import { useBoardRealtime } from '@/hooks/use-board-realtime'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/use-system-board', () => ({ useSystemBoard: vi.fn() }))
vi.mock('@/hooks/use-actions', () => ({ useRunningScan: vi.fn() }))
vi.mock('@/hooks/use-fleets', () => ({
  useFleetsInSystem: vi.fn(),
  useFleetOrders: vi.fn(),
  useScan: vi.fn(),
  useRoutePreview: vi.fn(),
  useFleetTravel: vi.fn(),
  // The roster the board mounts reads every own fleet (and the galaxy, for
  // system names) — both stubbed so this suite stays about the board.
  useMyFleets: vi.fn(),
}))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))
// The world clock is frozen (advanced by hand where a test needs time to pass)
// and realtime is a no-op, so the composed tree is deterministic; the real
// HexBoard/BoardScene/FactsPanel all render.
const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('@/hooks/use-world-time', () => ({ useWorldTime: () => clock.now }))
vi.mock('@/hooks/use-board-realtime', () => ({ useBoardRealtime: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const mockBoard = vi.mocked(useSystemBoard)
const mockFleets = vi.mocked(useFleetsInSystem)
const mockOrders = vi.mocked(useFleetOrders)
const mockScan = vi.mocked(useScan)
const mockRoutePreview = vi.mocked(useRoutePreview)
const mockTravel = vi.mocked(useFleetTravel)
const mockMyFleets = vi.mocked(useMyFleets)
const mockGalaxy = vi.mocked(useGalaxy)
const mockRunningScan = vi.mocked(useRunningScan)

const travelMutate = vi.fn()

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
    laneGates: [],
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

// A fleet mid-departure: burning across the board to the rim gate it leaves by.
function departingFleet(gateEta: number): Fleet {
  return {
    ...ownFleet,
    state: {
      mode: 'laneTransit',
      laneTransit: {
        boardLeg: {
          path: [
            { q: 3, r: 0 },
            { q: 2, r: 0 },
          ],
          startTime: 0,
          gateEta,
        },
        route: ['sys-7', 'sys-9'],
        legEtas: [gateEta, gateEta + 60_000],
        departTime: 0,
        arriveTime: gateEta + 60_000,
        entryGate: { q: -3, r: 0 },
      },
    },
  }
}

describe('SystemBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clock.now = 0
    mockOrders.mockReturnValue({
      order: { mutate: orderMutate, isPending: false },
      cancel: { mutate: cancelMutate, isPending: false },
    } as unknown as ReturnType<typeof useFleetOrders>)
    mockScan.mockReturnValue({ mutate: scanMutate, isPending: false } as unknown as ReturnType<typeof useScan>)
    mockRoutePreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRoutePreview>)
    mockTravel.mockReturnValue({ mutate: travelMutate, isPending: false } as unknown as ReturnType<typeof useFleetTravel>)
    mockMyFleets.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMyFleets>)
    mockGalaxy.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useGalaxy>)
    mockRunningScan.mockReturnValue({ data: null } as unknown as ReturnType<typeof useRunningScan>)
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

  it('commits the sweep, previewing its shadow coverage on hover', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    // Clicking around to plan a burn stays quiet — no scan overlay.
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    expect(screen.queryByTestId('scan-overlay-aim')).not.toBeInTheDocument()

    // Considering the Scan verb (hover) previews the sweep; leaving hides it.
    fireEvent.mouseEnter(screen.getByTestId('scan-button'))
    expect(screen.getByTestId('scan-overlay-aim')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByTestId('scan-button'))
    expect(screen.queryByTestId('scan-overlay-aim')).not.toBeInTheDocument()

    // Commit — the 360° sweep needs no aim (#0006 Decision #21).
    fireEvent.click(screen.getByTestId('scan-button'))
    expect(scanMutate).toHaveBeenCalledWith('mine', expect.anything())
  })

  it('draws the committed sweep and a countdown while a scan runs', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    const running: GameAction = {
      id: 'action_scan',
      type: 'scan',
      actor: 'mine',
      scope: 'sys-7',
      params: { systemId: 'sys-7' },
      committedAt: 0,
      eta: 30_000,
      status: 'running',
      worldTime: 0,
    }
    mockRunningScan.mockReturnValue({ data: running } as unknown as ReturnType<typeof useRunningScan>)
    render(<SystemBoardView systemId="sys-7" />)

    // The committed sweep is on the board, and the panel counts down.
    expect(screen.getByTestId('scan-overlay-active')).toBeInTheDocument()
    // The radial ping expands from the fleet's live point.
    expect(screen.getByTestId('scan-ping')).toBeInTheDocument()
    expect(screen.getByTestId('scan-ping-pulse')).toBeInTheDocument()
    expect(screen.getByTestId('scan-countdown')).toHaveTextContent(/30s/)
    expect(screen.getByTestId('scan-button')).toBeDisabled()
    // The scan's eta feeds the realtime rules — the eta-scheduled board refetch
    // is the read that resolves the scan server-side — and the poll tightens
    // while echoes are landing (radial echo).
    const realtimeArgs = vi.mocked(useBoardRealtime).mock.calls.at(-1)![0]
    expect(realtimeArgs.etaCandidates).toContain(30_000)
    expect(realtimeArgs.scanning).toBe(true)

    // The FX toggle swaps the running scan's effect to the arc-scan look,
    // then back. (Persistence rides localStorage — stubbed flat in this
    // suite's environment, so asserted by behavior only.)
    fireEvent.click(screen.getByTestId('scan-fx-toggle'))
    expect(screen.queryByTestId('scan-ping')).not.toBeInTheDocument()
    expect(screen.getByTestId('arc-scan')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('scan-fx-toggle'))
    expect(screen.getByTestId('scan-ping')).toBeInTheDocument()
  })

  it('selects a lane gate, previews the route, and departs', () => {
    const withGate = { ...boardFixture(), laneGates: [{ destSystemId: 'sys-9', hex: { q: 3, r: 0 } }] }
    boardState({ isLoading: false, isError: false, data: withGate })
    fleetsState([ownFleet])
    mockRoutePreview.mockReturnValue({
      data: {
        route: ['sys-7', 'sys-9'],
        legEtas: [30_000, 90_000],
        totalEta: 90_000,
        departGate: { q: 3, r: 0 },
        worldTime: 0,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRoutePreview>)
    render(<SystemBoardView systemId="sys-7" />)

    // Select the rim gate → depart section with the route + a burn-to-gate overlay.
    fireEvent.click(screen.getByTestId('gate-glyph-sys-9'))
    expect(screen.getByTestId('gate-facts')).toBeInTheDocument()
    expect(screen.getByTestId('selection-preview')).toBeInTheDocument()

    // Commit → a trip to the neighbour system.
    fireEvent.click(screen.getByTestId('depart-button'))
    expect(travelMutate).toHaveBeenCalledWith(
      { fleetId: 'mine', systemId: 'sys-9' },
      expect.anything(),
    )
  })

  // Spec: 0008/S6
  it('hands off to the galaxy view when a departing fleet transits its gate', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([departingFleet(10_000)])
    const { rerender } = render(<SystemBoardView systemId="sys-7" />)

    // Mid-leg the fleet is still here and we stay put.
    expect(screen.getByTestId('fleet-glyph-mine')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    // Past the gate ETA it's out on the lane: gone from the board, and the view
    // follows it to the galaxy rather than leaving a ghost on the star.
    clock.now = 12_000
    rerender(<SystemBoardView systemId="sys-7" />)
    expect(screen.queryByTestId('fleet-glyph-mine')).not.toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/')
  })

  // Spec: 0011/S3
  it('mounts the roster, and a row for a fleet elsewhere opens that board', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    const away: Fleet = { ...ownFleet, id: 'away', systemId: 'sys-9' }
    mockMyFleets.mockReturnValue({
      data: [ownFleet, away],
    } as unknown as ReturnType<typeof useMyFleets>)
    render(<SystemBoardView systemId="sys-7" />)

    // Both fleets are listed, wherever they are — that's the point of the roster.
    expect(screen.getByTestId('fleet-row-mine')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('fleet-row-away'))
    expect(push).toHaveBeenCalledWith('/systems/sys-9')
  })

  // Spec: 0008/S6
  it('stays put when opening a board whose fleet is already out on a lane', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([departingFleet(10_000)])
    clock.now = 12_000
    render(<SystemBoardView systemId="sys-7" />)

    // The departure wasn't watched from here — no bounce.
    expect(push).not.toHaveBeenCalled()
  })
})
