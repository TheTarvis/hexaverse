import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { within, render as rtlRender, screen, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Live travel integration through Objects after retiring the Course/telemetry UI.
// Service mutations, preview quotes and action reads are real hooks over mocked
// service responses; the renderer is the only substituted presentation boundary.

const mocks = vi.hoisted(() => ({
  useSystemSpace: vi.fn(),
  useMyFleets: vi.fn(),
  push: vi.fn(),
  preview: vi.fn(),
  miningOptions: vi.fn(),
  getFleet: vi.fn(),
  getAction: vi.fn(),
  subscribe: vi.fn(),
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
    miningOptions: (...a: unknown[]) => mocks.miningOptions(...a),
    get: (...a: unknown[]) => mocks.getFleet(...a),
    preview: (...a: unknown[]) => mocks.preview(...a),
    order: (...a: unknown[]) => mocks.order(...a),
    stop: (...a: unknown[]) => mocks.stop(...a),
    mine: (...a: unknown[]) => mocks.mine(...a),
    scanTargets: (...a: unknown[]) => mocks.scanTargets(...a),
    scan: (...a: unknown[]) => mocks.scan(...a),
  },
  actionService: {
    get: (...a: unknown[]) => mocks.getAction(...a),
    subscribe: (...a: unknown[]) => mocks.subscribe(...a),
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
      ReactMod.createElement('button', { key: 'activate-fleet_1', type: 'button', 'data-testid': 'mock-activate-fleet_1', onClick: () => props.onActivateFleet?.('fleet_1') }),
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

vi.mock('./SpacecraftPreview', () => ({ SpacecraftPreview: () => <div data-testid="mining-preview" /> }))

import { SystemSpaceView } from './SystemSpaceView'
import { PREVIEW_REFRESH_MS } from '@/lib/realtime'
import { queryKeys } from '@/lib/query-keys'

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'
const HOST = 'feat-body-0' // the mineable body the fleet is docked at
const OTHER = 'feat-body-1'
const STATION = 'feat-station'
const GATE = 'gate-sys_-6_16'

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
const selection = () => screen.getByTestId('space-canvas-region').getAttribute('data-selection')

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
  mocks.mine.mockResolvedValue({ actionId: 'act_mine_fleet_1', eta: T0 + 600_000, worldTime: T0 })
  mocks.miningOptions.mockResolvedValue({ eligible: true, featureId: HOST, commitFeatureId: HOST, freeHold: 40, miningRate: 1, minRunTons: 1, resources: [{ kind: 'metals', remainingTons: 100 }], worldTime: T0 })
  mocks.getFleet.mockResolvedValue(attachedTo('fleet_1', HOST))
  mocks.getAction.mockResolvedValue({ id: 'act_mine_fleet_1', actor: 'fleet_1', type: 'mine', scope: SYSTEM_ID, status: 'running', committedAt: T0, eta: T0 + 600_000, worldTime: T0, params: { featureId: HOST, kind: 'metals', tons: 12 } })
  mocks.subscribe.mockReturnValue(() => {})
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

describe('compact production travel', () => {
  const ready = (id = 'fleet_1') => { const f = fleet(id); return { ...f, roster: { ...f.roster, cargo: { fuel: 1000 } } } }
  it('reviews a point without an order, commits only explicitly with quoted cap, and guards same-tick activation', async () => {
    const submitted = deferred<ReturnType<typeof burningFleet>>()
    mocks.order.mockReturnValueOnce(submitted.promise)
    mount([ready()]); await flush()
    await click('mock-select-point'); await click('travel-review-entry')
    expect(screen.getByTestId('compact-travel-card')).toHaveTextContent('Point in space')
    expect(screen.getByRole('heading', { name: / · Travel to Point in space$/ })).toHaveAttribute('data-slot', 'hud-title')
    expect(screen.getByTestId('travel-start')).toBeEnabled()
    const startFooter = screen.getByTestId('travel-start').closest('[data-slot="hud-footer"]')!
    expect(startFooter).not.toBeNull()
    expect(startFooter.closest('[data-hud-framing]')).toHaveAttribute('data-hud-framing', 'frame')
    expect(mocks.order).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByTestId('travel-start')); fireEvent.click(screen.getByTestId('travel-start')) })
    expect(mocks.order).toHaveBeenCalledTimes(1)
    expect(orderRequest()).toEqual({ point: { X: 30, Y: 0, Z: -10 }, maxFuelTons: QUOTE.fuelCostTons * 1.1 })
    await act(async () => submitted.resolve(burningFleet('fleet_1'))); await flush()
    expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Under way')
    expect(screen.getByTestId('travel-stop')).toBeVisible()
    expect(screen.getByTestId('travel-stop').closest('[data-slot="hud-footer"]')).not.toBe(startFooter)
    expect(screen.getByTestId('travel-stop').closest('[data-panel]')).toHaveAttribute('data-panel', 'fleet-status')
    await click('travel-stop')
    expect(mocks.stop).toHaveBeenCalledWith('fleet_1')
    expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('On station')
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
    fireEvent.click(screen.getByRole('button', { name: 'Change fleet' }))
    expect(screen.queryByTestId('travel-start')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Fleet fleet_b/ })); await flush()
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
    fireEvent.change(screen.getByTestId('system-index-search'), { target: { value: 'rocky' } })
    await click(`index-${OTHER}`); await click('details-plot')
    expect(screen.getByTestId('compact-travel-card')).toBeVisible()
    expect(screen.getByTestId('system-index-search')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to objects' })); await flush()
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
  fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name: 'Fleet status' })); await flush()
  expect(mocks.stop).not.toHaveBeenCalled()
  await click('travel-status-entry')
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Under way')
  expect(screen.getByTestId('travel-stop')).toBeEnabled()
})


it('keeps command-fleet travel status when canvas activation inspects either fleet', async () => {
  const ready = fleet('fleet_1'), other = fleet('fleet_b')
  mount([{ ...ready, roster: { ...ready.roster, cargo: { fuel: 1000 } } }, other]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  await click('mock-activate-fleet_1')
  expect(screen.getByTestId('travel-stop')).toBeVisible()
  await click('mock-activate-fleet_b')
  expect(screen.getByTestId('travel-stop')).toBeVisible()
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('leet_1')
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Under way')
  expect(mocks.stop).not.toHaveBeenCalled()
})

it('guards duplicate Stop while pending and preserves the running status after a rejected Stop', async () => {
  const stopped = deferred<ReturnType<typeof fleet>>()
  mocks.stop.mockReturnValueOnce(stopped.promise)
  mount([burningFleet('fleet_1')]); await flush(); await click('travel-status-entry')
  await act(async () => { fireEvent.click(screen.getByTestId('travel-stop')); fireEvent.click(screen.getByTestId('travel-stop')) })
  expect(mocks.stop).toHaveBeenCalledTimes(1)
  await act(async () => stopped.reject(new Error('offline'))); await flush()
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Under way')
  expect(screen.getByTestId('fleet-status-card').querySelector('[role="alert"]')).not.toBeNull()
  expect(screen.getByTestId('travel-stop')).toBeEnabled()
  await click('travel-stop')
  expect(mocks.stop).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('On station')
})

it('replaces the retained acceptance response with the next served fleet read', async () => {
  const ready = fleet('fleet_1')
  mount([{ ...ready, roster: { ...ready.roster, cargo: { fuel: 1000 } } }]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name: 'Fleet status' })); await flush()
  const arrived = attachedTo('fleet_1', STATION)
  await act(async () => { qc.setQueryData(queryKeys.fleets.mine(), [arrived]); setFleets([arrived]); rerenderView() }); await flush()
  await click('travel-status-entry')
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Docked')
  expect(screen.queryByTestId('travel-stop')).not.toBeInTheDocument()
})


it('keeps an accepted stranding warning through dismissal and lets a fresh served fleet supersede it', async () => {
  mocks.order.mockResolvedValueOnce({ ...burningFleet('fleet_1'), strandingWarning: true })
  const initial = fleet('fleet_1')
  mount([{ ...initial, roster: { ...initial.roster, cargo: { fuel: 1000 } } }]); await flush()
  await click('mock-select-point'); await click('travel-review-entry'); await click('travel-start')
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('unable to reach a station or lane gate')
  fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name: 'Fleet status' })); await flush()
  await click('travel-status-entry')
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('unable to reach a station or lane gate')
  const fresh = burningFleet('fleet_1')
  await act(async () => { qc.setQueryData(queryKeys.fleets.mine(), [fresh]); setFleets([fresh]); rerenderView() }); await flush()
  expect(screen.getByTestId('fleet-status-card')).not.toHaveTextContent('unable to reach a station or lane gate')
})

it.each([
  ['fleet: burn origin is at or inside the star-clearance radius', 'This fleet is too close to the star'],
  ['fleet: burn destination is at or inside the star-clearance radius', 'That destination is too close to the star'],
])('shows the served Stop refusal in live travel status: %s', async (reason, message) => {
  mocks.stop.mockRejectedValueOnce(Object.assign(new Error('rejected'), { data: { error: reason } }))
  mount([burningFleet('fleet_1')]); await flush(); await click('travel-status-entry'); await click('travel-stop')
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.getByTestId('travel-stop')).toBeEnabled()
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Under way')
})

it('keeps Fleet Status disclosures and Objects search independent through hiding and reopening', async () => {
  const owned = fleet('fleet_1')
  mount([{ ...owned, roster: { ...owned.roster, ships: [{ class: 'seed' }, { class: 'seed' }], cargo: { fuel: 12, iron: 7 }, cargoCapacity: 40, freeHold: 21 } }]); await flush()
  const search = screen.getByTestId('system-index-search')
  fireEvent.change(search, { target: { value: 'rocky' } })
  fireEvent.click(screen.getByRole('button', { name: /^Cargo · / }))
  fireEvent.click(screen.getByRole('button', { name: 'Ships · 2' }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name: 'Fleet status' }))
  expect(search).toHaveValue('rocky')
  expect(screen.queryByRole('button', { name: /^Cargo · / })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Fleet status (hidden)' }))
  expect(screen.getByRole('button', { name: /^Cargo · / })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Ships · 2' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Fuel (in hold)')).toBeVisible()
  expect(search).toHaveValue('rocky')
  expect(mocks.order).not.toHaveBeenCalled()
  expect(mocks.stop).not.toHaveBeenCalled()
})

it('refreshes missing fleet readings without querying actions for a missing actor', async () => {
  mount([]); await flush()
  expect(screen.getByTestId('fleet-status-card')).toHaveTextContent('Choose an owned fleet')
  const beforeRunning = mocks.listRunning.mock.calls.length
  const beforeSettled = mocks.listSettled.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Refresh fleets' })); await flush()
  expect(mocks.listRunning).toHaveBeenCalledTimes(beforeRunning)
  expect(mocks.listSettled).toHaveBeenCalledTimes(beforeSettled)
  expect(mocks.order).not.toHaveBeenCalled()
})


it('uses the merged mining card from fleet status, preserves a hidden draft, and confirms the exact result', async () => {
  mount([attachedTo('fleet_1', HOST)]); await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Mine' })); await flush()
  expect(screen.queryByRole('group', { name: 'Secondary presets' })).toBeNull()
  fireEvent.click(within(screen.getByRole('region', { name: 'Fleet status panel' })).getByRole('button', { name: /feat-body-0 rocky/ })); await flush()
  const quantity = screen.getByRole('spinbutton', { name: 'Quantity in tonnes' })
  fireEvent.change(quantity, { target: { value: '12' } })
  const navigation = within(screen.getByRole('navigation', { name: 'HUD panels' }))
  fireEvent.click(navigation.getByRole('button', { name: 'Fleet status' }))
  fireEvent.click(screen.getByRole('button', { name: 'Fleet status (hidden)' }))
  expect(screen.getByRole('spinbutton', { name: 'Quantity in tonnes' })).toHaveValue(12)
  const start = screen.getByRole('button', { name: 'Start mining' })
  fireEvent.click(start); fireEvent.click(start); await flush()
  expect(mocks.mine).toHaveBeenCalledExactlyOnceWith('fleet_1', { featureId: HOST, kind: 'metals', tons: 12 })
  expect(screen.getByText('Mining in progress')).toBeVisible()
  expect(mocks.order).not.toHaveBeenCalled()
  mocks.getAction.mockResolvedValue({ id: 'act_mine_fleet_1', actor: 'fleet_1', type: 'mine', scope: SYSTEM_ID, status: 'done', reasonCode: 'holdFull', committedAt: T0, eta: T0 + 600_000, worldTime: T0 + 600_000, params: { kind: 'metals', tons: 12 }, outcome: 'hold full at 9 tons of metals' })
  await act(async () => { mocks.subscribe.mock.calls[0][1]({ actionId: 'act_mine_fleet_1' }) }); await flush()
  expect(screen.getByText('The fleet’s hold is full.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Cancel mining' })).toBeNull()
})

it('uses resource-first mining search with only local owned attached eligible fleets', async () => {
  mocks.miningOptions.mockImplementation((id: string) => Promise.resolve({ eligible: id === 'fleet_1', featureId: HOST, commitFeatureId: HOST, freeHold: 40, miningRate: 1, minRunTons: 1, resources: [{ kind: 'metals', remainingTons: 100 }], worldTime: T0 }))
  mount([attachedTo('fleet_1', HOST), attachedTo('fleet_b', HOST), fleet('remote', { attachedTo: HOST, systemId: 'elsewhere' }), fleet('foreign', { attachedTo: HOST, own: false })]); await flush()
  fireEvent.click(screen.getByTestId(`index-${HOST}`)); await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Mine here' })); await flush()
  expect(screen.queryByRole('button', { name: /Fleet fleet_b Owned fleet/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Fleet remote Owned fleet/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Fleet foreign Owned fleet/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Fleet fleet_1 Owned fleet/ })); await flush()
  expect(screen.getByRole('button', { name: 'Start mining' })).toBeEnabled()
  expect(screen.getByRole('spinbutton', { name: 'Quantity in tonnes' })).toHaveValue(40)
  expect(mocks.mine).not.toHaveBeenCalled()
})

it('returns directly from shared destination search to a refreshed travel review', async () => {
  mount([fleet('fleet_1', { roster: { ...fleet('fleet_1').roster, cargo: { fuel: 1000 } } })]); await flush(); await click('mock-select-point'); await click('travel-review-entry')
  fireEvent.click(screen.getByRole('button', { name: 'Change destination' })); await flush()
  const searches = screen.getAllByRole('searchbox', { name: 'Find an object' })
  fireEvent.change(searches[0], { target: { value: 'metals' } })
  fireEvent.click(screen.getByRole('button', { name: /feat-body-0 rocky/ })); await flush()
  expect(selection()).toBe(HOST)
  expect(screen.getByTestId('compact-travel-card')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Start travel' })).toBeEnabled()
  expect(mocks.order).not.toHaveBeenCalled()
})

it('hydrates an owned Galaxy travel intent into destination search without issuing an order', async () => {
  window.history.replaceState(null, '', `/?task=travel&fleet=fleet_1`)
  try {
    mount([attachedTo('fleet_1', HOST)]); await flush()
    expect(screen.getByRole('searchbox', { name: 'Find an object' })).toBeVisible()
    expect(screen.queryByTestId('travel-start')).toBeNull()
    expect(mocks.order).not.toHaveBeenCalled()
  } finally { window.history.replaceState(null, '', '/') }
})
