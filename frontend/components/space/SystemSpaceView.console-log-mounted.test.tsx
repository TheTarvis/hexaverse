import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE TESTS - openspec change keep-console-tab-content-mounted, tasks
// 1.1-1.11, 1.14 and 1.15 (system-console: "A Tab's Content Stays Mounted
// While It Is Not Shown", "Showing or Hiding the Log Tab Issues No Read",
// and the MODIFIED "The Log Tab Is the Sighting Log's Home on This View").
// Impl contract: docs/handoffs/keep-console-tab-content-mounted-impl-contract.md
// section 3 (3.1 mocked-vs-real, 3.2 client and request counting, 3.3 the
// interior, 3.4 task by task, 3.6 task 1.14's rows).
//
// REAL, never mocked: SystemSpaceView, ConsoleDock, SightingLog, VitalsStrip
// and its cells, ScanControl, SpaceCommandPanel, FleetActionsPanel,
// FleetRoster, buildSceneModel, @/hooks/use-sightings, @/hooks/use-scan,
// @/hooks/use-actions, @/lib/query-keys, @/lib/realtime. MOCKED at the
// service boundary: @/lib/services. MOCKED as hooks: use-system-space (hands
// through to the real hook for task 1.15 alone), use-fleets, use-market,
// providers, burn preview, toast, navigation. The stage is the mock of
// SystemSpaceView.console-dock.test.tsx.
//
// "A pile request" is a call of sightingService.list with no `systemId`
// (with or without `cursor`). The ghost feed's calls (systemId present) are
// never counted. Every "no request" claim compares pileRequests().length
// with a snapshot taken after a flush.
//
// The query client is one per test with the default stale time (0) and
// garbage-collection time, so any answered entry is stale and survives a
// collapse: a build that remounts the log on show refetches on mount and the
// request count discriminates it.
//
// Statuses at the red gate are in
// docs/handoffs/keep-console-tab-content-mounted-red-coverage.md.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

// --- the network boundary: mocked SERVICE functions ------------------------
type ListParams = { systemId?: string; cursor?: string; limit?: number }
const serve = vi.hoisted(() => ({
  pile: (_p: ListParams): Promise<unknown> => Promise.resolve({ sightings: [], nextCursor: '' }),
  ghost: (_p: ListParams): Promise<unknown> => Promise.resolve({ sightings: [], nextCursor: '' }),
  calls: [] as ListParams[],
}))
const mockScanTargets = vi.hoisted(() => vi.fn())
const mockScan = vi.hoisted(() => vi.fn())
const mockListRunning = vi.hoisted(() => vi.fn())
const mockListSettled = vi.hoisted(() => vi.fn())
const mockCancel = vi.hoisted(() => vi.fn())
const mockAcknowledge = vi.hoisted(() => vi.fn())
const mockGetSystemSpace = vi.hoisted(() => vi.fn())

vi.mock('@/lib/services', () => ({
  sightingService: {
    list: (params: ListParams) => {
      serve.calls.push(params)
      return params.systemId ? serve.ghost(params) : serve.pile(params)
    },
  },
  systemService: { getSystemSpace: (...args: unknown[]) => mockGetSystemSpace(...args) },
  fleetService: {
    scanTargets: (...args: unknown[]) => mockScanTargets(...args),
    scan: (...args: unknown[]) => mockScan(...args),
  },
  actionService: {
    listRunning: (...args: unknown[]) => mockListRunning(...args),
    listSettled: (...args: unknown[]) => mockListSettled(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    acknowledge: (...args: unknown[]) => mockAcknowledge(...args),
  },
}))

// --- the interior (contract 3.3, binds r2-m2) -------------------------------
const interiorMode = vi.hoisted(() => ({ real: false }))
const useSystemSpace = vi.fn()
vi.mock('@/hooks/use-system-space', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-system-space')>('@/hooks/use-system-space')
  // `interiorMode.real` is set before a test renders and never changes inside one, so the view's hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return { useSystemSpace: (id: string) => (interiorMode.real ? actual.useSystemSpace(id) : useSystemSpace(id)) }
})

const useMyFleets = vi.fn()
const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), reset: vi.fn(), isPending: false, isError: false, error: null })
  return { order: make(), jump: make(), cutDrive: make(), stop: make(), mine: make(), hold: make(), release: make(), sell: make(), refuel: make() }
})
vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return {
    ...actual,
    useMyFleets: () => useMyFleets(),
    useOrder: () => mutations.order, useJump: () => mutations.jump, useCutDrive: () => mutations.cutDrive,
    useStop: () => mutations.stop, useMine: () => mutations.mine, useHold: () => mutations.hold,
    useRelease: () => mutations.release,
  }
})
vi.mock('@/hooks/use-market', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-market')
  return {
    ...actual,
    useMarketBoard: () => ({ data: undefined, isLoading: false, isError: false }),
    useStation: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
    useSell: () => mutations.sell,
    useRefuel: () => mutations.refuel,
  }
})
vi.mock('@/components/corporation-provider', () => ({
  useCorporationOptional: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1000 }),
  useCorporation: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1000 }),
  useCorporationSessionOptional: () => ({ corporation: { id: 'corp-1', name: 'SDET Corp', credits: 1000 }, isError: false }),
}))
vi.mock('@/hooks/use-galaxy', () => ({
  useGalaxy: () => ({ data: undefined, isLoading: false, isError: false, isStartArea: false }),
}))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: { uid: 'u1' }, authLoading: false, isAdmin: false }),
}))
vi.mock('@/hooks/use-burn-preview', () => ({
  useBurnPreview: () => ({ preview: null, stale: false, noQuote: false, retry: vi.fn() }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

const stage = vi.hoisted(() => ({ available: true, firstFrame: true }))
vi.mock('./SpaceStage', async () => {
  const ReactMod = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function SpaceStageMock(props: any) {
    ReactMod.useEffect(() => {
      props.onAvailabilityChange?.(stage.available)
      if (stage.available && stage.firstFrame) props.onFirstFrame?.()
    }, [props])
    const ghosts = (props.scene?.marks ?? []).filter((m: { kind: string }) => m.kind === 'sighting')
    return ReactMod.createElement(
      'div',
      { 'data-testid': 'space-canvas-region' },
      ...ghosts.map((mark: { recordId: string }) =>
        ReactMod.createElement('button', {
          key: mark.recordId,
          type: 'button',
          'data-testid': `mock-ghost-${mark.recordId}`,
          'data-highlighted': props.highlightedGhostId === mark.recordId ? 'true' : 'false',
          onClick: () => props.onHighlightGhost?.(mark.recordId),
        }),
      ),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'
import { queryKeys } from '@/lib/query-keys'
import { BOARD_POLL_MS } from '@/lib/realtime'

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'
const OTHER_SYSTEM_ID = 'sys_3_4'
const FLEET_ID = 'fleet_1'
const HOST_ID = 'feat-body-0'
const NO_MARK_TEXT = 'This record has no mark in the open system.'

const INTERIOR = {
  systemId: SYSTEM_ID, extent: 200, character: 'normal', starClass: 'M', worldTime: T0, scale: 1,
  features: [
    { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 },
    { id: HOST_ID, type: 'rocky', space: { X: 18, Y: -3, Z: -15 }, size: 1.76 },
  ],
  laneGates: [], contacts: [],
}

function ownFleet() {
  return {
    id: FLEET_ID, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 30, Y: 0, Z: 0 }, attachedTo: undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 30, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
  }
}

/** A record "with a ghost" is in the open system at a non-origin position and is also served by the ghost route; one "with no ghost" carries another systemId. */
function record(id: string, over: Record<string, unknown> = {}) {
  return {
    id, systemId: SYSTEM_ID, asOf: 1_000, hostId: `host-${id}`, cleanSweep: false,
    position: { X: 40, Y: 0, Z: -10 }, velocity: { X: 0, Y: 0, Z: 0 }, emitting: false,
    hullCount: 1, hullTypes: ['scout'],
    ...over,
  }
}
const withGhost = (id: string) => record(id)
const noGhost = (id: string) => record(id, { systemId: OTHER_SYSTEM_ID })

const SETTLED_SCAN = {
  id: 'act-scan-1', type: 'scan', actor: FLEET_ID, scope: SYSTEM_ID,
  committedAt: T0 - 6_000, eta: T0 - 1_000, status: 'done', resolvedAt: T0 - 1_000, worldTime: T0,
  params: { systemId: SYSTEM_ID },
}

function answered(over: Record<string, unknown> = {}) {
  return { data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => undefined), ...over }
}

// --- serving ---------------------------------------------------------------
const page = (sightings: unknown[], nextCursor = '') => ({ sightings, nextCursor })
/** The pile route and (for records in the open system) the ghost route serve `records`. */
function servePile(records: Record<string, unknown>[]) {
  serve.pile = () => Promise.resolve(page(records))
  serve.ghost = () => Promise.resolve(page(records.filter((r) => r.systemId === SYSTEM_ID)))
}
const pileRequests = () => serve.calls.filter((p) => !p.systemId)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// --- harness ---------------------------------------------------------------
let qc: QueryClient
function renderView() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = () => (
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>
  )
  const result = rtlRender(tree())
  return { ...result, again: () => result.rerender(tree()) }
}

const flush = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const flushFake = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

const open = () => screen.getByTestId('console-dock-open')
const collapseBtn = () => screen.getByTestId('console-dock-collapse')
const region = () => screen.getByTestId('console-dock-region')
const panel = () => screen.getByTestId('console-panel-log')
const row = (id: string) => within(panel()).getByTestId(`sighting-row-${id}`)

// Since `move-scan-control-to-console-dock` a fresh expand shows the Scan tab;
// this file is about the Log panel, so the helper selects it too. Selecting a
// tab issues nothing, so every request count here is unchanged.
function expand() {
  fireEvent.click(open())
  fireEvent.click(screen.getByTestId('console-tab-log'))
}
function collapse() { fireEvent.click(collapseBtn()) }

/** Expand, wait for the log's rows inside the panel, collapse, flush. Leaves "the first read has been answered" true under both builds. */
async function settleFirstRead(rowId: string) {
  expand()
  await waitFor(() => expect(within(panel()).queryByTestId(`sighting-row-${rowId}`)).not.toBeNull())
  collapse()
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  interiorMode.real = false
  serve.calls.length = 0
  serve.pile = () => Promise.resolve(page([]))
  serve.ghost = () => Promise.resolve(page([]))
  mockListRunning.mockResolvedValue([])
  mockListSettled.mockResolvedValue([])
  mockScanTargets.mockResolvedValue([])
  stage.available = true
  stage.firstFrame = true
  useSystemSpace.mockReturnValue(answered())
  useMyFleets.mockReturnValue({ data: [ownFleet()], isLoading: false, isError: false, refetch: vi.fn(async () => undefined) })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// Task 1.1 - rows listed, no request caused by a collapse or an expansion
// ============================================================================
describe('Task 1.1 - the log keeps its rows and issues no request across a collapse and re-expand', () => {
  it('Scenario: Pages loaded with load-more survive a collapse and re-expand', async () => {
    const P1 = [withGhost('A1'), withGhost('A2')]
    const P2 = [withGhost('B1')]
    serve.pile = (p) => Promise.resolve(p.cursor === 'c2' ? page(P2) : page(P1, 'c2'))
    serve.ghost = () => Promise.resolve(page([]))
    renderView()
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A1')).not.toBeNull())
    fireEvent.click(within(panel()).getByTestId('sighting-log-load-more'))
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-B1')).not.toBeNull())
    await flush()
    const snapshot = pileRequests().length
    collapse()
    expand()
    expect(pileRequests().length, 'a collapse or an expansion issued a pile request').toBe(snapshot)
    for (const id of ['A1', 'A2', 'B1']) expect(row(id)).toBeInTheDocument()
  })

  it('Scenario: A pile read that answers while the dock is collapsed is shown on re-expand', async () => {
    servePile([withGhost('A')])
    renderView()
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A')).not.toBeNull())
    collapse()
    servePile([withGhost('A'), withGhost('B')])
    // A read caused while collapsed (contract 3.2): the test's own client invalidates the unfiltered pile.
    await act(async () => { await qc.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) }) })
    await flush()
    const snapshot = pileRequests().length
    expand()
    expect(pileRequests().length, 'the expansion issued a pile request').toBe(snapshot)
    expect(row('A')).toBeInTheDocument()
    expect(row('B')).toBeInTheDocument()
  })

  it('Scenario: A further page requested just before a collapse is listed on re-expand', async () => {
    const P1 = [withGhost('A1'), withGhost('A2')]
    const P2 = [withGhost('B1')]
    const heldPage2 = deferred<unknown>()
    serve.pile = (p) => (p.cursor === 'c2' ? heldPage2.promise : Promise.resolve(page(P1, 'c2')))
    renderView()
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A1')).not.toBeNull())
    fireEvent.click(within(panel()).getByTestId('sighting-log-load-more'))
    collapse()
    await act(async () => { heldPage2.resolve(page(P2)) })
    await flush()
    const snapshot = pileRequests().length
    expand()
    expect(pileRequests().length, 'the expansion issued a pile request').toBe(snapshot)
    for (const id of ['A1', 'A2', 'B1']) expect(row(id)).toBeInTheDocument()
  })
})

// ============================================================================
// Task 1.2 (control for 1.3) - highlight rides the view's state
// ============================================================================
describe('Task 1.2 - a selected row keeps its highlight across a collapse and re-expand', () => {
  it("Scenario: A selected row's highlight survives a collapse and re-expand", async () => {
    servePile([withGhost('A')])
    renderView()
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A')).not.toBeNull())
    await waitFor(() => expect(screen.queryByTestId('mock-ghost-A')).not.toBeNull()) // the ghost is drawn
    fireEvent.click(row('A'))
    expect(row('A'), 'precondition: the row is highlighted before the collapse').toHaveAttribute('data-highlighted', 'true')
    collapse()
    expand()
    expect(row('A')).toHaveAttribute('data-highlighted', 'true')
  })
})

// ============================================================================
// Task 1.3 - the no-mark statement is the log's local state
// ============================================================================
describe('Task 1.3 - a row\'s no-mark statement survives a collapse and re-expand', () => {
  it("Scenario: A row's no-mark statement survives a collapse and re-expand", async () => {
    servePile([noGhost('A')])
    renderView()
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A')).not.toBeNull())
    fireEvent.click(row('A'))
    expect(within(row('A')).getByText(NO_MARK_TEXT), 'precondition: the statement is shown before the collapse').toBeInTheDocument()
    collapse()
    expand()
    expect(within(row('A')).getByText(NO_MARK_TEXT)).toBeInTheDocument()
  })
})

// ============================================================================
// Task 1.4 - nothing of the log is reachable while collapsed (guard)
// ============================================================================
describe('Task 1.4 - nothing of the log is reachable while the dock is collapsed', () => {
  it('Scenario: Nothing of the log is reachable while the dock is collapsed / Scenario: A highlighted row is not presented while the dock is collapsed', async () => {
    servePile([withGhost('A')])
    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(screen.queryByTestId('mock-ghost-A')).not.toBeNull())
    fireEvent.click(screen.getByTestId('mock-ghost-A')) // a ghost activated for a listed row; the dock stays collapsed
    expect(region()).toHaveAttribute('hidden')

    const visited: Element[] = []
    const anchor = screen.getByTestId('fleet-row-fleet_1')
    anchor.focus()
    for (let i = 0; i < 120; i++) {
      await user.tab()
      const el = document.activeElement
      if (el) visited.push(el)
      if (el === anchor) break
    }
    expect(visited.at(-1), 'the keyboard walk completed a full cycle').toBe(anchor)
    expect(visited, 'non-vacuity: the Tab walk visited the Console control').toContain(open())
    for (const el of visited) expect(region().contains(el), 'a focused stop was inside the collapsed dock region').toBe(false)

    expect(within(region()).queryAllByRole('button')).toHaveLength(0)
    expect(within(region()).queryAllByRole('status')).toHaveLength(0)
    for (const r of screen.queryAllByTestId(/^sighting-row-/)) expect(r).not.toBeVisible()

    // the re-expansion half (shares 1.2's control status)
    expand()
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-A')).not.toBeNull())
    expect(row('A')).toHaveAttribute('data-highlighted', 'true')
  })
})

// ============================================================================
// Task 1.5 / 1.6 - failed states
// ============================================================================
describe('Task 1.5 - a pile read that failed while collapsed shows its failed state on expansion', () => {
  it('Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion', async () => {
    serve.pile = () => Promise.reject(new Error('pile: 500'))
    renderView()
    await flush()
    const snapshot = pileRequests().length
    expand()
    expect(within(panel()).queryByTestId('sighting-log-error'), 'the failed state is not shown on expansion').not.toBeNull()
    expect(within(within(panel()).getByTestId('sighting-log-error')).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(panel()).queryByTestId('sighting-log-empty')).toBeNull()
    expect(within(panel()).queryByText('Reading the pile…')).toBeNull()
    expect(pileRequests().length, 'the expansion issued a pile request').toBe(snapshot)
  })
})

describe('Task 1.6 - the log\'s retry and the sightings-unavailable card\'s retry are independent', () => {
  it("Scenario: The log's retry and the sightings-unavailable card's retry are independent", async () => {
    serve.pile = () => Promise.reject(new Error('pile: 500'))
    serve.ghost = () => Promise.reject(new Error('ghost: 500'))
    renderView()
    expand()
    const card = await screen.findByTestId('sightings-unavailable')
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-log-error')).not.toBeNull())
    serve.ghost = () => Promise.resolve(page([]))
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByTestId('sightings-unavailable')).toBeNull())
    expect(within(panel()).queryByTestId('sighting-log-error')).not.toBeNull()
  })
})

// ============================================================================
// Task 1.7 - the first read without an expansion
// ============================================================================
describe('Task 1.7 - the first read is issued without the dock being expanded', () => {
  it("Scenario: The log's first read is issued without the dock being expanded", async () => {
    renderView()
    await flush()
    expect(region()).toHaveAttribute('hidden')
    expect(pileRequests()).toHaveLength(1)
  })
})

// ============================================================================
// Task 1.8 - showing issues no request
// ============================================================================
describe('Task 1.8 - showing the log tab issues no request', () => {
  it('Scenario: Expanding and re-expanding after the first read issues no request (the Console control)', async () => {
    servePile([withGhost('A')])
    renderView()
    await settleFirstRead('A')
    const snapshot = pileRequests().length
    expand()
    collapse()
    expand()
    expect(pileRequests().length, 'expand, collapse, expand issued a pile request').toBe(snapshot)
  })

  it('Scenario: Escape collapsing the dock clears no selection (its request clause: a collapse by Escape then a re-expansion)', async () => {
    servePile([withGhost('A')])
    const user = userEvent.setup()
    renderView()
    await settleFirstRead('A')
    const snapshot = pileRequests().length
    expand()
    await user.keyboard('{Escape}')
    expect(region(), 'precondition: Escape collapsed the dock').toHaveAttribute('hidden')
    expand()
    expect(pileRequests().length, 'a collapse by Escape then a re-expansion issued a pile request').toBe(snapshot)
  })

  it("Scenario: The report's link to the log issues no pile request", async () => {
    servePile([withGhost('A')])
    mockListSettled.mockResolvedValue([SETTLED_SCAN])
    const user = userEvent.setup()
    renderView()
    await settleFirstRead('A')
    await screen.findByTestId('scan-report')
    // The report lives in the Scan tab now. `settleFirstRead` left Log as the
    // remembered tab, so re-open and select Scan, then follow the report's link.
    fireEvent.click(open())
    fireEvent.click(screen.getByTestId('console-tab-scan'))
    expect(screen.getByTestId('console-tab-scan')).toHaveAttribute('aria-selected', 'true')
    const snapshot = pileRequests().length
    await user.click(screen.getByRole('button', { name: 'Open the sighting log' }))
    expect(region(), 'checkpoint: the dock is expanded').not.toHaveAttribute('hidden')
    expect(screen.getByTestId('console-tab-log')).toHaveAttribute('aria-selected', 'true')
    expect(pileRequests().length, 'the report link issued a pile request').toBe(snapshot)
  })

  it("Scenario: A later re-read of the interior neither removes the log nor issues a pile read (its request clause; control, green on arrival)", async () => {
    vi.useFakeTimers()
    servePile([withGhost('A')])
    const interiorRefetch = vi.fn(async () => undefined)
    useSystemSpace.mockReturnValue(answered({ refetch: interiorRefetch }))
    const view = renderView()
    expand()
    await flushFake()
    expect(row('A')).toBeInTheDocument()
    await flushFake()
    // SDET note: the snapshot is taken after the single expansion (not after a collapse), so that under a build that
    // remounts on show the control stays what it is for: the interior re-read, not the expansion, is what is measured.
    const snapshot = pileRequests().length

    useSystemSpace.mockReturnValue(answered({ isFetching: true, refetch: interiorRefetch }))
    act(() => view.again())
    await act(async () => { await vi.advanceTimersByTimeAsync(BOARD_POLL_MS) })
    expect(interiorRefetch, 'non-vacuity: the baseline poll re-read the interior').toHaveBeenCalled()
    useSystemSpace.mockReturnValue(answered({ isFetching: false, refetch: interiorRefetch }))
    act(() => view.again())
    await flushFake()
    expect(row('A')).toBeInTheDocument()
    expect(pileRequests().length, 'a re-read of the interior caused a pile request').toBe(snapshot)
  })
})

// ============================================================================
// Task 1.9 - the explicit refresh (positive control for 1.8)
// ============================================================================
describe('Task 1.9 - the explicit refresh lists a record filed since the last read', () => {
  it('Scenario: A record filed since the last read is listed after an explicit refresh', async () => {
    servePile([withGhost('A')])
    renderView()
    await settleFirstRead('A')
    servePile([withGhost('A'), withGhost('B')])
    expand()
    await flush()
    const before = pileRequests().length
    fireEvent.click(within(panel()).getByRole('button', { name: 'Refresh sighting log' }))
    await waitFor(() => expect(within(panel()).queryByTestId('sighting-row-B')).not.toBeNull())
    expect(pileRequests().length, 'non-vacuity: the harness saw a pile request caused by the Refresh click').toBeGreaterThan(before)
  })
})

// ============================================================================
// Tasks 1.10 / 1.11 - the settle re-read, both exits
// ============================================================================
describe('Task 1.10 - the settle re-read on the ETA-scheduled exit', () => {
  it('Scenario: A pile read that answers while the dock is collapsed is shown on re-expand (the ETA-scheduled settle exit; closes drift-sighting-log-not-reread-after-sweep-settles)', async () => {
    mockListRunning
      .mockResolvedValueOnce([
        { id: 'action_running_settle_1', type: 'scan', actor: FLEET_ID, scope: SYSTEM_ID, committedAt: T0 - 1_000, eta: T0 + 5_000, status: 'running', worldTime: T0 },
      ])
      .mockResolvedValue([])
    const held = deferred<void>()
    useSystemSpace.mockReturnValue(answered({ refetch: vi.fn(() => held.promise) }))
    servePile([withGhost('A')])

    vi.useFakeTimers()
    renderView()
    await flushFake()
    // Labelled precondition: the log's first read was issued with the dock never expanded.
    expect(pileRequests().length, 'precondition: the log\'s first read was issued').toBe(1)
    const snapshot = pileRequests().length
    servePile([withGhost('A'), withGhost('B')])

    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(pileRequests().length, 'the pile was read while the settling interior read was still held').toBe(snapshot)

    await act(async () => { held.resolve(); await vi.advanceTimersByTimeAsync(0) })
    await flushFake()
    expect(pileRequests().length, 'the unfiltered pile was not read again').toBe(snapshot + 1)

    expand()
    expect(row('B')).toBeInTheDocument()
    expect(pileRequests().length, 'the expansion issued a pile request').toBe(snapshot + 1)
  })
})

describe('Task 1.11 - the settle re-read on the early-settle exit', () => {
  it('Scenario: A pile read that answers while the dock is collapsed is shown on re-expand (the early-settle exit)', async () => {
    const heldRunning = deferred<unknown[]>()
    mockScanTargets.mockResolvedValue([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }])
    mockListRunning.mockResolvedValueOnce([]).mockImplementationOnce(() => heldRunning.promise).mockResolvedValue([])
    mockScan.mockResolvedValue(ownFleet())
    servePile([withGhost('A')])

    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await flush()
    expect(pileRequests().length, 'precondition: the log\'s first read was issued').toBe(1)
    const snapshot = pileRequests().length

    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))
    await waitFor(() => expect(mockListRunning).toHaveBeenCalledTimes(2))
    servePile([withGhost('A'), withGhost('B')])
    await flush()
    expect(pileRequests().length, 'the pile was read before the running-status read answered').toBe(snapshot)

    await act(async () => { heldRunning.resolve([]) })
    await waitFor(() => expect(pileRequests().length, 'the unfiltered pile was not read again').toBe(snapshot + 1))
    await flush()
    expect(pileRequests().length).toBe(snapshot + 1)

    expand()
    expect(row('B')).toBeInTheDocument()
    expect(pileRequests().length, 'the expansion issued a pile request').toBe(snapshot + 1)
  })
})

// ============================================================================
// Task 1.14 - the waiting indication under the latch (contract 3.6)
// ============================================================================
describe('Task 1.14 - the waiting indication under the latch', () => {
  type Shown = 'waiting' | 'log' | 'neither'
  function shown(): Shown {
    const p = panel()
    if (within(p).queryByTestId('console-panel-waiting')) return 'waiting'
    if (within(p).queryByTestId('sighting-log')) return 'log'
    return 'neither'
  }
  const sequence = (...states: Shown[]) => states.filter((s, i) => i === 0 || s !== states[i - 1])

  it('Scenario: The panel shows the log once the interior read has finished (1a: a held interior, nothing in flight)', () => {
    useSystemSpace.mockReturnValue(answered({ isFetching: false }))
    renderView()
    expand()
    expect(region()).not.toHaveAttribute('hidden')
    expect(sequence(shown())).toEqual(['log'])
    expect(screen.queryByTestId('console-panel-waiting')).toBeNull()
  })

  it('Scenario: A view that opens with no interior read in flight has the log from its first render (1b, r3-m1: no interior held, nothing in flight)', () => {
    useSystemSpace.mockReturnValue(answered({ data: undefined, isFetching: false }))
    renderView()
    expand()
    expect(region()).not.toHaveAttribute('hidden')
    expect(within(panel()).getByTestId('sighting-log')).toBeInTheDocument()
    expect(screen.queryByTestId('console-panel-waiting')).toBeNull()
  })

  it("Scenario: The panel shows a waiting indication while the interior read's first load is in flight / Scenario: The panel shows the log once the interior read's first load has answered or failed (answers)", () => {
    useSystemSpace.mockReturnValue(answered({ data: undefined, isLoading: true }))
    const view = renderView()
    expand()
    const seen = [shown()]
    expect(within(panel()).getByTestId('console-panel-waiting').textContent).not.toContain('Reading the pile')
    useSystemSpace.mockReturnValue(answered())
    act(() => view.again())
    seen.push(shown())
    expect(sequence(...seen)).toEqual(['waiting', 'log'])
  })

  it("Scenario: The panel shows the log once the interior read's first load has answered or failed (fails)", () => {
    useSystemSpace.mockReturnValue(answered({ data: undefined, isLoading: true }))
    const view = renderView()
    expand()
    const seen = [shown()]
    useSystemSpace.mockReturnValue(answered({ data: undefined, isError: true, error: new Error('x') }))
    act(() => view.again())
    seen.push(shown())
    expect(sequence(...seen)).toEqual(['waiting', 'log'])
  })

  it('Scenario: The panel shows the waiting indication during that re-read and the log once it has answered (warm, answers)', () => {
    useSystemSpace.mockReturnValue(answered({ isFetching: true }))
    const view = renderView()
    expand()
    const seen = [shown()]
    if (shown() === 'waiting') expect(within(panel()).getByTestId('console-panel-waiting').textContent).not.toContain('Reading the pile')
    useSystemSpace.mockReturnValue(answered({ isFetching: false }))
    act(() => view.again())
    seen.push(shown())
    expect(sequence(...seen), 'the log was shown while the re-read was in flight').toEqual(['waiting', 'log'])
  })

  it('Scenario: The panel shows the waiting indication during that re-read and the log once it has failed (warm, fails)', () => {
    useSystemSpace.mockReturnValue(answered({ isFetching: true }))
    const view = renderView()
    expand()
    const seen = [shown()]
    useSystemSpace.mockReturnValue(answered({ isFetching: false, isError: true, error: new Error('x') }))
    act(() => view.again())
    seen.push(shown())
    expect(sequence(...seen), 'the log was shown while the re-read was in flight').toEqual(['waiting', 'log'])
  })
})

// ============================================================================
// Task 1.15 - the warm arm over the real interior hook
// ============================================================================
describe('Task 1.15 - the log reads nothing while the re-read of a held interior is in flight (real interior hook)', () => {
  it('Scenario: The log reads nothing while the re-read of an interior the view already held is in flight', async () => {
    interiorMode.real = true
    const heldInterior = deferred<unknown>()
    mockGetSystemSpace.mockReturnValue(heldInterior.promise)
    servePile([withGhost('A')])

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(queryKeys.systemSpace.detail(SYSTEM_ID), INTERIOR, { updatedAt: Date.now() - 120_000 })
    qc = client
    rtlRender(
      <QueryClientProvider client={client}>
        <SystemSpaceView systemId={SYSTEM_ID} />
      </QueryClientProvider>,
    )
    expect(mockGetSystemSpace, 'non-vacuity: the interior re-read is in flight and held').toHaveBeenCalled()
    expect(pileRequests(), 'a pile read after the first commit, with the re-read held').toHaveLength(0)
    await flush()
    expect(pileRequests(), 'a pile read after a flush, collapsed, with the re-read held').toHaveLength(0)

    expand()
    await flush()
    expect(pileRequests(), 'a pile read after the expansion, with the re-read still held').toHaveLength(0)

    await act(async () => { heldInterior.resolve(INTERIOR) })
    await flush()
    expect(pileRequests(), 'exactly one pile read once the re-read resolved').toHaveLength(1)
  })
})
