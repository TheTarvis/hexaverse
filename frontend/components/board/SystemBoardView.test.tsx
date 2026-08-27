import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SystemBoardView } from './SystemBoardView'
import { useSystemBoard } from '@/hooks/use-system-board'
import {
  useFleetsInSystem,
  useFleetOrders,
  useMine,
  useScan,
  useRoutePreview,
  useFleetTravel,
  useMyFleets,
} from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCancelAction, useRunningMine, useRunningScan } from '@/hooks/use-actions'
import { toast } from '@/lib/toast'
import { useBoardRealtime } from '@/hooks/use-board-realtime'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/use-system-board', () => ({ useSystemBoard: vi.fn() }))
vi.mock('@/hooks/use-actions', () => ({
  useRunningScan: vi.fn(),
  useRunningMine: vi.fn(),
  useCancelAction: vi.fn(),
}))
vi.mock('@/hooks/use-fleets', () => ({
  useFleetsInSystem: vi.fn(),
  useFleetOrders: vi.fn(),
  useScan: vi.fn(),
  useMine: vi.fn(),
  useRoutePreview: vi.fn(),
  useFleetTravel: vi.fn(),
  // The roster the board mounts reads every own fleet (and the galaxy, for
  // system names) — both stubbed so this suite stays about the board.
  useMyFleets: vi.fn(),
}))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))
// The admin claim gating the tuning panel (BoardTuning). NODE_ENV is 'test'
// here, so the dev-build half of the gate is off and the claim alone decides.
const adminState = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ isAdmin: adminState.isAdmin }),
}))
// Mock BoardCanvas ONLY (the one component that would reach three.js/GL):
// BoardOverlay and useBoardProjection mount for real in jsdom, so every
// structural assertion and glyph click below exercises the real hit layer.
// The mock reports a live context, which is what keeps the overlay mounted.
const guard = vi.hoisted(() => ({ available: true }))
vi.mock('./BoardCanvas', async () => {
  const React = await import('react')
  function BoardCanvasMock({ onAvailabilityChange }: { onAvailabilityChange?: (a: boolean) => void }) {
    React.useEffect(() => {
      onAvailabilityChange?.(guard.available)
    }, [onAvailabilityChange])
    return React.createElement('div', { 'data-testid': 'board-canvas' })
  }
  return { BoardCanvas: BoardCanvasMock, default: BoardCanvasMock }
})
// The world clock is frozen (advanced by hand where a test needs time to pass)
// and realtime is a no-op, so the composed tree is deterministic.
const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('@/hooks/use-world-time', () => ({
  useWorldTime: () => clock.now,
  // BoardStage's frame packer anchors against the same module clock.
  wallClock: () => clock.now,
  projectWorldTime: (anchor: { world: number; wall: number }, wallNow: number, scale: number) =>
    anchor.world + (wallNow - anchor.wall) * scale,
}))
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
const mockRunningMine = vi.mocked(useRunningMine)
const mockMine = vi.mocked(useMine)
const mockCancelAction = vi.mocked(useCancelAction)

const travelMutate = vi.fn()

const orderMutate = vi.fn()
const cancelMutate = vi.fn()
const scanMutate = vi.fn()
const mineMutate = vi.fn()
const cancelActionMutate = vi.fn()

function boardFixture(): SystemBoard {
  return {
    systemId: 'sys-7',
    radius: 3,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    laneGates: [],
    features: [
      { id: 'f-star', type: 'star', fixed: true, footprint: [{ ring: 0, slot: 0 }], band: 'visible', live: true },
      {
        id: 'p-1',
        type: 'rocky',
        orbit: { ring: 2, angle0: 0, period: 2 ** 60, dir: 1 },
        footprint: [{ ring: 2, slot: 0 }],
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
  position: { ring: 3, slot: 0 },
  own: true,
  worldTime: 0,
}

// The mounted FleetRoster sweeps the query cache for running mines
// (add-mine-ui), so the tree needs a provider; every hook it would fetch
// through is mocked above, so the client itself stays inert.
function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={qc}>{node}</QueryClientProvider>
  )
  const view = rtlRender(wrap(ui))
  return { ...view, rerender: (node: React.ReactElement) => view.rerender(wrap(node)) }
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
            { ring: 3, slot: 0 },
            { ring: 2, slot: 0 },
          ],
          startTime: 0,
          gateEta,
        },
        route: ['sys-7', 'sys-9'],
        legEtas: [gateEta, gateEta + 60_000],
        departTime: 0,
        arriveTime: gateEta + 60_000,
        entryGate: { ring: 3, slot: 0 },
      },
    },
  }
}

describe('SystemBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clock.now = 0
    guard.available = true
    adminState.isAdmin = false
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
    mockRunningMine.mockReturnValue({ data: null } as unknown as ReturnType<typeof useRunningMine>)
    mockMine.mockReturnValue({ mutate: mineMutate, isPending: false } as unknown as ReturnType<typeof useMine>)
    mockCancelAction.mockReturnValue({
      mutate: cancelActionMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCancelAction>)
    fleetsState([])
  })

  it('shows a charting placeholder while loading', () => {
    boardState({ isLoading: true, isError: false, data: undefined })
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.queryByTestId('board-overlay')).not.toBeInTheDocument()
    expect(screen.getByText(/charting the system/i)).toBeInTheDocument()
  })

  it('keeps the loading placeholder up past the data reads, until the first rendered frame', () => {
    // The reads have resolved but no frame has been produced (the mocked
    // canvas region never fires onFirstFrame) — a black canvas must not show,
    // so the charting placeholder persists over the mounted board.
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByText(/charting the system/i)).toBeInTheDocument()
  })

  it('lets an unavailable renderer take precedence over the loading placeholder', () => {
    guard.available = false
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)
    // No loading veil over the unsupported/interrupted notice — the
    // placeholder must never persist when no frame can ever come.
    expect(screen.queryByText(/charting the system/i)).not.toBeInTheDocument()
    // The overlay's hit shapes are gone with it; verbs needing a board
    // selection are unavailable, and the facts panel says why (task 7.10) —
    // not the default "select a body" copy.
    expect(screen.queryByTestId('board-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('facts-panel')).toHaveTextContent(/board must be available/i)
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

    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('board-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-f-star')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-glyph-mine')).toBeInTheDocument()
    const facts = screen.getByTestId('facts-panel')
    expect(facts).toHaveTextContent('Class G system')
    // An own fleet is present, so the scan verb is offered.
    expect(screen.getByTestId('scan-button')).toBeInTheDocument()
  })

  it('offers the tuning panel to an admin, and hides it otherwise', () => {
    // NODE_ENV is 'test' here, so the dev-build half of the gate is off and
    // the admin claim alone decides.
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    const { unmount } = render(<SystemBoardView systemId="sys-7" />)
    expect(screen.queryByTestId('board-tuning-toggle')).not.toBeInTheDocument()
    unmount()

    adminState.isAdmin = true
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByTestId('board-tuning-toggle')).toBeInTheDocument()
  })

  it('toggles selection off on re-click, and a board click outside the lattice clears it', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    fleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    // Select → the selection ring appears; re-click the same feature → deselect.
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    expect(screen.getByTestId('feature-glyph-p-1').querySelector('[data-testid="selection-ring"]')).not.toBeNull()
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    expect(screen.getByTestId('feature-glyph-p-1').querySelector('[data-testid="selection-ring"]')).toBeNull()

    // Select again, then click the stage away from every hit shape (jsdom's
    // unmeasured container puts the point outside the lattice) → cleared.
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    fireEvent.click(screen.getByTestId('board-stage'))
    expect(screen.getByTestId('feature-glyph-p-1').querySelector('[data-testid="selection-ring"]')).toBeNull()
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

  // --- mine (#0010, add-mine-ui) --------------------------------------------

  // A board whose planet carries lodes, and a fleet docked to it with the
  // owner-only roster block the mine offer reads.
  function mineFixtures() {
    const board = boardFixture()
    board.features[1] = {
      ...board.features[1],
      band: 'visible',
      live: true,
      resources: [
        { kind: 'metals', richness: 0.5 },
        { kind: 'water', richness: 0.8 },
      ],
    }
    const docked: Fleet = {
      ...ownFleet,
      state: { mode: 'docked', docked: { parentId: 'p-1' } },
      position: { ring: 2, slot: 0 },
      roster: { ships: [{ class: 'seed' }], cargo: {}, cargoCapacity: 200, freeHold: 200, miningRate: 0.001 },
    }
    boardState({ isLoading: false, isError: false, data: board })
    fleetsState([docked])
  }

  it('offers mine on the fleet card while docked at a lode — no selection — and commits the run', () => {
    mineFixtures()
    mineMutate.mockImplementation((_vars, opts) => (opts as { onSuccess?: () => void })?.onSuccess?.())
    render(<SystemBoardView systemId="sys-7" />)

    // Docked at the lode is enough — the offer needs no board click at all.
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
    // Defaults: the richest visible kind, and a fill-the-hold tonnage.
    expect(screen.getByTestId('mine-kind-water')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(200)

    fireEvent.click(screen.getByTestId('mine-button'))
    // The featureId is the fleet's dock parent, resolved by the container.
    expect(mineMutate).toHaveBeenCalledWith(
      { fleetId: 'mine', request: { featureId: 'p-1', kind: 'water', tons: 200 } },
      expect.anything(),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it('toasts the server reason when the commit is rejected, keeping the offer', () => {
    mineFixtures()
    mineMutate.mockImplementation((_vars, opts) =>
      (opts as { onError?: (e: Error) => void })?.onError?.(
        new Error("mine: lode's remaining tonnage is already at or below zero"),
      ),
    )
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('mine-button'))

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "mine: lode's remaining tonnage is already at or below zero",
    )
    // The offer survives a rejection — adjust and retry in place.
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
  })

  it('gates move + mine while a run is in flight, keeps scan free, and arms the eta refetch', () => {
    mineFixtures()
    const running: GameAction = {
      id: 'action_mine',
      type: 'mine',
      actor: 'mine',
      scope: 'sys-7',
      params: { featureId: 'p-1', kind: 'water', tons: 40 },
      committedAt: 0,
      eta: 30_000,
      status: 'running',
      worldTime: 0,
    }
    mockRunningMine.mockReturnValue({ data: running } as unknown as ReturnType<typeof useRunningMine>)
    render(<SystemBoardView systemId="sys-7" />)

    // The movement channel is busy: countdown shown, no fresh offer, move
    // disabled — but the sensor channel stays open (#0006's mirror image).
    expect(screen.getByTestId('mine-countdown')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('move-button')).toBeDisabled()
    expect(screen.getByTestId('scan-button')).toBeEnabled()

    // The run's eta joins the self-scheduled refetch candidates (rule 1).
    const realtimeArgs = vi.mocked(useBoardRealtime).mock.calls.at(-1)![0]
    expect(realtimeArgs.etaCandidates).toContain(30_000)

    // Cancelling rides the generic #0005 endpoint with the run's action id.
    fireEvent.click(screen.getByTestId('cancel-mine-button'))
    expect(cancelActionMutate).toHaveBeenCalledWith(
      { actionId: 'action_mine', fleetId: 'mine' },
      expect.anything(),
    )
  })

  it('selects a lane gate, previews the route, and departs', () => {
    const withGate = { ...boardFixture(), laneGates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }
    boardState({ isLoading: false, isError: false, data: withGate })
    fleetsState([ownFleet])
    mockRoutePreview.mockReturnValue({
      data: {
        route: ['sys-7', 'sys-9'],
        legEtas: [30_000, 90_000],
        totalEta: 90_000,
        departGate: { ring: 3, slot: 0 },
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
