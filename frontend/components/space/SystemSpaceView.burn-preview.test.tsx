import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE SUITE — openspec change `lift-burn-preview-to-view`, capability
// `system-space-view`: the two MODIFIED requirements *Burn Preview Reflects
// the Server-Solved Order, Without Committing* and *A Failed or Stale Preview
// Is Never Presented as a Current Quote* (tasks.md 3.1-3.16; impl contract
// §5.4, §6).
//
// WHAT IS REAL. `SystemSpaceView`, `SpaceCommandPanel`, `FleetActionsPanel`,
// `FleetRoster`, `ScanControl`, `VitalsStrip`, `@/hooks/use-burn-preview`,
// `@/hooks/use-actions` (all of it, so `useRunningMine`/`useRunningScan`/
// `useCancelAction` run for real) and, from `@/hooks/use-fleets`, `useOrder`
// and `useMine`. The preview hook is NEVER mocked: a test that mocks it cannot
// close the running-mine drift, because the drift lives in the view's call
// site (what the view hands the hook), not in the hook.
//
// WHAT IS MOCKED. The service boundary (`@/lib/services`: preview, order,
// mine, listRunning, cancel, listSettled, acknowledge, scan-targets), and, as
// the `SystemSpaceView*` family does, the interior/own-fleets/station/board/
// session/galaxy/sightings reads, the router and the stage.
//
// OBSERVATION. Every task observes the real call site through
// `fleetService.preview` called or not called, and through what the panel
// renders — asserted via testids and `data-*` attributes, never copy.
// Every test makes a selection (a test that never selects passes against the
// bug).
//
// TIME. Fake timers throughout; no real sleeps. "Several intervals" is
// `3 * PREVIEW_REFRESH_MS`, imported, never a literal.

const mocks = vi.hoisted(() => ({
  useSystemSpace: vi.fn(),
  useMyFleets: vi.fn(),
  push: vi.fn(),
  preview: vi.fn(),
  order: vi.fn(),
  stop: vi.fn(),
  mine: vi.fn(),
  listRunning: vi.fn(),
  cancel: vi.fn(),
  listSettled: vi.fn(),
  acknowledge: vi.fn(),
  scanTargets: vi.fn(),
  scan: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/services', () => ({
  fleetService: {
    preview: (...a: unknown[]) => mocks.preview(...a),
    order: (...a: unknown[]) => mocks.order(...a),
    stop: (...a: unknown[]) => mocks.stop(...a),
    mine: (...a: unknown[]) => mocks.mine(...a),
    scanTargets: (...a: unknown[]) => mocks.scanTargets(...a),
    scan: (...a: unknown[]) => mocks.scan(...a),
  },
  actionService: {
    listRunning: (...a: unknown[]) => mocks.listRunning(...a),
    cancel: (...a: unknown[]) => mocks.cancel(...a),
    listSettled: (...a: unknown[]) => mocks.listSettled(...a),
    acknowledge: (...a: unknown[]) => mocks.acknowledge(...a),
  },
}))

// Real: useOrder, useMine (commit paths) via `...actual`. Mocked: the
// own-fleets read, and the verbs this file never drives (inert).
vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  const inert = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })
  const jump = inert()
  const cutDrive = inert()
  const hold = inert()
  const release = inert()
  return {
    ...actual,
    useMyFleets: () => mocks.useMyFleets(),
    useJump: () => jump,
    useCutDrive: () => cutDrive,
    useHold: () => hold,
    useRelease: () => release,
  }
})
vi.mock('@/hooks/use-system-space', () => ({ useSystemSpace: (id: string) => mocks.useSystemSpace(id) }))
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: () => ({
    data: { pages: [{ sightings: [], nextCursor: '' }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-market', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-market')
  const inert = { mutate: vi.fn(), mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }
  return {
    ...actual,
    useMarketBoard: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
    useStation: () => ({ data: undefined, isLoading: false, isError: true, error: { status: 404 }, refetch: vi.fn() }),
    useSell: () => inert,
    useRefuel: () => inert,
  }
})
vi.mock('@/components/corporation-provider', () => ({
  useCorporationOptional: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1000 }),
  useCorporation: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1000 }),
  useCorporationSessionOptional: () => ({
    corporation: { id: 'corp-1', name: 'SDET Corp', credits: 1000 },
    isError: false,
  }),
}))
vi.mock('@/hooks/use-galaxy', () => ({
  useGalaxy: () => ({ data: undefined, isLoading: false, isError: false, isStartArea: false }),
}))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: { uid: 'u1' }, authLoading: false, isAdmin: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

// The stage, at its seam: exposes the selection as `data-selection` and one
// trigger per target the tests pick (body, station, gate body, a point, and a
// fleet mark).
vi.mock('./SpaceStage', async () => {
  const ReactMod = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function SpaceStageMock(props: any) {
    ReactMod.useEffect(() => {
      props.onAvailabilityChange?.(true)
      props.onFirstFrame?.()
    }, [props])
    const trigger = (id: string, pick: unknown) =>
      ReactMod.createElement('button', {
        key: id,
        type: 'button',
        'data-testid': `mock-select-${id}`,
        onClick: () => props.onSelect?.(pick),
      })
    return ReactMod.createElement(
      'div',
      {
        'data-testid': 'space-canvas-region',
        'data-selection': props.selection ? (props.selection.bodyId ?? 'point') : '',
      },
      trigger('feat-body-0', { bodyId: 'feat-body-0' }),
      trigger('feat-body-1', { bodyId: 'feat-body-1' }),
      trigger('feat-station', { bodyId: 'feat-station' }),
      trigger('gate-sys_-6_16', { bodyId: 'gate-sys_-6_16' }),
      trigger('point', { point: { x: 30, y: 0, z: -10 } }),
      ReactMod.createElement('button', {
        key: 'activate-fleet_b',
        type: 'button',
        'data-testid': 'mock-activate-fleet_b',
        onClick: () => props.onActivateFleet?.('fleet_b'),
      }),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'
import { PREVIEW_REFRESH_MS } from '@/lib/realtime'
import { queryKeys } from '@/lib/query-keys'

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'
const HOST = 'feat-body-0' // the mineable body the fleet is docked at
const OTHER = 'feat-body-1'
const STATION = 'feat-station'
const GATE = 'gate-sys_-6_16'
const SEVERAL = 3 * PREVIEW_REFRESH_MS

const INTERIOR = {
  systemId: SYSTEM_ID,
  extent: 658.7,
  character: 'normal',
  starClass: 'M',
  worldTime: T0,
  scale: 1,
  features: [
    { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 },
    {
      id: HOST,
      type: 'rocky',
      space: { X: 18, Y: -3, Z: -15 },
      size: 1.76,
      resources: [{ kind: 'metals', richness: 0.3 }],
      orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18591, phase: 373097, inclination: 500434, node: 205958 },
    },
    {
      id: OTHER,
      type: 'rocky',
      space: { X: -30, Y: 4, Z: 12 },
      size: 1.2,
      resources: [],
      orbitElements: { parentId: 'feat-star', radius: 40, periodMs: 30000, phase: 5, inclination: 100, node: 7 },
    },
    {
      id: STATION,
      type: 'station',
      space: { X: -22, Y: 0, Z: 9 },
      size: 0.6,
      resources: [],
      orbitElements: { parentId: 'feat-star', radius: 32, periodMs: 72000, phase: 10, inclination: 0, node: 0 },
    },
  ],
  laneGates: [
    {
      id: GATE,
      destSystemId: 'sys_-6_16',
      laneId: 'lane_-7_17_-6_16',
      space: { X: 694, Y: 0, Z: -207 },
      size: 1.2,
      orbitElements: { parentId: 'feat-star', radius: 724.57, periodMs: 0, phase: 1000101, inclination: 0, node: 0 },
    },
  ],
  contacts: [],
}

const PARK = {
  Kind: 0,
  BodyId: 'feat-star',
  Radius: 4,
  PeriodMs: 6000,
  Phase: 0,
  EpochMs: T0,
  Offset: { X: 0, Y: 0, Z: 0 },
  Point: { X: 0, Y: 0, Z: 0 },
}

function fleet(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    corporationId: 'corp-1',
    systemId: SYSTEM_ID,
    own: true,
    worldTime: T0,
    scale: 1,
    position: { X: 5, Y: 0, Z: 0 },
    attachedTo: undefined as string | undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: PARK },
    roster: {
      ships: [{ class: 'hauler' }],
      cargo: {},
      cargoCapacity: 40,
      freeHold: 40,
      miningRate: 1,
      fuelPricePerTon: 5,
      stationKeepRateTonsPerSecond: 0.02,
    },
    ...over,
  }
}

const attachedTo = (id: string, host: string | undefined) => fleet(id, { attachedTo: host })

function burningFleet(id: string) {
  return fleet(id, {
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 0, Y: 0, Z: 0 },
        Target: { BodyId: HOST, Point: null },
        Intercept: { X: 18, Y: -3, Z: -15 },
        Curve: [],
        Length: 1,
        DepartMs: T0 - 1_000,
        ArriveMs: T0 + 5_000_000,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
  })
}

const QUOTE = {
  controlPoints: [0, 1, 2, 3, 4, 5].map((i) => ({ X: i, Y: 0, Z: 0 })),
  departMs: T0,
  arriveMs: T0 + 930_373,
  deltaV: 3721.492,
  fuelCostTons: 744.2984,
  affordable: true,
  strandingWarning: false,
}
const QUOTE_2 = { ...QUOTE, deltaV: 4000.5, fuelCostTons: 800.1 }

function mineAction(fleetId: string, etaOffsetMs: number) {
  return {
    id: `act_mine_${fleetId}`,
    type: 'mine',
    actor: fleetId,
    scope: SYSTEM_ID,
    committedAt: T0,
    eta: T0 + etaOffsetMs,
    status: 'running',
    worldTime: T0,
  }
}

const CAP_ERROR = Object.assign(new Error('rejected'), {
  data: { error: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap' },
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// --- harness state ---------------------------------------------------------

let qc: QueryClient
let rerenderView: () => void
// The running-action read, answered by fleet id — never by call order.
const running = new Map<string, unknown[] | Promise<unknown[]>>()

function setFleets(fleets: Record<string, unknown>[]) {
  mocks.useMyFleets.mockReturnValue({
    data: fleets,
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  })
}

function mount(fleets: Record<string, unknown>[]) {
  setFleets(fleets)
  mocks.useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  // The app's own query defaults that bear on the lag rules (impl contract
  // §5.4 fact 2): a one-minute staleTime, no focus refetch, no retries.
  qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
  })
  const wrap = () => (
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>
  )
  const rendered = rtlRender(wrap())
  rerenderView = () => rendered.rerender(wrap())
  return rendered
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function click(testId: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId))
  })
  await flush(0)
}

const burn = () => screen.getByTestId('burn-button') as HTMLButtonElement
const has = (id: string) => screen.queryByTestId(id) !== null
const selection = () => screen.getByTestId('space-canvas-region').getAttribute('data-selection')
const previewCalls = () => mocks.preview.mock.calls
const callsFor = (fleetId: string) => previewCalls().filter((c) => c[0] === fleetId)

function expectNothingPresentedAsFailed() {
  expect(has('preview-no-quote'), 'a withheld preview is not a failed one: no no-quote state').toBe(false)
  expect(has('preview-stale'), 'no stale marking').toBe(false)
  expect(has('preview-retry'), 'no retry affordance').toBe(false)
}

function expectNoFigures() {
  expect(has('preview-deltav'), 'no figure').toBe(false)
  expect(has('preview-arrival')).toBe(false)
  expect(has('preview-fuel')).toBe(false)
  expect(has('preview-fuel-ceiling'), 'no ceiling').toBe(false)
}

// Re-reads the running-action query after changing the mocked answer, the way
// a refreshed read does (impl contract §5.4 / task 3.16).
async function refreshRunning(fleetId: string) {
  await act(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleetId) })
  })
  await flush(0)
}

function orderRequest(callIndex = 0): Record<string, unknown> {
  return mocks.order.mock.calls[callIndex][1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  // A failed test must not leak an unconsumed `mockImplementationOnce` into the next one.
  Object.values(mocks).forEach((m) => m.mockReset())
  vi.useFakeTimers()
  running.clear()
  mocks.preview.mockResolvedValue(QUOTE)
  mocks.order.mockResolvedValue(burningFleet('fleet_1'))
  mocks.stop.mockResolvedValue(fleet('fleet_1'))
  mocks.mine.mockResolvedValue({ id: 'act_mine_fleet_1', eta: T0 + 600_000 })
  mocks.listSettled.mockResolvedValue([])
  mocks.scanTargets.mockResolvedValue([])
  mocks.acknowledge.mockResolvedValue({})
  mocks.listRunning.mockImplementation((id: string) => {
    const answer = running.get(id)
    return answer instanceof Promise ? answer : Promise.resolve(answer ?? [])
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================

describe('SystemSpaceView — a running mine withholds the preview (lift-burn-preview-to-view 3.1-3.5)', () => {
  // 3.1
  it('Scenario: No preview is requested while a mine holds the movement channel — and a withheld preview is never presented as a failed one, nor the uncapped label shown beside the disabled Burn', async () => {
    running.set('fleet_1', [mineAction('fleet_1', 600_000)])
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    expect(has('mine-countdown'), 'GIVEN: the mine is known to the running-action read').toBe(true)

    await click(`mock-select-${OTHER}`)
    expect(selection()).toBe(OTHER)
    await flush(SEVERAL)

    expect(mocks.preview, 'no preview request across several intervals while the mine holds the channel').not.toHaveBeenCalled()
    expect(burn().disabled, 'Burn is gated by the running mine').toBe(true)
    expectNoFigures()
    expectNothingPresentedAsFailed()
    expect(has('burn-uncapped-label'), 'Scenario: The uncapped-burn label is never shown beside an unavailable burn command').toBe(false)
  })

  // 3.2
  it('Scenario: A mine that starts while a preview is shown withdraws it — a mine committed from this view, once the refreshed read answers', async () => {
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(has('preview-deltav'), 'GIVEN: a preview is shown').toBe(true)
    const before = previewCalls().length

    mocks.mine.mockImplementation(async () => {
      running.set('fleet_1', [mineAction('fleet_1', 600_000)])
      return { id: 'act_mine_fleet_1', eta: T0 + 600_000 }
    })
    await click('mine-button')
    await flush(0)

    expect(has('mine-countdown'), 'the refreshed running-action read reports the mine').toBe(true)
    expectNoFigures()
    expect(burn().disabled).toBe(true)
    await flush(SEVERAL)
    expect(previewCalls().length, 'no further preview request while the mine holds the channel').toBe(before)
    expect(selection(), 'the selection is unchanged').toBe(OTHER)
  })

  // 3.3 — two arms, each asserting the GIVEN first
  it.each([
    ['A mine\'s completion restores the quote (its ETA passes)', 'eta'],
    ['A cancelled mine restores the quote (cancelled through the real control)', 'cancel'],
  ] as const)('Scenario: %s', async (_name, arm) => {
    const etaOffset = arm === 'eta' ? SEVERAL + 5_000 : 600_000
    running.set('fleet_1', [mineAction('fleet_1', etaOffset)])
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    await flush(SEVERAL)
    expect(mocks.preview, 'GIVEN: no request is sent for the held selection while the mine holds the channel').not.toHaveBeenCalled()

    if (arm === 'eta') {
      await flush(6_000) // past the mine's ETA; the running-action read still reports the mine
    } else {
      mocks.cancel.mockImplementation(async () => {
        running.set('fleet_1', [])
        return { ...mineAction('fleet_1', etaOffset), status: 'cancelled' }
      })
      await click('mine-cancel')
      await flush(0)
    }

    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { bodyId: OTHER })
    expect(selection()).toBe(OTHER)
  })

  // 3.4
  it('Scenario: The mine suppression and the burn command\'s mine gate change together — at the ETA, with the read still reporting the mine', async () => {
    running.set('fleet_1', [mineAction('fleet_1', 5_500)])
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(burn().disabled, 'GIVEN: the mine holds the channel').toBe(true)
    expect(mocks.preview).not.toHaveBeenCalled()

    // Step the coarse tick until the burn command becomes available; at that
    // very render the preview request must already have been sent.
    let enabledAtStep = -1
    for (let step = 1; step <= 10; step++) {
      await flush(1_000)
      if (burn().disabled) {
        expect(mocks.preview, `step ${step}: still gated, so still no request`).not.toHaveBeenCalled()
      } else {
        enabledAtStep = step
        break
      }
    }
    expect(enabledAtStep, 'the burn command became available at the ETA').toBeGreaterThan(0)
    expect(
      mocks.preview,
      'a request is sent in the same render the mine gate lifts (the one mineRunning), not at the next read or interval',
    ).toHaveBeenCalledWith('fleet_1', { bodyId: OTHER })
    expect(mocks.preview).toHaveBeenCalledTimes(1)
  })

  // 3.5
  it('Scenario: A mine not yet read costs at most the requests until its read answers', async () => {
    const bRead = deferred<unknown[]>()
    running.set('fleet_b', bRead.promise)
    mount([fleet('fleet_a'), fleet('fleet_b')])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(callsFor('fleet_a').length, 'fleet_a (acting) previews').toBe(1)

    await click('fleet-row-fleet_b')
    const elapsed = 2 * PREVIEW_REFRESH_MS + 1_000
    await flush(elapsed)
    expect(callsFor('fleet_b').length, 'fleet_b starts with a request').toBeGreaterThanOrEqual(1)
    expect(
      callsFor('fleet_b').length,
      'no more requests than the starting one and one per elapsed interval while the read is unanswered',
    ).toBeLessThanOrEqual(1 + Math.floor(elapsed / PREVIEW_REFRESH_MS))
    expect(has('preview-deltav'), 'figures were shown for fleet_b before its read answered').toBe(true)

    await act(async () => {
      bRead.resolve([mineAction('fleet_b', 600_000)])
    })
    await flush(0)
    expectNoFigures()
    const after = callsFor('fleet_b').length
    await flush(SEVERAL)
    expect(callsFor('fleet_b').length, 'no further request from fleet_b once its mine is read').toBe(after)
  })
})

describe('SystemSpaceView — lane transit and the fleet\'s own host (3.6-3.10)', () => {
  // 3.6 (regression guard)
  it('Scenario: A fleet in lane transit requests no preview — (regression guard) figures go, nothing presented as failed, destination guidance replaces Burn, one hand-off navigation', async () => {
    mount([fleet('fleet_1')])
    await flush(0)
    await click('fleet-row-fleet_1')
    await click(`mock-select-${OTHER}`)
    expect(has('preview-deltav'), 'GIVEN: a preview is shown').toBe(true)
    const before = previewCalls().length

    setFleets([
      fleet('fleet_1', { jump: { laneId: 'lane_-7_17_-6_16', destSystemId: 'sys_-6_16', departMs: T0, arriveMs: T0 + 600_000 } }),
    ])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    expectNoFigures()
    await flush(SEVERAL)
    expect(previewCalls().length, 'no further request for that selection').toBe(before)
    expectNothingPresentedAsFailed()
    expect(screen.queryByTestId('burn-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('fleet-location-panel')).toHaveTextContent('View destination')
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  // 3.7 — host held from the start, three host kinds
  it.each([
    ['a station', STATION],
    ['a lane-gate body', GATE],
    ['a plain body (the mining host)', HOST],
  ])('Scenario: A fleet docked at its selected target requests no preview — %s', async (_name, host) => {
    mount([attachedTo('fleet_1', host)])
    await flush(0)
    await click(`mock-select-${host}`)
    expect(selection()).toBe(host)
    await flush(SEVERAL)

    expect(mocks.preview, 'no request for a burn from a body to itself').not.toHaveBeenCalled()
    expect(selection(), 'the selection is left as it is').toBe(host)
    expectNoFigures()
    expectNothingPresentedAsFailed()
    expect(burn().disabled, 'the burn command\'s availability is unchanged').toBe(false)
  })

  // 3.7 — a previewed body the fleet then becomes attached to
  it.each([
    ['a station', STATION],
    ['a lane-gate body', GATE],
    ['a plain body (the mining host)', HOST],
  ])('Scenario: A withheld preview is never presented as a failed one — a previewed body the own-fleets read then reports the fleet attached to (%s)', async (_name, host) => {
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    await click(`mock-select-${host}`)
    expect(has('preview-deltav'), 'GIVEN: the body is previewed while the fleet is free').toBe(true)
    const before = previewCalls().length

    setFleets([attachedTo('fleet_1', host)])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    expectNoFigures()
    await flush(SEVERAL)
    expect(previewCalls().length, 'no further request once the fleet is attached to the selected target').toBe(before)
    expectNothingPresentedAsFailed()
    expect(selection()).toBe(host)
  })

  // 3.8 (regression guard)
  it('Scenario: Another body or a point is previewed while the fleet is docked — (regression guard)', async () => {
    mount([attachedTo('fleet_1', STATION)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { bodyId: OTHER })
    expect(has('preview-deltav')).toBe(true)

    await click('mock-select-point')
    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { point: { X: 30, Y: 0, Z: -10 } })
    expect(has('preview-deltav')).toBe(true)
  })

  // 3.9 (regression guard) — the "must not withhold" arm
  it('Scenario: A fleet that has left its host previews that host like any other target — (regression guard)', async () => {
    mount([attachedTo('fleet_1', STATION)])
    await flush(0)
    await click(`mock-select-${STATION}`)
    const before = callsFor('fleet_1').filter((c) => (c[1] as { bodyId?: string }).bodyId === STATION).length

    setFleets([attachedTo('fleet_1', undefined)])
    await act(async () => {
      rerenderView()
    })
    await flush(PREVIEW_REFRESH_MS)

    const after = callsFor('fleet_1').filter((c) => (c[1] as { bodyId?: string }).bodyId === STATION).length
    expect(after, 'a request for the station\'s body arrives within one refresh interval of the detachment').toBeGreaterThan(before)
    expect(has('preview-deltav'), 'its figures are rendered').toBe(true)
  })

  // 3.10 (regression guard)
  it('Scenario: Selecting a target shows a preview curve and its figures — (regression guard) parked, attached to nothing: a body, then a point', async () => {
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { bodyId: OTHER })
    expect(has('preview-deltav')).toBe(true)

    // The point case guards the absent-equals-absent comparison (design
    // decision 4): a point is never a fleet's host, even with no attachment.
    await click('mock-select-point')
    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { point: { X: 30, Y: 0, Z: -10 } })
    expect(has('preview-deltav')).toBe(true)
    expect(screen.getByTestId('preview-deltav')).toHaveAttribute('data-raw', String(QUOTE.deltaV))
  })
})

describe('SystemSpaceView — refresh cadence, stale quotes, burning re-target, cap rejection (3.11-3.15)', () => {
  // 3.11 (regression guard) — cadence
  it('Scenario: The preview refreshes on exactly one named interval while shown — (regression guard) one request per elapsed interval', async () => {
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(previewCalls().length).toBe(1)
    await flush(PREVIEW_REFRESH_MS - 1_000)
    expect(previewCalls().length, 'none between intervals').toBe(1)
    await flush(SEVERAL - PREVIEW_REFRESH_MS + 1_500)
    expect(previewCalls().length, 'exactly one request per elapsed interval (three elapsed)').toBe(4)
  })

  // 3.11 — second arrangement
  it('Scenario: A stale figure never becomes a cap — (regression guard) a refresh that fails over shown figures marks them stale and a Burn sends no maxFuelTons', async () => {
    mocks.preview.mockResolvedValueOnce(QUOTE).mockRejectedValue(new Error('refresh failed'))
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(has('preview-fuel-ceiling'), 'GIVEN: a current quote carries a ceiling').toBe(true)

    await flush(PREVIEW_REFRESH_MS + 500)
    expect(has('preview-stale')).toBe(true)
    expect(has('preview-retry')).toBe(true)
    expect(has('preview-fuel-ceiling'), 'a stale figure never becomes a cap').toBe(false)
    expect(has('preview-deltav'), 'marked, not withdrawn').toBe(true)

    await click('burn-button')
    expect(mocks.order).toHaveBeenCalledTimes(1)
    expect('maxFuelTons' in orderRequest()).toBe(false)
  })

  // 3.12 (regression guard)
  it('Scenario: A burning fleet\'s re-target is previewed — (regression guard)', async () => {
    mount([burningFleet('fleet_1')])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(mocks.preview).toHaveBeenCalledWith('fleet_1', { bodyId: OTHER })
    expect(has('preview-deltav')).toBe(true)
    expect(burn().disabled).toBe(false)
    expect(previewCalls().length).toBe(1)
    await flush(PREVIEW_REFRESH_MS + 500)
    expect(previewCalls().length, 'one further call per interval').toBe(2)
  })

  // 3.13 (regression guard)
  it('Scenario: A cap rejection re-quotes in flow — (regression guard) through the real panel and hook', async () => {
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    const before = previewCalls().length
    mocks.order.mockRejectedValueOnce(CAP_ERROR)

    await click('burn-button')
    await flush(0)

    expect(mocks.order).toHaveBeenCalledTimes(1)
    expect(previewCalls().length, 'the re-quote request is sent').toBeGreaterThan(before)
    expect(burn().disabled, 'Burn stays available').toBe(false)
    expect(mocks.order, 'the order is not retried automatically').toHaveBeenCalledTimes(1)
  })

  // 3.14
  it('Scenario: A cap rejection landing while the preview is withheld re-quotes nothing — the selection moved to the acting fleet\'s own host', async () => {
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expect(has('preview-fuel-ceiling'), 'GIVEN: a current quote, so the commit carries a cap').toBe(true)

    const inFlight = deferred<unknown>()
    mocks.order.mockImplementationOnce(() => inFlight.promise)
    await click('burn-button')
    expect('maxFuelTons' in orderRequest(), 'the in-flight commit carries a cap').toBe(true)

    // The selection becomes the acting fleet's own host.
    await click(`mock-select-${HOST}`)
    expect(selection()).toBe(HOST)
    await flush(0)
    const hostCalls = () => previewCalls().filter((c) => (c[1] as { bodyId?: string }).bodyId === HOST)
    expect(hostCalls().length, 'no preview request for the fleet\'s own host').toBe(0)
    const before = previewCalls().length

    await act(async () => {
      inFlight.reject(CAP_ERROR)
    })
    await flush(0)

    expect(previewCalls().length, 'a cap rejection landing while withheld sends no preview request').toBe(before)
    expectNoFigures()
    expectNothingPresentedAsFailed()
  })

  // 3.15 (regression guard)
  it('Scenario: Quote changes are not announced — (regression guard) a preview appearing, refreshing and being withdrawn by deselecting', async () => {
    mount([attachedTo('fleet_1', undefined)])
    await flush(0)
    const announcer = () => screen.getByTestId('space-announcer').textContent
    const baseline = announcer()

    await click(`mock-select-${OTHER}`)
    expect(has('preview-deltav'), 'appeared').toBe(true)
    expect(announcer()).toBe(baseline)
    mocks.preview.mockResolvedValue(QUOTE_2)
    await flush(PREVIEW_REFRESH_MS + 500)
    expect(previewCalls().length, 'refreshed').toBeGreaterThan(1)
    expect(announcer()).toBe(baseline)
    await click(`mock-select-${OTHER}`) // re-picking the selection deselects it
    expect(has('preview-deltav'), 'withdrawn').toBe(false)
    expect(announcer()).toBe(baseline)
  })

  it('Scenario: Quote changes are not announced — (regression guard) a preview withdrawn by a mine becoming known; the landing announcement still fires', async () => {
    mount([attachedTo('fleet_1', HOST)])
    await flush(0)
    const announcer = () => screen.getByTestId('space-announcer').textContent
    const baseline = announcer()
    await click(`mock-select-${OTHER}`)
    expect(has('preview-deltav')).toBe(true)

    running.set('fleet_1', [mineAction('fleet_1', 20_000)])
    await refreshRunning('fleet_1')
    expect(has('mine-countdown'), 'the mine is now known').toBe(true)
    expect(announcer(), 'the withdrawal of the quote is not announced').toBe(baseline)

    await flush(25_000) // the mine's ETA passes
    // The existing landing announcement is raised when the view next sees a
    // changed own-fleets read; hand it a fresh array so it does.
    setFleets([attachedTo('fleet_1', HOST)])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    expect(announcer(), 'the existing landing announcement fires, and nothing about the quote').toBe('Mining run complete.')
  })
})

describe('SystemSpaceView — a resumed preview presents nothing from before the withholding (3.16)', () => {
  // The restoring request is held pending so the window between the
  // transition and the response is observable.
  async function armShown(fleets: Record<string, unknown>[], select: string) {
    mount(fleets)
    await flush(0)
    await click(`mock-select-${select}`)
    expect(has('preview-deltav'), 'GIVEN: a preview is shown').toBe(true)
    expect(has('preview-fuel-ceiling'), 'GIVEN: a current quote').toBe(true)
  }

  async function beginMine(etaOffsetMs: number) {
    running.set('fleet_1', [mineAction('fleet_1', etaOffsetMs)])
    await refreshRunning('fleet_1')
    expect(has('mine-countdown'), 'the mine is reported after the preview was shown').toBe(true)
    expectNoFigures() // withheld: nothing is shown while the mine holds the channel
  }

  async function expectNothingFromBefore(restoring: { promise: Promise<unknown> }, callsBefore: number) {
    expect(previewCalls().length, 'the restoring request was sent at the transition').toBe(callsBefore + 1)
    expectNoFigures()
    expect(has('preview-stale'), 'no stale marking from the earlier preview').toBe(false)
    expect(burn().disabled).toBe(false)

    // A Burn clicked in the window is submitted with no maxFuelTons.
    mocks.order.mockClear()
    await click('burn-button')
    expect(mocks.order).toHaveBeenCalledTimes(1)
    expect('maxFuelTons' in orderRequest(), 'no cap is derived from anything before the withholding').toBe(false)
    void restoring
  }

  it('Scenario: A resumed preview presents nothing from before the withholding — the mine ends by ETA', async () => {
    await armShown([attachedTo('fleet_1', HOST)], OTHER)
    await beginMine(15_000)
    const before = previewCalls().length

    const restoring = deferred<typeof QUOTE>()
    mocks.preview.mockImplementationOnce(() => restoring.promise)
    for (let step = 1; step <= 20 && burn().disabled; step++) await flush(1_000)
    expect(burn().disabled, 'the mine\'s ETA has passed').toBe(false)
    await expectNothingFromBefore(restoring, before)
  })

  it('Scenario: A resumed preview presents nothing from before the withholding — the mine ends by cancel through the real control', async () => {
    await armShown([attachedTo('fleet_1', HOST)], OTHER)
    await beginMine(600_000)
    const before = previewCalls().length

    const restoring = deferred<typeof QUOTE>()
    mocks.preview.mockImplementationOnce(() => restoring.promise)
    mocks.cancel.mockImplementation(async () => {
      running.set('fleet_1', [])
      return { ...mineAction('fleet_1', 600_000), status: 'cancelled' }
    })
    await click('mine-cancel')
    await flush(0)
    await expectNothingFromBefore(restoring, before)
  })

  it('Scenario: A resumed preview presents nothing from before the withholding — the fleet leaves its host', async () => {
    await armShown([attachedTo('fleet_1', undefined)], HOST)

    setFleets([attachedTo('fleet_1', HOST)])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    expectNoFigures() // withheld: the fleet is attached to the selected body
    const before = previewCalls().length

    const restoring = deferred<typeof QUOTE>()
    mocks.preview.mockImplementationOnce(() => restoring.promise)
    setFleets([attachedTo('fleet_1', undefined)])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    await expectNothingFromBefore(restoring, before)
  })

  it('Scenario: A failed restoring request is a no-quote state, not a stale one — the restoring request rejected', async () => {
    await armShown([attachedTo('fleet_1', HOST)], OTHER)
    await beginMine(600_000)
    const before = previewCalls().length

    const restoring = deferred<typeof QUOTE>()
    mocks.preview.mockImplementationOnce(() => restoring.promise)
    mocks.cancel.mockImplementation(async () => {
      running.set('fleet_1', [])
      return { ...mineAction('fleet_1', 600_000), status: 'cancelled' }
    })
    await click('mine-cancel')
    await flush(0)
    expect(previewCalls().length, 'the restoring request was sent at the transition').toBe(before + 1)

    await act(async () => {
      restoring.reject(new Error('restoring request failed'))
    })
    await flush(0)

    expect(has('preview-no-quote'), 'the no-quote state is shown').toBe(true)
    expect(has('preview-retry'), 'with a retry affordance').toBe(true)
    expect(has('preview-stale'), 'never a stale marking over figures from before the withholding').toBe(false)
    expectNoFigures()
  })
})

// ===========================================================================
// RED-PHASE SUITE — openspec change `add-burn-cost-overlay`, tasks 3.1-3.10.
// The view's lifetime rules for the fuel gauge's cost overlay, in this
// harness (own-fleets MOCKED: no read answers after a commit, so no test here
// commits a burn and then expects an overlay — those rows live in
// `SystemSpaceView.stranding-notice.test.tsx`).
//
// The overlay is derived from the view's ONE current-quote determination
// (`currentQuote`), supplied to the strip. Every test here selects through
// `mock-select-<id>` and sets its own preview answer first (the `beforeEach`
// default serves a 744 t quote against a 40 t capacity).
// ===========================================================================

const fuelRoster = (fuelTons = 80) => ({
  ships: [{ class: 'hauler' }],
  cargo: { fuel: fuelTons },
  cargoCapacity: 200,
  freeHold: 200 - fuelTons,
  miningRate: 1,
  estimatedRange: 5000,
  fuelPricePerTon: 5,
  stationKeepRateTonsPerSecond: 0.02,
})
const fuelFleet = (id: string, over: Record<string, unknown> = {}, fuelTons = 80) =>
  fleet(id, { roster: fuelRoster(fuelTons), ...over })
const quoteOf = (fuelCostTons: number, affordable = true) => ({ ...QUOTE, fuelCostTons, affordable })

const fuelGauge = () => screen.getByTestId('fuel-gauge')

function overlay() {
  const g = fuelGauge()
  const band = g.querySelector<HTMLElement>('[data-gauge-cost-extent]')
  const mark = g.querySelector<HTMLElement>('[data-gauge-cost-mark]')
  return {
    state: g.getAttribute('data-gauge-cost-state'),
    widthPct: band ? Number.parseFloat(band.style.width) : null,
    band,
    mark,
  }
}

// The fill: inline widths of the gauge root's children that are not the band.
function fillPct() {
  return Array.from(fuelGauge().children)
    .filter((el) => !el.hasAttribute('data-gauge-cost-extent') && (el as HTMLElement).style.width !== '')
    .reduce((sum, el) => sum + Number.parseFloat((el as HTMLElement).style.width), 0)
}

function expectOverlay(pct: number, state: 'affordable' | 'unaffordable', why: string) {
  const o = overlay()
  expect(o.state, `${why}: overlay state`).toBe(state)
  expect(o.band, `${why}: the extent is drawn`).not.toBeNull()
  expect(o.widthPct, `${why}: extent length`).toBeCloseTo(pct, 5)
  if (state === 'unaffordable') expect(o.mark, `${why}: the unaffordable mark`).not.toBeNull()
  else expect(o.mark, `${why}: no mark on an affordable quote`).toBeNull()
}

function expectNoOverlay(why: string) {
  const o = overlay()
  expect(o.band, `${why}: no extent`).toBeNull()
  expect(o.mark, `${why}: no mark`).toBeNull()
  expect(o.state, `${why}: no overlay state attribute`).toBeNull()
  // The overlay is withdrawn for the right reason, not because the gauge has no data.
  expect(fuelGauge().getAttribute('data-gauge-state'), `${why}: gauge still has data`).not.toBe('no-data')
}

describe('SystemSpaceView — burn cost overlay: current quote, no selection, pending and failed (3.1-3.3)', () => {
  // 3.1
  it('Scenario: A supplied quote draws one extent on the gauge\'s own scale — a current quote draws 15 % (3.1)', async () => {
    mocks.preview.mockResolvedValue(quoteOf(30))
    mount([fuelFleet('fleet_1')])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'affordable', 'a current quote')
    expect(fillPct()).toBeCloseTo(40, 5)
  })

  // 3.2
  it('Scenario: With no selection there is no overlay (3.2)', async () => {
    mocks.preview.mockResolvedValue(quoteOf(30))
    mount([fuelFleet('fleet_1')])
    await flush(0)
    expectNoOverlay('nothing selected')
    expect(fillPct()).toBeCloseTo(40, 5)

    // Positive control: selecting a target draws the overlay on this very view.
    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'affordable', 'control: a target is selected')
  })

  // 3.3
  it.each(['pending', 'failed'] as const)(
    'Scenario: A first preview still pending / A failed first preview draws no overlay (3.3) — %s',
    async (arm) => {
      const first = deferred<ReturnType<typeof quoteOf>>()
      if (arm === 'pending') mocks.preview.mockImplementationOnce(() => first.promise)
      else mocks.preview.mockRejectedValueOnce(new Error('first preview failed'))
      mount([fuelFleet('fleet_1')])
      await flush(0)
      await click(`mock-select-${OTHER}`)

      if (arm === 'pending') {
        expectNoOverlay('the first preview is pending')
        await act(async () => {
          first.resolve(quoteOf(30))
        })
        await flush(0)
      } else {
        expect(has('preview-no-quote'), 'GIVEN: the first preview failed').toBe(true)
        expectNoOverlay('the first preview failed')
        mocks.preview.mockResolvedValue(quoteOf(30))
        await click('preview-retry')
        await flush(0)
      }
      expectOverlay(15, 'affordable', 'control: the response landed')
    },
  )
})

describe('SystemSpaceView — burn cost overlay: the refresh walk (3.4)', () => {
  // 3.4
  it('Scenario: A refresh in flight never blanks the overlay / A failed refresh withdraws the overlay and nothing else / A refresh sent after a failure draws no overlay while it is pending / A later successful refresh restores the overlay at the new cost and state / The overlay is never drawn without the fuel ceiling (3.4)', async () => {
    const call2 = deferred<ReturnType<typeof quoteOf>>()
    const call4 = deferred<ReturnType<typeof quoteOf>>()
    mocks.preview
      .mockResolvedValueOnce(quoteOf(30))
      .mockImplementationOnce(() => call2.promise)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockImplementationOnce(() => call4.promise)

    mount([fuelFleet('fleet_1')])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'affordable', 'call 1 answered')
    expect(has('preview-fuel-ceiling'), 'GIVEN: the ceiling is present').toBe(true)
    const rangeBefore = screen.getByTestId('vitals-fuel-range').getAttribute('data-raw')

    // Watch the gauge root across the in-flight refresh and its answer.
    const root = fuelGauge()
    const records: MutationRecord[] = []
    const observer = new MutationObserver((rs) => records.push(...rs))
    observer.observe(root, { attributes: true, childList: true, subtree: true })

    // Call 2 in flight: the overlay stays at 15 %, same state.
    await flush(PREVIEW_REFRESH_MS)
    expect(previewCalls().length, 'call 2 is sent').toBe(2)
    expectOverlay(15, 'affordable', 'call 2 pending')
    // Call 2 answers 36 t: the extent moves to 18 % in one change.
    await act(async () => {
      call2.resolve(quoteOf(36))
    })
    await flush(0)
    expectOverlay(18, 'affordable', 'call 2 answered')
    records.push(...observer.takeRecords())
    observer.disconnect()
    expect(fuelGauge(), 'the gauge root is the same element throughout').toBe(root)
    const removedBand = records.some((r) =>
      Array.from(r.removedNodes).some((n) => n instanceof HTMLElement && n.hasAttribute('data-gauge-cost-extent')),
    )
    expect(removedBand, 'the extent is never removed across a refresh').toBe(false)
    const stateMutations = records.filter((r) => r.type === 'attributes' && r.attributeName === 'data-gauge-cost-state')
    expect(stateMutations, 'the state attribute is never touched across a refresh').toHaveLength(0)

    // Call 3 fails over the shown figures: overlay and ceiling withdrawn together.
    await flush(PREVIEW_REFRESH_MS)
    expect(has('preview-stale'), 'GIVEN: the refresh failed over shown figures').toBe(true)
    expectNoOverlay('call 3 failed')
    expect(has('preview-fuel-ceiling'), 'the ceiling is withdrawn with the overlay').toBe(false)
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '80')
    expect(screen.getByTestId('vitals-fuel-range').getAttribute('data-raw')).toBe(rangeBefore)
    expect(fillPct()).toBeCloseTo(40, 5)

    // Call 4 sent and unanswered: still no overlay, still no ceiling.
    await flush(PREVIEW_REFRESH_MS)
    expect(previewCalls().length, 'call 4 is sent').toBe(4)
    expectNoOverlay('call 4 pending')
    expect(has('preview-fuel-ceiling'), 'no ceiling while the refresh after a failure is pending').toBe(false)

    // Call 4 answers 45 t, flag false: restored at the new cost and state.
    await act(async () => {
      call4.resolve(quoteOf(45, false))
    })
    await flush(0)
    expectOverlay(22.5, 'unaffordable', 'call 4 answered')
    expect(has('preview-fuel-ceiling'), 'the ceiling returns with the overlay').toBe(true)
    expect(fillPct()).toBeCloseTo(40, 5)
  })
})

describe('SystemSpaceView — burn cost overlay: selection and acting fleet (3.5)', () => {
  // 3.5
  it('Scenario: Replacing the selection never shows the previous target\'s cost / The served flag is shown even when the cost exceeds the fuel aboard / Clearing the selection withdraws the overlay (3.5)', async () => {
    const forY = deferred<ReturnType<typeof quoteOf>>()
    mocks.preview.mockImplementation(async (_id: string, req: { bodyId?: string }) =>
      req.bodyId === STATION ? forY.promise : quoteOf(30),
    )
    mount([fuelFleet('fleet_1')])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'affordable', 'X answered')

    await click(`mock-select-${STATION}`)
    expect(selection()).toBe(STATION)
    expectNoOverlay('Y selected, its response pending')

    await act(async () => {
      forY.resolve(quoteOf(100, true))
    })
    await flush(0)
    // 100 t exceeds the 80 t aboard, yet the served flag (true) is shown.
    expectOverlay(50, 'affordable', 'Y answered')
    expect(fillPct()).toBeCloseTo(40, 5)

    await click(`mock-select-${STATION}`) // re-picking the selection deselects it
    expect(selection()).toBe('')
    expectNoOverlay('selection cleared')
  })
})

describe('SystemSpaceView — burn cost overlay: withheld previews (3.6-3.7)', () => {
  // 3.6
  it.each(['mine', 'transit', 'docked'] as const)(
    'Scenario: A withheld preview draws no overlay (3.6) — %s',
    async (arm) => {
      mocks.preview.mockResolvedValue(quoteOf(30))
      if (arm === 'mine') {
        mount([fuelFleet('fleet_1', { attachedTo: HOST })])
        await flush(0)
        await click(`mock-select-${OTHER}`)
        expectOverlay(15, 'affordable', 'GIVEN: an overlay before the mine')
        running.set('fleet_1', [mineAction('fleet_1', 600_000)])
        await refreshRunning('fleet_1')
        expect(has('mine-countdown'), 'the mine is reported').toBe(true)
      } else if (arm === 'transit') {
        mount([fuelFleet('fleet_1')])
        await flush(0)
        // Without the row click a fleet in transit drops out of `here` and the gauge reads no-data.
        await click('fleet-row-fleet_1')
        await click(`mock-select-${OTHER}`)
        expectOverlay(15, 'affordable', 'GIVEN: an overlay before the jump')
        setFleets([
          fuelFleet('fleet_1', {
            jump: { laneId: 'lane_-7_17_-6_16', destSystemId: 'sys_-6_16', departMs: T0, arriveMs: T0 + 600_000 },
          }),
        ])
        await act(async () => {
          rerenderView()
        })
        await flush(0)
      } else {
        mount([fuelFleet('fleet_1')])
        await flush(0)
        await click(`mock-select-${HOST}`)
        expectOverlay(15, 'affordable', 'GIVEN: an overlay before docking')
        setFleets([fuelFleet('fleet_1', { attachedTo: HOST })])
        await act(async () => {
          rerenderView()
        })
        await flush(0)
      }
      expectNoOverlay(`withheld: ${arm}`)
    },
  )

  // 3.7
  it('Scenario: A resumed preview draws no overlay until its restoring response lands — the mine row (3.7)', async () => {
    mocks.preview.mockResolvedValue(quoteOf(60))
    mount([fuelFleet('fleet_1', { attachedTo: HOST })])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expectOverlay(30, 'affordable', 'GIVEN: an overlay at 60 t')

    running.set('fleet_1', [mineAction('fleet_1', 600_000)])
    await refreshRunning('fleet_1')
    expect(has('mine-countdown'), 'the mine is reported').toBe(true)

    const restoring = deferred<ReturnType<typeof quoteOf>>()
    mocks.preview.mockImplementationOnce(() => restoring.promise)
    mocks.cancel.mockImplementation(async () => {
      running.set('fleet_1', [])
      return { ...mineAction('fleet_1', 600_000), status: 'cancelled' }
    })
    await click('mine-cancel')
    await flush(0)
    expectNoOverlay('the restoring call is pending')

    await act(async () => {
      restoring.resolve(quoteOf(30))
    })
    await flush(0)
    // Drawn from the restoring response alone: 15 %, never the old 30 %.
    expectOverlay(15, 'affordable', 'the restoring response landed')
  })
})

describe('SystemSpaceView — burn cost overlay: affordability as text, silence, lag (3.8-3.10)', () => {
  // 3.8
  it.each([true, false])(
    'Scenario: A drawn extent is always accompanied by the quote\'s affordability as text (3.8) — flag %s',
    async (affordable) => {
      mocks.preview.mockResolvedValue(quoteOf(30, affordable))
      mount([fuelFleet('fleet_1')])
      await flush(0)
      await click(`mock-select-${OTHER}`)
      expectOverlay(15, affordable ? 'affordable' : 'unaffordable', 'the overlay is drawn')
      const text = screen.getByTestId('preview-affordable')
      expect((text.textContent ?? '').trim()).not.toBe('')
      const state = overlay().state
      expect(text.getAttribute('data-affordable') === 'true').toBe(state === 'affordable')
      expect(/not affordable/i.test(text.textContent ?? '')).toBe(state === 'unaffordable')
    },
  )

  // 3.9
  it('Scenario: The overlay is silent and costs no request (3.9)', async () => {
    mocks.preview.mockResolvedValueOnce(quoteOf(30)).mockResolvedValue(quoteOf(36))
    mount([fuelFleet('fleet_1')])
    await flush(0)
    const announcer = () => screen.getByTestId('space-announcer').textContent
    const balance = () => screen.getByTestId('balance-live-region').textContent
    const announcerBaseline = announcer()
    const balanceBaseline = balance()

    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'affordable', 'appeared')
    expect(announcer()).toBe(announcerBaseline)
    expect(balance()).toBe(balanceBaseline)
    expect(previewCalls().length, 'the selection sent one request').toBe(1)

    await flush(PREVIEW_REFRESH_MS)
    expectOverlay(18, 'affordable', 'changed')
    expect(announcer()).toBe(announcerBaseline)
    expect(balance()).toBe(balanceBaseline)
    expect(previewCalls().length, 'one interval sent one request').toBe(2)

    await click(`mock-select-${OTHER}`) // deselect
    expectNoOverlay('withdrawn')
    expect(announcer()).toBe(announcerBaseline)
    expect(balance()).toBe(balanceBaseline)
    await flush(0)
    expect(previewCalls().length, 'drawing and withdrawing the overlay added no request').toBe(2)
  })

  // 3.10
  it('Scenario: The fill can move before the overlay does (3.10)', async () => {
    mocks.preview.mockResolvedValue(quoteOf(30, false))
    mount([fuelFleet('fleet_1', {}, 20)])
    await flush(0)
    await click(`mock-select-${OTHER}`)
    expectOverlay(15, 'unaffordable', '20 t aboard, 30 t quote')
    expect(fillPct()).toBeCloseTo(10, 5)
    const calls = previewCalls().length

    setFleets([fuelFleet('fleet_1')])
    await act(async () => {
      rerenderView()
    })
    await flush(0)
    expect(fillPct(), 'the fill moved with the own-fleets read').toBeCloseTo(40, 5)
    expectOverlay(15, 'unaffordable', 'the overlay has not moved yet')
    expect(previewCalls().length, 'the own-fleets read sent no preview request').toBe(calls)

    mocks.preview.mockResolvedValue(quoteOf(30, true))
    await flush(PREVIEW_REFRESH_MS)
    expect(previewCalls().length, 'exactly one request within one refresh interval').toBe(calls + 1)
    expectOverlay(15, 'affordable', 'the next response landed')
  })
})


describe('compact production travel', () => {
  const ready = (id = 'fleet_1') => { const f = fleet(id); return { ...f, roster: { ...f.roster, cargo: { fuel: 1000 } } } }
  it('reviews a point without an order, commits only explicitly with quoted cap, and guards same-tick activation', async () => {
    const submitted = deferred<ReturnType<typeof burningFleet>>()
    mocks.order.mockReturnValueOnce(submitted.promise)
    mount([ready()]); await flush()
    await click('mock-select-point'); await click('travel-review-entry')
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Point in space')
    expect(screen.getByTestId('travel-start')).toBeEnabled()
    expect(mocks.order).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByTestId('travel-start')); fireEvent.click(screen.getByTestId('travel-start')) })
    expect(mocks.order).toHaveBeenCalledTimes(1)
    expect(orderRequest()).toEqual({ point: { X: 30, Y: 0, Z: -10 }, maxFuelTons: QUOTE.fuelCostTons * 1.1 })
    await act(async () => submitted.resolve(burningFleet('fleet_1'))); await flush()
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Travelling')
    expect(screen.getByTestId('travel-stop')).toBeVisible()
    await click('travel-stop')
    expect(mocks.stop).toHaveBeenCalledWith('fleet_1')
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Ready')
  })
  it('keeps unaffordable travel reviewable and prevents starting from stale estimates', async () => {
    mocks.preview.mockResolvedValueOnce({ ...QUOTE, affordable: false, fuelCostTons: 1200 })
    mount([ready()]); await flush(); await click('mock-select-point'); await click('travel-review-entry')
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Fuel shortfall')
    expect(screen.getByTestId('travel-start')).toBeDisabled()
    mocks.preview.mockRejectedValue(new Error('offline'))
    await flush(PREVIEW_REFRESH_MS)
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('out of date')
    expect(screen.getByTestId('travel-start')).toBeDisabled()
    expect(mocks.order).not.toHaveBeenCalled()
  })
  it('switches fleet without losing point target and cannot commit the prior fleet quote', async () => {
    const replacement = deferred<typeof QUOTE>()
    mocks.preview.mockImplementation((id: string) => id === 'fleet_b' ? replacement.promise : Promise.resolve(QUOTE))
    mount([ready(), ready('fleet_b')]); await flush(); await click('mock-select-point'); await click('travel-review-entry')
    fireEvent.change(screen.getByLabelText('Travel command fleet'), { target: { value: 'fleet_b' } }); await flush()
    expect(selection()).toBe('point')
    expect(screen.getByTestId('travel-start')).toBeDisabled()
    expect(screen.getByTestId('compact-travel-card')).not.toHaveTextContent('Fuel cost')
    await act(async () => replacement.resolve(QUOTE_2)); await flush()
    expect(screen.getByTestId('travel-start')).toBeEnabled()
    await click('travel-start')
    expect(mocks.order.mock.calls[0][0]).toBe('fleet_b')
    expect(orderRequest().maxFuelTons).toBeCloseTo(QUOTE_2.fuelCostTons * 1.1)
  })
  it('replaces body inspection and returns Back to the retained browse context without an order', async () => {
    mount([ready()]); await flush()
    await click('system-index-toggle')
    fireEvent.change(screen.getByTestId('system-index-search'), { target: { value: 'rocky' } })
    await click(`index-${OTHER}`); await click('details-plot')
    expect(screen.getByTestId('compact-travel-card')).toBeVisible()
    expect(screen.getByTestId('system-index-search')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ })); await flush()
    expect(screen.queryByTestId('compact-travel-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('system-index-search')).toHaveValue('rocky')
    expect(screen.getByTestId('details-plot')).toBeVisible()
    expect(mocks.order).not.toHaveBeenCalled()
  })
  it('keeps a failed commitment in review with actionable feedback' , async () => {
    mocks.order.mockRejectedValue(CAP_ERROR)
    mount([ready()]); await flush(); await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
    expect(screen.getByTestId('travel-start')).toBeInTheDocument()
    expect(screen.queryByTestId('travel-stop')).not.toBeInTheDocument()
    expect(screen.getByTestId('compact-travel-card').querySelector('[role="alert"]')).not.toBeNull()
  })
})

it('retains the accepted travel response when status is closed and reopened before the fleet read catches up', async () => {
  const ready = fleet('fleet_1')
  mount([{ ...ready, roster: { ...ready.roster, cargo: { fuel: 1000 } } }]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  expect(screen.getByTestId('travel-stop')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Close travel card' })); await flush()
  expect(mocks.stop).not.toHaveBeenCalled()
  await click('travel-status-entry')
  expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Travelling')
  expect(screen.getByTestId('travel-stop')).toBeEnabled()
})


it('keeps the accepted status for a same-fleet selection but never applies it to another command fleet', async () => {
  const ready = fleet('fleet_1'), other = fleet('fleet_b')
  mount([{ ...ready, roster: { ...ready.roster, cargo: { fuel: 1000 } } }, other]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  await click('vitals-fleet-chevron'); await click('vitals-fleet-menu-item-fleet_1')
  expect(screen.getByTestId('travel-stop')).toBeVisible()
  await click('vitals-fleet-chevron'); await click('vitals-fleet-menu-item-fleet_b')
  expect(screen.queryByTestId('travel-stop')).not.toBeInTheDocument()
  expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('leet_bReady')
  expect(mocks.stop).not.toHaveBeenCalled()
})

it('guards duplicate Stop while pending and preserves the running status after a rejected Stop', async () => {
  const stopped = deferred<ReturnType<typeof fleet>>()
  mocks.stop.mockReturnValueOnce(stopped.promise)
  mount([burningFleet('fleet_1')]); await flush(); await click('travel-status-entry')
  await act(async () => { fireEvent.click(screen.getByTestId('travel-stop')); fireEvent.click(screen.getByTestId('travel-stop')) })
  expect(mocks.stop).toHaveBeenCalledTimes(1)
  await act(async () => stopped.reject(new Error('offline'))); await flush()
  expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Travelling')
  expect(screen.getByTestId('compact-travel-card').querySelector('[role="alert"]')).not.toBeNull()
  expect(screen.getByTestId('travel-stop')).toBeEnabled()
  await click('travel-stop')
  expect(mocks.stop).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Ready')
})

it('replaces the retained acceptance response with the next served fleet read', async () => {
  const ready = fleet('fleet_1')
  mount([{ ...ready, roster: { ...ready.roster, cargo: { fuel: 1000 } } }]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  fireEvent.click(screen.getByRole('button', { name: 'Close travel card' })); await flush()
  const arrived = attachedTo('fleet_1', STATION)
  await act(async () => { qc.setQueryData(queryKeys.fleets.mine(), [arrived]); setFleets([arrived]); rerenderView() }); await flush()
  await click('travel-status-entry')
  expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Ready')
  expect(screen.queryByTestId('travel-stop')).not.toBeInTheDocument()
})
