// RED-phase suite for SystemBoardView against the migrate-fleet-to-
// continuous-burns contract (design.md Decision 12; tasks.md 8.7, 8.11).
//
// Cause for rewriting this whole file wholesale: the board's fleet layer,
// move/scan/depart verbs, and route-preview surface are gone
// (board-view REMOVED "Move Preview...", "Move Commit", "Scan Aim Preview
// Only While Considering the Verb", "Scan Commit and Single-Slot Gating",
// "Cancel Command Available Only While Burning", "Lane Gate Selection
// Previews and Commits Departure" — replaced by roster-panel burn/cut-
// drive/stop/jump commands composed from the board's current selection,
// design.md Decision 12: "Targets are named by body id from the interior
// read, not by picking a tile"). `hooks/use-fleets.ts` dropped
// `useFleetsInSystem`/`useFleetOrders`/`useScan`/`useRoutePreview`/
// `useFleetTravel` entirely; `lib/types/fleet.ts` carries the mixed-case
// `space.ShipState` wire shape (Mode/Burn/Park/Drift, capitalized/untagged)
// plus camelCase `attachedTo`/`jump`.
//
// board-view MODIFIED "System Board Route and Data Fan-In" pins: "The board
// fetches no fleet data" — 8.11 asks this be independently pinned (it was
// not before). See the dedicated "fetches no fleet data" test below.
//
// Two scenarios in this file are RED FOR A REAL REASON — not a test-
// authoring defect — and are reported to the orchestrator as production
// findings, not silently dropped: `board-view` › "Departure Hand-Off to the
// Galaxy View" and `board-view` › "Fleet Roster Cross-Navigation" ›
// "Selecting a fleet with no board presence navigates to the galaxy" are
// UNTOUCHED by this change's delta (neither REMOVED, ADDED, nor MODIFIED in
// openspec/changes/migrate-fleet-to-continuous-burns/specs/board-view/
// spec.md) — they remain in force verbatim from openspec/specs/board-view/
// spec.md, but `SystemBoardView.tsx` as shipped contains NO navigate-away-
// on-departure logic at all (no effect watches `activeFleet.systemId`/
// `.jump` across renders), and its roster `onSelect` handler checks only
// `f.systemId !== systemId` — never `f.jump` — so a fleet mid-jump whose
// `systemId` has not yet flipped (design.md Decision 10: SystemId flips only
// at jump RESOLUTION) reads as "here" and is never handed to the galaxy
// view. See the `// FINDING:` comments on those two tests.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SystemBoardView } from './SystemBoardView'
import { useSystemBoard } from '@/hooks/use-system-board'
import { useCutDrive, useJump, useMine, useMyFleets, useOrder, useStop } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCancelAction, useRunningMine } from '@/hooks/use-actions'
import { useMarketBoard, useSell, useStation } from '@/hooks/use-market'
import { useCorporationOptional } from '@/components/corporation-provider'
import { toast } from '@/lib/toast'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_PARKED } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/use-system-board', () => ({ useSystemBoard: vi.fn() }))
vi.mock('@/hooks/use-actions', () => ({
  useRunningMine: vi.fn(),
  useCancelAction: vi.fn(),
}))
vi.mock('@/hooks/use-fleets', () => ({
  useMyFleets: vi.fn(),
  useOrder: vi.fn(),
  useCutDrive: vi.fn(),
  useStop: vi.fn(),
  useJump: vi.fn(),
  useMine: vi.fn(),
}))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))
vi.mock('@/hooks/use-market', () => ({
  useMarketBoard: vi.fn(),
  useStation: vi.fn(),
  useSell: vi.fn(),
}))
vi.mock('@/components/corporation-provider', () => ({ useCorporationOptional: vi.fn() }))
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
const mockMyFleets = vi.mocked(useMyFleets)
const mockOrder = vi.mocked(useOrder)
const mockCutDrive = vi.mocked(useCutDrive)
const mockStop = vi.mocked(useStop)
const mockJump = vi.mocked(useJump)
const mockMine = vi.mocked(useMine)
const mockGalaxy = vi.mocked(useGalaxy)
const mockRunningMine = vi.mocked(useRunningMine)
const mockCancelAction = vi.mocked(useCancelAction)
const mockMarketBoard = vi.mocked(useMarketBoard)
const mockStation = vi.mocked(useStation)
const mockSell = vi.mocked(useSell)
const mockCorp = vi.mocked(useCorporationOptional)

const orderMutate = vi.fn()
const cutDriveMutate = vi.fn()
const stopMutate = vi.fn()
const jumpMutate = vi.fn()
const mineMutate = vi.fn()
const cancelActionMutate = vi.fn()
const sellMutate = vi.fn()

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

function parkState() {
  return {
    Mode: SHIP_MODE_PARKED,
    Burn: null,
    Park: {
      Kind: 2,
      BodyId: '',
      Radius: 0,
      PeriodMs: 0,
      Phase: 0,
      EpochMs: 0,
      Offset: { X: 0, Y: 0, Z: 0 },
      Point: { X: 0, Y: 0, Z: 0 },
    },
    Drift: null,
  }
}

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 'sys-7',
  state: parkState(),
  position: { X: 0, Y: 0, Z: 0 },
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
function myFleetsState(fleets: Fleet[]) {
  mockMyFleets.mockReturnValue({ data: fleets } as unknown as ReturnType<typeof useMyFleets>)
}

describe('SystemBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clock.now = 0
    guard.available = true
    adminState.isAdmin = false
    mockOrder.mockReturnValue({ mutate: orderMutate, isPending: false } as unknown as ReturnType<typeof useOrder>)
    mockCutDrive.mockReturnValue({ mutate: cutDriveMutate, isPending: false } as unknown as ReturnType<typeof useCutDrive>)
    mockStop.mockReturnValue({ mutate: stopMutate, isPending: false } as unknown as ReturnType<typeof useStop>)
    mockJump.mockReturnValue({ mutate: jumpMutate, isPending: false } as unknown as ReturnType<typeof useJump>)
    mockMine.mockReturnValue({ mutate: mineMutate, isPending: false } as unknown as ReturnType<typeof useMine>)
    mockGalaxy.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useGalaxy>)
    mockRunningMine.mockReturnValue({ data: null } as unknown as ReturnType<typeof useRunningMine>)
    mockCancelAction.mockReturnValue({
      mutate: cancelActionMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCancelAction>)
    mockMarketBoard.mockReturnValue({ data: undefined, isLoading: false, isError: false } as unknown as ReturnType<typeof useMarketBoard>)
    mockStation.mockReturnValue({ data: undefined, refetch: vi.fn() } as unknown as ReturnType<typeof useStation>)
    mockSell.mockReturnValue({ mutate: sellMutate, isPending: false } as unknown as ReturnType<typeof useSell>)
    mockCorp.mockReturnValue(null)
    myFleetsState([])
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
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByText(/charting the system/i)).toBeInTheDocument()
  })

  it('lets an unavailable renderer take precedence over the loading placeholder', () => {
    guard.available = false
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)
    // No loading veil over the unsupported/interrupted notice — the
    // placeholder must never persist when no frame can ever come.
    expect(screen.queryByText(/charting the system/i)).not.toBeInTheDocument()
    // The overlay's hit shapes are gone with it; verbs needing a board
    // selection are unavailable, and the facts panel says why — not the
    // default "select a body" copy.
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
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('board-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-f-star')).toBeInTheDocument()
    const facts = screen.getByTestId('facts-panel')
    expect(facts).toHaveTextContent('Class G system')
  })

  // board-view MODIFIED "System Board Route and Data Fan-In": "The board
  // fetches no fleet data" (design.md Decision 12) — not independently
  // pinned before this rewrite (dev's own note, tasks.md 8.11).
  it('fetches no fleet data of its own — the board draws no fleet layer at all', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    // Two own fleets: one here, one elsewhere — proves the board draws
    // neither, from the SAME shared `useMyFleets` read the roster panel
    // uses, never a system-scoped fetch (there is no such hook to call —
    // `hooks/use-fleets.ts` exports no `useFleetsInSystem` any more; if
    // `SystemBoardView.tsx` called one, this mocked module — which supplies
    // only the surviving surface — would throw at render, failing every
    // test in this file).
    myFleetsState([ownFleet, { ...ownFleet, id: 'elsewhere', systemId: 'sys-9' }])
    render(<SystemBoardView systemId="sys-7" />)

    // No fleet-glyph mark of any kind reaches the overlay.
    expect(screen.queryAllByTestId(/^fleet-glyph-/)).toHaveLength(0)
    // `useMyFleets` is the ONLY fleet-data hook this container (or the
    // roster it mounts) calls — asserted by call count being exactly the
    // number of components that read it (this container + FleetRoster), not
    // some larger number a per-system fetch would add.
    expect(mockMyFleets).toHaveBeenCalledTimes(2)
  })

  it('offers the tuning panel to an admin, and hides it otherwise', () => {
    // NODE_ENV is 'test' here, so the dev-build half of the gate is off and
    // the admin claim alone decides.
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    const { unmount } = render(<SystemBoardView systemId="sys-7" />)
    expect(screen.queryByTestId('board-tuning-toggle')).not.toBeInTheDocument()
    unmount()

    adminState.isAdmin = true
    render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByTestId('board-tuning-toggle')).toBeInTheDocument()
  })

  it('toggles selection off on re-click, and a board click outside the lattice clears it', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
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

  // --- roster commands, composed from the board's selection (fleet-roster
  // "The Roster Row Is the Fleet Command Surface"; design.md Decision 12) ---

  it('composes a burn order from the current feature selection and commits it via the roster’s Burn command', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('feature-glyph-p-1'))
    fireEvent.click(screen.getByTestId('fleet-cmd-burn-mine'))

    expect(orderMutate).toHaveBeenCalledWith(
      { fleetId: 'mine', request: { bodyId: 'p-1' } },
      expect.anything(),
    )
  })

  it('refuses a burn commit client-side, with a toast, when nothing is selected', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('fleet-cmd-burn-mine'))

    expect(orderMutate).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Select a body to target first')
  })

  it('cuts the drive and toasts on success', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    // Cut-drive is offered only while burning (fleet-roster ADDED "The
    // Roster Row Is the Fleet Command Surface") — a burning fixture is
    // needed to reach the button at all.
    const burning: Fleet = {
      ...ownFleet,
      state: {
        Mode: 0,
        Burn: {
          Origin: { X: 0, Y: 0, Z: 0 },
          Target: { BodyId: 'p-1', Point: null },
          Intercept: { X: 1, Y: 0, Z: 0 },
          Curve: {},
          Length: 10,
          DepartMs: 0,
          ArriveMs: 90_000,
          Accel: 1,
          InsertionPhase: 0,
        },
        Park: null,
        Drift: null,
      },
    }
    myFleetsState([burning])
    cutDriveMutate.mockImplementation((_id, opts) => (opts as { onSuccess?: () => void })?.onSuccess?.())
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('fleet-cmd-cut-drive-mine'))
    expect(cutDriveMutate).toHaveBeenCalledWith('mine', expect.anything())
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Drive cut')
  })

  // --- mine (kept: "Mine Offer on the Docked Fleet", "Mine Commit") --------

  // A board whose planet carries lodes, and a fleet docked (attachedTo) to
  // it with the owner-only roster block the mine offer reads.
  function mineFixtures() {
    const board = boardFixture()
    board.features[1] = {
      ...board.features[1]!,
      band: 'visible',
      live: true,
      resources: [
        { kind: 'metals', richness: 0.5 },
        { kind: 'water', richness: 0.8 },
      ],
    }
    const docked: Fleet = {
      ...ownFleet,
      attachedTo: 'p-1',
      roster: { ships: [{ class: 'seed' }], cargo: {}, cargoCapacity: 200, freeHold: 200, miningRate: 0.001 },
    }
    boardState({ isLoading: false, isError: false, data: board })
    myFleetsState([docked])
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
    // The featureId is the fleet's dock parent (`attachedTo`), resolved by
    // the container.
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

  it('gates a fresh mine offer while a run is in flight, showing a countdown instead', () => {
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

    expect(screen.getByTestId('mine-countdown')).toBeInTheDocument()
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()

    // board-view ADDED "Running Mine Gates the Fleet Panel's Commands" — the
    // SAME running mine also gates the mounted roster's commands (read
    // straight off the query cache, per FleetRoster's own contract, already
    // pinned in FleetRoster.test.tsx and roster-commands.test.ts). Spot-
    // checked here only for the wiring, not re-derived: the cache key this
    // container's mocked `useRunningMine` return doesn't feed FleetRoster,
    // so this integration point is a documented gap, not asserted further.
  })

  // --- lane gates (informational only on the board now — jump is a roster
  // command, design.md Decision 10/12) --------------------------------------

  it('selects a lane gate and shows its facts, pointing at the roster panel — no depart affordance', () => {
    const withGate = { ...boardFixture(), laneGates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }
    boardState({ isLoading: false, isError: false, data: withGate })
    myFleetsState([ownFleet])
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('gate-glyph-sys-9'))
    const gateFacts = screen.getByTestId('gate-facts')
    expect(gateFacts).toHaveTextContent('sys-9')
    expect(gateFacts).toHaveTextContent(/jump from the roster panel/i)
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  // Spec: 0011/S3
  it('mounts the roster, and a row for a fleet elsewhere opens that board', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    const away: Fleet = { ...ownFleet, id: 'away', systemId: 'sys-9' }
    myFleetsState([ownFleet, away])
    render(<SystemBoardView systemId="sys-7" />)

    // Both fleets are listed, wherever they are — that's the point of the roster.
    expect(screen.getByTestId('fleet-row-mine')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('fleet-row-away'))
    expect(push).toHaveBeenCalledWith('/systems/sys-9')
  })

  // --- market / credits -----------------------------------------------------

  it('mounts the market board panel once a station is present at this system', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    mockStation.mockReturnValue({
      data: { systemId: 'sys-7', orbit: { ring: 1, angle0: 0, period: 1, dir: 1 }, featureId: 'p-1', createdAt: 0 },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useStation>)
    render(<SystemBoardView systemId="sys-7" />)

    expect(mockMarketBoard).toHaveBeenCalled()
  })

  it('shows the credit balance readout from the corporation context', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    mockCorp.mockReturnValue({ id: 'c1', accountId: 'a1', name: 'Acme', credits: 750 } as unknown as ReturnType<typeof useCorporationOptional>)
    render(<SystemBoardView systemId="sys-7" />)

    expect(screen.getByTestId('balance-value')).toHaveTextContent('750')
  })

  // --- FINDINGS: two board-view requirements untouched by this change's
  // delta (still in force verbatim), for which the shipped component has NO
  // implementation. Both fail for the right reason (missing behaviour, not a
  // harness/compile error) — reported to the orchestrator as production
  // defects, not silently dropped or invented around.

  // FINDING (production defect, not a test-authoring issue): board-view ›
  // "Departure Hand-Off to the Galaxy View" › "Watching a fleet depart
  // navigates to the galaxy view" — untouched by this change's delta (not
  // REMOVED/ADDED/MODIFIED), still in force. `SystemBoardView.tsx` has no
  // effect watching `activeFleet`'s presence in `ownFleetsHere` across
  // renders, so a fleet that WAS on this board and then jumps away (its
  // `systemId` flips at resolve, design.md Decision 10) never triggers a
  // navigation to `/`. This test is RED against the shipped component.
  it('navigates to the galaxy view when a watched fleet’s jump resolves and it leaves this system', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    myFleetsState([ownFleet])
    const { rerender } = render(<SystemBoardView systemId="sys-7" />)
    expect(screen.getByTestId('fleet-row-mine')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    // The jump resolves: the fleet's systemId flips away from sys-7, so it
    // is no longer among `ownFleetsHere` on the next read.
    myFleetsState([{ ...ownFleet, systemId: 'sys-9' }])
    rerender(<SystemBoardView systemId="sys-7" />)

    expect(push).toHaveBeenCalledWith('/')
  })

  it('stays put when opening a board whose fleet is already elsewhere (no watched departure)', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    // The fleet was never present at sys-7 in this session — opened
    // straight onto a system with no own fleet.
    myFleetsState([{ ...ownFleet, systemId: 'sys-9' }])
    render(<SystemBoardView systemId="sys-7" />)

    expect(push).not.toHaveBeenCalled()
  })

  // FINDING (production defect): board-view › "Fleet Roster Cross-
  // Navigation" › "Selecting a fleet with no board presence navigates to the
  // galaxy" — untouched by this change's delta, still in force. The
  // shipped `onSelect` checks only `f.systemId !== systemId`, never
  // `f.jump`; a fleet mid-jump whose `systemId` has not yet flipped (still
  // reads as "sys-7") is therefore selected as if it were here, rather than
  // navigated to the galaxy view. This test is RED against the shipped
  // component.
  it('navigates to the galaxy view when a roster row for a mid-jump fleet (no board presence) is selected', () => {
    boardState({ isLoading: false, isError: false, data: boardFixture() })
    const jumping: Fleet = {
      ...ownFleet,
      jump: { laneId: 'lane-1', destSystemId: 'sys-9', departMs: 0, arriveMs: 60_000 },
    }
    myFleetsState([jumping])
    render(<SystemBoardView systemId="sys-7" />)

    fireEvent.click(screen.getByTestId('fleet-row-mine'))
    expect(push).toHaveBeenCalledWith('/')
  })
})
