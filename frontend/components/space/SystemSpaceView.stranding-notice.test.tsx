import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, act, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE SUITE — openspec change `surface-commit-stranding-warning`,
// capability `system-space-view`: the ADDED requirement *A Burn Commit's
// Stranding Warning Is Surfaced on the Command Surface* (tasks.md sections 2
// and 3; impl contract `docs/handoffs/surface-commit-stranding-warning-impl-
// contract.md` §6, §7).
//
// SECTION 2 (hygiene, green when written): the harness below plus one smoke
// test. SECTION 3 (red until 4.2/4.3): one describe per task, each titled
// `Scenario: <name, verbatim> — <arm>` with the task number in a comment.
//
// WHAT IS REAL. `SystemSpaceView`, `SpaceCommandPanel`, `FleetActionsPanel`,
// `FleetRoster`, `ScanControl`, `VitalsStrip` and ALL of `@/hooks/use-fleets`
// (`useMyFleets`, `useOrder`, `useCutDrive`, `useStop`) — there is NO
// `vi.mock('@/hooks/use-fleets')` in this file: the gap rule is about the
// ordering of the real own-fleets read against the real commit's
// invalidation, which a hand-set fleets mock cannot observe. Also real:
// `@/hooks/use-burn-preview`, `@/hooks/use-actions`, `@/hooks/use-scan`.
//
// WHAT IS MOCKED. The service boundary (`fleetService`, `actionService`) and,
// as the `SystemSpaceView*` family does, the interior read, sightings, market,
// galaxy, providers, the router and the stage.
//
// SETTLING. `listMine`, `order`, `cutDrive` and `stop` each return a promise
// the test settles BY CALL INDEX; nothing resolves on its own. A read that is
// not a mutation's is caused only by `reconnect()`, `poll()`, a time advance
// past a burn's arrival, or a click on `space-fleets-retry` — never by calling
// the query client (design Decision 11). After a trigger the test asserts
// `listMine` gained a call BEFORE answering it, and every test asserts its
// `settled` log before its closing assertion.

const mocks = vi.hoisted(() => ({
  useSystemSpace: vi.fn(),
  push: vi.fn(),
  listMine: vi.fn(),
  order: vi.fn(),
  cutDrive: vi.fn(),
  stop: vi.fn(),
  preview: vi.fn(),
  mine: vi.fn(),
  scanTargets: vi.fn(),
  scan: vi.fn(),
  jump: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
  listRunning: vi.fn(),
  cancel: vi.fn(),
  listSettled: vi.fn(),
  acknowledge: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/services', () => ({
  fleetService: {
    listMine: (...a: unknown[]) => mocks.listMine(...a),
    order: (...a: unknown[]) => mocks.order(...a),
    cutDrive: (...a: unknown[]) => mocks.cutDrive(...a),
    stop: (...a: unknown[]) => mocks.stop(...a),
    preview: (...a: unknown[]) => mocks.preview(...a),
    mine: (...a: unknown[]) => mocks.mine(...a),
    scanTargets: (...a: unknown[]) => mocks.scanTargets(...a),
    scan: (...a: unknown[]) => mocks.scan(...a),
    jump: (...a: unknown[]) => mocks.jump(...a),
    hold: (...a: unknown[]) => mocks.hold(...a),
    release: (...a: unknown[]) => mocks.release(...a),
  },
  actionService: {
    listRunning: (...a: unknown[]) => mocks.listRunning(...a),
    cancel: (...a: unknown[]) => mocks.cancel(...a),
    listSettled: (...a: unknown[]) => mocks.listSettled(...a),
    acknowledge: (...a: unknown[]) => mocks.acknowledge(...a),
  },
}))

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

// The stage, at its seam: the selection as `data-selection` and one trigger
// per target the tests pick.
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
      trigger('point', { point: { x: 30, y: 0, z: -10 } }),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'
import { BOARD_POLL_MS, PREVIEW_REFRESH_MS } from '@/lib/realtime'
import { toast } from '@/lib/toast'

// --- constants and fixtures -------------------------------------------------

const W0 = 1000
const SYSTEM_ID = 'sys_-7_17'
const OTHER = 'feat-body-1' // the committed target
const HOST = 'feat-body-0' // "a different body"

const NOTICE_COPY =
  'Your current course leaves this fleet unable to reach any station or lane gate. Place a different order to change it.'

const INTERIOR = {
  systemId: SYSTEM_ID,
  extent: 658.7,
  character: 'normal',
  starClass: 'M',
  worldTime: W0,
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
  ],
  laneGates: [],
  contacts: [],
}

// ONE stable object for the whole file: `resync` depends on `interior.refetch`,
// and a new function per render re-arms the poll interval on every coarse tick
// so the poll then never fires (contract §6.1).
const interiorRefetch = vi.fn()
const INTERIOR_RESULT = { data: INTERIOR, isLoading: false, isError: false, error: null, refetch: interiorRefetch }

const PARK = {
  Kind: 0,
  BodyId: 'feat-star',
  Radius: 4,
  PeriodMs: 6000,
  Phase: 0,
  EpochMs: W0,
  Offset: { X: 0, Y: 0, Z: 0 },
  Point: { X: 0, Y: 0, Z: 0 },
}
const POINT = { X: 30, Y: 0, Z: -10 }

type FleetFixture = Record<string, unknown> & { id: string; roster: Record<string, unknown> }

function fleetOf(id: string, state: Record<string, unknown>, attachedTo?: string): FleetFixture {
  return {
    id,
    corporationId: 'corp-1',
    systemId: SYSTEM_ID,
    own: true,
    worldTime: W0,
    scale: 1,
    position: { X: 5, Y: 0, Z: 0 },
    ...(attachedTo !== undefined ? { attachedTo } : {}),
    state,
    roster: {
      ships: [{ class: 'hauler' }],
      cargo: {},
      cargoCapacity: 40,
      freeHold: 40,
      miningRate: 1,
      fuelPricePerTon: 5,
      stationKeepRateTonsPerSecond: 0.02,
    },
  }
}

const parked = (id: string) => fleetOf(id, { Mode: 1, Burn: null, Drift: null, Park: PARK })
const attached = (id: string, bodyId: string) =>
  fleetOf(id, { Mode: 1, Burn: null, Drift: null, Park: { ...PARK, BodyId: bodyId } }, bodyId)
const pointParked = (id: string) =>
  fleetOf(id, { Mode: 1, Burn: null, Drift: null, Park: { ...PARK, Kind: 2, BodyId: '', Point: POINT } })

function burnState(departMs: number, arriveMs: number, target: Record<string, unknown>) {
  return {
    Mode: 0,
    Park: null,
    Drift: null,
    Burn: {
      Origin: { X: 0, Y: 0, Z: 0 },
      Target: target,
      Intercept: { X: 18, Y: -3, Z: -15 },
      Curve: [],
      Length: 1,
      DepartMs: departMs,
      ArriveMs: arriveMs,
      Accel: 1,
      InsertionPhase: 0,
    },
  }
}
const burning = (id: string, departMs: number, arriveMs: number, targetBodyId = OTHER) =>
  fleetOf(id, burnState(departMs, arriveMs, { BodyId: targetBodyId, Point: null }))
const burningToPoint = (id: string, departMs: number, arriveMs: number) =>
  fleetOf(id, burnState(departMs, arriveMs, { BodyId: '', Point: POINT }))
const drifting = (id: string) =>
  fleetOf(id, {
    Mode: 2,
    Burn: null,
    Park: null,
    Drift: { Anchor: { X: 1, Y: 0, Z: 0 }, Velocity: { X: 0.1, Y: 0, Z: 0 }, EpochMs: W0 },
  })

function withStranded(fleet: FleetFixture, value: boolean): FleetFixture {
  return { ...fleet, roster: { ...fleet.roster, stranded: value } }
}

function orderResponse(fleet: FleetFixture, warning: boolean | 'absent'): FleetFixture {
  return warning === 'absent' ? { ...fleet } : { ...fleet, strandingWarning: warning }
}

const QUOTE = {
  controlPoints: [0, 1, 2, 3, 4, 5].map((i) => ({ X: i, Y: 0, Z: 0 })),
  departMs: W0,
  arriveMs: W0 + 930_373,
  deltaV: 3721.492,
  fuelCostTons: 744.2984,
  affordable: true,
  strandingWarning: false,
}

const CAP_ERROR = Object.assign(new Error('rejected'), {
  data: { error: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap' },
})
const UNMAPPED_ERROR = new Error('API Error: 500 Internal Server Error')

// --- harness (tasks 2.1 / 2.2) ---------------------------------------------

interface Deferred {
  promise: Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}
function deferred(): Deferred {
  let resolve!: (v: unknown) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Service = 'listMine' | 'order' | 'cutDrive' | 'stop'
let pending: Record<Service, Deferred[]>
let settled: string[]
let qc: QueryClient

function holdCalls() {
  pending = { listMine: [], order: [], cutDrive: [], stop: [] }
  for (const name of ['listMine', 'order', 'cutDrive', 'stop'] as const) {
    mocks[name].mockImplementation(() => {
      const d = deferred()
      pending[name].push(d)
      return d.promise
    })
  }
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

async function settle(service: Service, index: number, how: 'answer' | 'reject', value: unknown) {
  const d = pending[service][index]
  expect(d, `${service}#${index} was requested`).toBeDefined()
  await act(async () => {
    if (how === 'answer') d.resolve(value)
    else d.reject(value)
  })
  await flush(0)
  settled.push(`${service}#${index} ${how}`)
}

const answerListMine = (index: number, fleets: FleetFixture[], worldTime: number) =>
  settle('listMine', index, 'answer', { fleets, worldTime, scale: 1 })
const rejectListMine = (index: number, error: unknown) => settle('listMine', index, 'reject', error)
const answerOrder = (index: number, fleet: FleetFixture) => settle('order', index, 'answer', fleet)
const rejectOrder = (index: number, error: unknown) => settle('order', index, 'reject', error)
const answerCutDrive = (index: number, fleet: FleetFixture) => settle('cutDrive', index, 'answer', fleet)
const answerStop = (index: number, fleet: FleetFixture) => settle('stop', index, 'answer', fleet)

async function reconnect() {
  await act(async () => {
    window.dispatchEvent(new Event('sse-reconnect'))
  })
  await flush(0)
}
const poll = () => flush(BOARD_POLL_MS)

const listMineCalls = () => mocks.listMine.mock.calls.length
const lastListMine = () => listMineCalls() - 1

function mount() {
  mocks.useSystemSpace.mockReturnValue(INTERIOR_RESULT)
  qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
  })
  return renderView()
}
function renderView() {
  return rtlRender(
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>,
  )
}

const notice = () => screen.queryByTestId('commit-stranding-notice')
const has = (id: string) => screen.queryByTestId(id) !== null
const selection = () => screen.getByTestId('space-canvas-region').getAttribute('data-selection')
const warningToast = () => vi.mocked(toast.warning)

interface CommitOptions {
  fleets?: FleetFixture[]
  select?: string
  ordered?: FleetFixture
  warning?: boolean | 'absent'
}

/** Base arrangement (contract §6.4): mount, answer #0, select, Burn, answer the order. */
async function commit(opts: CommitOptions = {}) {
  const {
    fleets = [parked('fleet_a')],
    select = 'mock-select-feat-body-1',
    ordered = burning('fleet_a', 1000, 61000),
    warning = true,
  } = opts
  mount()
  expect(listMineCalls(), 'GIVEN: one read at mount').toBe(1)
  await answerListMine(0, fleets, W0)
  await click(select)
  expect(notice(), 'GIVEN: no notice before any commit').toBeNull()
  await click('burn-button')
  expect(pending.order.length, 'GIVEN: the order is pending').toBe(1)
  const before = listMineCalls()
  await answerOrder(0, orderResponse(ordered, warning))
  expect(listMineCalls(), 'the acceptance requested a new read').toBe(before + 1)
}

/** Confirmed arrangement: base, then the first post-acceptance read reports the burn. */
async function commitAndConfirm(opts: CommitOptions = {}) {
  await commit(opts)
  await answerListMine(1, [opts.ordered ?? burning('fleet_a', 1000, 61000)], W0)
  expect(notice(), 'GIVEN: the notice stays once the read confirms the order').not.toBeNull()
}

const BASE_LOG = ['listMine#0 answer', 'order#0 answer']
const CONFIRMED_LOG = [...BASE_LOG, 'listMine#1 answer']

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(mocks).forEach((m) => m.mockReset())
  vi.useFakeTimers()
  settled = []
  holdCalls()
  mocks.preview.mockResolvedValue(QUOTE)
  mocks.listRunning.mockResolvedValue([])
  mocks.listSettled.mockResolvedValue([])
  mocks.scanTargets.mockResolvedValue([])
  mocks.acknowledge.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================
// SECTION 2 — hygiene, green when written (tasks 2.1, 2.2)
// ===========================================================================

describe('harness smoke test (surface-commit-stranding-warning 2.1, 2.2)', () => {
  // 2.1 / 2.2 — the harness settles by index and the triggers cause exactly one call.
  it('SDET-added: reads are held until answered; reconnect() and poll() each cause exactly one read', async () => {
    mount()
    expect(listMineCalls()).toBe(1)
    expect(has('fleet-row-fleet_a'), 'nothing rendered for the fleet before its read answers').toBe(false)
    await answerListMine(0, [parked('fleet_a')], W0)
    expect(has('fleet-row-fleet_a')).toBe(true)

    await reconnect()
    expect(listMineCalls(), 'sse-reconnect adds exactly one read').toBe(2)
    await poll()
    expect(listMineCalls(), 'one BOARD_POLL_MS advance adds exactly one read').toBe(3)
    expect(settled).toEqual(['listMine#0 answer'])
  })
})

// ===========================================================================
// SECTION 3 — view-level behaviour (red until 4.2 / 4.3)
// ===========================================================================

describe('3.1 the gap before any read answers', () => {
  // 3.1
  it('Scenario: The notice is shown before any read has answered after the acceptance — and A warned commit shows the notice with the success feedback', async () => {
    await commit()
    expect(has('fleet-row-eta-fleet_a'), 'GIVEN: the cached read still describes the fleet as parked').toBe(false)
    expect(settled).toEqual(BASE_LOG)
    expect(pending.listMine.length, 'listMine#1 is requested and unanswered').toBe(2)

    expect(notice()).not.toBeNull()
    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
  })
})

describe('3.2 a read begun before the commit does not end the gap', () => {
  // 3.2
  it('Scenario: A read begun before the commit and answered after it does not end the gap', async () => {
    mount()
    await answerListMine(0, [parked('fleet_a')], W0)
    await reconnect()
    expect(listMineCalls(), 'GIVEN: a read requested before the acceptance, held').toBe(2)
    await click('mock-select-feat-body-1')
    await click('burn-button')
    expect(notice(), 'GIVEN: no notice before the acceptance').toBeNull()

    await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
    expect(listMineCalls(), 'a NEW read was requested at the acceptance (the held one was superseded)').toBe(3)
    expect(notice()).not.toBeNull()

    const before = document.body.innerHTML
    await answerListMine(1, [parked('fleet_a')], W0)
    expect(document.body.innerHTML, 'answering the superseded read changed nothing on screen').toBe(before)
    expect(notice(), 'the earlier read answering parked does not end the gap').not.toBeNull()

    await answerListMine(2, [burning('fleet_a', 1000, 61000)], W0)
    expect(settled).toEqual(['listMine#0 answer', 'order#0 answer', 'listMine#1 answer', 'listMine#2 answer'])
    expect(notice(), 'the first read after the acceptance confirms the order').not.toBeNull()
  })
})

describe('3.3 the same burn keeps the notice', () => {
  // 3.3
  it('Scenario: A read reporting the same burn keeps the notice — across the committed target, a different body and none', async () => {
    await commitAndConfirm()
    expect(selection(), 'GIVEN: the committed target is selected').toBe(OTHER)

    await poll()
    const first = listMineCalls()
    expect(first, 'the poll requested a read').toBeGreaterThan(2)
    await answerListMine(lastListMine(), [burning('fleet_a', 1000, 61000)], W0)
    expect(notice(), 'after the first same-burn answer, target selected').not.toBeNull()

    await poll()
    expect(listMineCalls(), 'the second poll requested a read').toBeGreaterThan(first)
    await answerListMine(lastListMine(), [burning('fleet_a', 1000, 61000)], W0)
    expect(notice(), 'after the second same-burn answer, target selected').not.toBeNull()

    await click(`mock-select-${HOST}`)
    expect(selection(), 'GIVEN: a different body is selected').toBe(HOST)
    expect(notice(), 'a different body selected').not.toBeNull()

    await click(`mock-select-${HOST}`)
    expect(selection(), 'GIVEN: nothing is selected').toBe('')
    expect(notice(), 'no selection').not.toBeNull()
    expect(settled.slice(0, 3)).toEqual(CONFIRMED_LOG)
  })
})

describe('3.4 the projected clock passing the arrival', () => {
  // 3.4
  it('Scenario: The projected clock passing the arrival does not end the notice', async () => {
    await commitAndConfirm()
    const readsBefore = listMineCalls()
    await flush(61_000)
    expect(
      Number(screen.getByTestId('space-world-clock').getAttribute('data-world-time')),
      'GIVEN: the projected world time is past the arrival instant',
    ).toBeGreaterThan(61_000)
    expect(listMineCalls(), 'GIVEN: reads were requested and none answered').toBeGreaterThan(readsBefore)
    expect(settled).toEqual(CONFIRMED_LOG)
    expect(notice()).not.toBeNull()
  })
})

describe('3.5 cutting the drive', () => {
  // 3.5
  it('Scenario: Cutting the drive ends the notice', async () => {
    await commitAndConfirm()
    const selected = selection()
    await click('fleet-cmd-cut-drive-fleet_a')
    expect(pending.cutDrive.length, 'GIVEN: the cut was requested').toBe(1)
    const before = listMineCalls()
    await answerCutDrive(0, drifting('fleet_a'))
    expect(listMineCalls(), 'the cut caused a refreshed read').toBe(before + 1)
    expect(notice(), 'present until the refreshed read answers').not.toBeNull()

    await answerListMine(lastListMine(), [drifting('fleet_a')], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, 'cutDrive#0 answer', `listMine#${before} answer`])
    expect(notice(), 'removed once the fleet reads drifting').toBeNull()
    expect(selection(), 'no selection changed').toBe(selected)
    expect(warningToast(), 'no further advisory toast').toHaveBeenCalledTimes(1)
  })
})

describe('3.6 a stop', () => {
  // 3.6
  it.each([
    ['a different burn, 70000 to 90000', () => burning('fleet_a', 70000, 90000)],
    ['a point park', () => pointParked('fleet_a')],
  ] as const)('Scenario: A stop ends the notice, above or at the speed floor — the refreshed read answers %s', async (_arm, read) => {
    await commitAndConfirm()
    await click('fleet-cmd-stop-fleet_a')
    expect(pending.stop.length, 'GIVEN: the stop was requested').toBe(1)
    const before = listMineCalls()
    await answerStop(0, read())
    expect(listMineCalls(), 'the stop caused a refreshed read').toBe(before + 1)
    expect(notice(), 'present until the refreshed read answers').not.toBeNull()

    await answerListMine(lastListMine(), [read()], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, 'stop#0 answer', `listMine#${before} answer`])
    expect(notice()).toBeNull()
  })
})

describe('3.7 arrival', () => {
  // 3.7
  it.each([
    ['Arrival at a body ends the notice', 'body'],
    ['Arrival at a point ends the notice', 'point'],
  ] as const)('Scenario: %s', async (_name, row) => {
    if (row === 'body') {
      await commitAndConfirm()
    } else {
      await commitAndConfirm({
        select: 'mock-select-point',
        ordered: burningToPoint('fleet_a', 1000, 61000),
      })
      expect(selection(), 'GIVEN: a point is selected').toBe('point')
    }
    await reconnect()
    expect(listMineCalls(), 'the reconnect requested a read').toBe(3)
    expect(notice(), 'present until the arrival read answers').not.toBeNull()

    const announcerBefore = screen.getByTestId('space-announcer').textContent
    await answerListMine(2, [row === 'body' ? attached('fleet_a', OTHER) : pointParked('fleet_a')], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, 'listMine#2 answer'])
    expect(notice()).toBeNull()
    // Revision (ruling 16, QA Matrix B): a landed arrival read that removes the
    // notice still announces its landing, with exactly the landed-resolution text.
    if (row === 'body') {
      expect(announcerBefore, 'GIVEN: nothing was announced before the landing read').toBe('')
      expect(screen.getByTestId('space-announcer').textContent).toBe(
        `Burn complete — arrived and attached to ${OTHER}.`,
      )
    }
  })
})

describe('3.8 a different order placed elsewhere', () => {
  // 3.8
  it.each([
    ['toward another target, 5000 to 80000', () => burning('fleet_a', 5000, 80000, HOST)],
    ['toward the same target, 5000 to 61000', () => burning('fleet_a', 5000, 61000, OTHER)],
  ] as const)(
    'Scenario: A different order placed elsewhere ends the notice, toward the same target or another — %s',
    async (_arm, read) => {
      await commitAndConfirm()
      await poll()
      const caused = lastListMine()
      expect(caused, 'the poll requested a read').toBeGreaterThan(1)
      expect(notice(), 'present while the poll-caused read is unanswered').not.toBeNull()

      await answerListMine(caused, [read()], W0)
      expect(settled).toEqual([...CONFIRMED_LOG, `listMine#${caused} answer`])
      expect(notice()).toBeNull()
    },
  )
})

describe('3.8 SDET-added boundary probe', () => {
  // 3.8 — SDET-added: the scenario's rows change the departure; this row keeps
  // the departure and the target and changes ONLY the arrival, so a derivation
  // that compared one instant would pass the spec's rows but fail here.
  it('SDET-added: a read burning to the same target departing at 1000 but arriving at 70000 ends the notice', async () => {
    await commitAndConfirm()
    await poll()
    const caused = lastListMine()
    expect(caused, 'the poll requested a read').toBeGreaterThan(1)
    expect(notice(), 'present while the poll-caused read is unanswered').not.toBeNull()
    await answerListMine(caused, [burning('fleet_a', 1000, 70000, OTHER)], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, `listMine#${caused} answer`])
    expect(notice()).toBeNull()
  })
})

describe('3.9 an order that settled inside the round trip', () => {
  // 3.9
  it('Scenario: An order that settled inside the commit round trip never shows past the first read', async () => {
    await commit()
    expect(notice(), 'shown until that read answers').not.toBeNull()
    await answerListMine(1, [attached('fleet_a', OTHER)], W0)
    expect(settled).toEqual(CONFIRMED_LOG)
    expect(notice(), 'removed when the settled-park read answers').toBeNull()
  })
})

describe('3.10 a failed read', () => {
  // 3.10
  it('Scenario: A failed read never removes the notice', async () => {
    await commit()
    expect(notice(), 'GIVEN: the notice is shown at the acceptance').not.toBeNull()

    await rejectListMine(1, UNMAPPED_ERROR)
    expect(notice(), 'step 1: the failed read leaves the notice').not.toBeNull()
    expect(has('space-fleets-error'), 'step 1: the fleets-error notice shows').toBe(true)
    expect(has('space-fleets-retry'), 'step 1: and its retry').toBe(true)

    const before = listMineCalls()
    await click('space-fleets-retry')
    expect(listMineCalls(), 'the retry requested a read').toBe(before + 1)
    await answerListMine(lastListMine(), [burning('fleet_a', 1000, 61000)], W0)
    expect(notice(), 'step 2: the retry answers the committed burn').not.toBeNull()

    await reconnect()
    expect(listMineCalls(), 'the reconnect requested a read').toBe(before + 2)
    await rejectListMine(lastListMine(), UNMAPPED_ERROR)
    expect(has('space-fleets-error'), 'GIVEN: the later read failed').toBe(true)
    expect(notice(), 'step 3: a later failed read leaves the notice').not.toBeNull()

    await click('space-fleets-retry')
    expect(listMineCalls(), 'the second retry requested a read').toBe(before + 3)
    await answerListMine(lastListMine(), [parked('fleet_a')], W0)
    expect(settled).toEqual([
      'listMine#0 answer',
      'order#0 answer',
      'listMine#1 reject',
      `listMine#${before} answer`,
      `listMine#${before + 1} reject`,
      `listMine#${before + 2} answer`,
    ])
    expect(notice(), 'step 4: parked with no burn removes it').toBeNull()
  })
})

describe('3.11 the acting fleet changes', () => {
  // 3.11
  it.each([
    ['The notice follows the acting fleet and returns on the switch back', 'switch-back'],
    ['A response that lands after the acting fleet changed belongs to the fleet that committed', 'late-response'],
  ] as const)('Scenario: %s', async (_name, row) => {
    const both = [parked('fleet_a'), parked('fleet_b')]
    mount()
    await answerListMine(0, both, W0)
    await click('mock-select-feat-body-1')
    await click('burn-button')
    expect(pending.order.length, 'GIVEN: the command was invoked for A').toBe(1)
    expect(mocks.order.mock.calls[0][0], 'GIVEN: invoked for fleet_a').toBe('fleet_a')

    const confirmed = [burning('fleet_a', 1000, 61000), parked('fleet_b')]
    if (row === 'switch-back') {
      await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
      await answerListMine(1, confirmed, W0)
      expect(notice(), 'GIVEN: A shows its notice').not.toBeNull()
      await click('fleet-row-fleet_b')
      expect(screen.getByTestId('fleet-row-fleet_b').getAttribute('data-active'), 'GIVEN: B is acting').toBe('true')
      expect(notice(), 'no notice while B acts').toBeNull()
    } else {
      await click('fleet-row-fleet_b')
      expect(screen.getByTestId('fleet-row-fleet_b').getAttribute('data-active'), 'GIVEN: B is acting').toBe('true')
      await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
      expect(warningToast(), 'the advisory toast is shown at the acceptance').toHaveBeenCalledTimes(1)
      expect(notice(), 'no notice while B acts (response in)').toBeNull()
      await answerListMine(1, confirmed, W0)
      expect(notice(), 'no notice while B acts (read in)').toBeNull()
    }
    await click('fleet-row-fleet_a')
    expect(screen.getByTestId('fleet-row-fleet_a').getAttribute('data-active'), 'GIVEN: A is acting again').toBe('true')
    expect(settled).toEqual(['listMine#0 answer', 'order#0 answer', 'listMine#1 answer'])
    expect(notice(), 'the notice is shown when A is acting again').not.toBeNull()
    expect(warningToast(), 'exactly one advisory toast in total').toHaveBeenCalledTimes(1)
  })
})

describe('3.12 each fleet keeps its own notice', () => {
  // 3.12
  it('Scenario: Each fleet keeps its own notice', async () => {
    mount()
    await answerListMine(0, [parked('fleet_a'), parked('fleet_b')], W0)
    await click('mock-select-feat-body-1')
    await click('burn-button')
    await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
    await answerListMine(1, [burning('fleet_a', 1000, 61000), parked('fleet_b')], W0)
    expect(notice(), 'GIVEN: A has a notice').not.toBeNull()

    await click('fleet-row-fleet_b')
    expect(screen.getByTestId('fleet-row-fleet_b').getAttribute('data-active'), 'GIVEN: B is acting').toBe('true')
    await click('burn-button')
    expect(mocks.order.mock.calls[1][0], 'GIVEN: the second command is B\'s').toBe('fleet_b')
    await answerOrder(1, orderResponse(burning('fleet_b', 2000, 50000), true))
    expect(notice(), 'B has its own notice before the switch').not.toBeNull()
    await answerListMine(2, [burning('fleet_a', 1000, 61000), burning('fleet_b', 2000, 50000)], W0)
    expect(notice(), 'B keeps it once its read confirms').not.toBeNull()

    await click('fleet-row-fleet_a')
    expect(screen.getByTestId('fleet-row-fleet_a').getAttribute('data-active'), 'GIVEN: A is acting again').toBe('true')
    expect(settled).toEqual([
      'listMine#0 answer',
      'order#0 answer',
      'listMine#1 answer',
      'order#1 answer',
      'listMine#2 answer',
    ])
    expect(notice(), 'the notice is shown for A').not.toBeNull()
    expect(warningToast(), 'one advisory toast per warned commit').toHaveBeenCalledTimes(2)
  })
})

describe('3.13 an unwarned later commit replaces the notice', () => {
  // 3.13
  it('Scenario: A later commit by the same fleet replaces the earlier notice', async () => {
    await commitAndConfirm()
    await click('burn-button')
    expect(pending.order.length, 'GIVEN: the second command is pending').toBe(2)
    await answerOrder(1, orderResponse(burning('fleet_a', 5000, 80000), 'absent'))
    expect(notice(), 'no notice at the second acceptance').toBeNull()

    await answerListMine(lastListMine(), [burning('fleet_a', 1000, 61000)], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, 'order#1 answer', 'listMine#2 answer'])
    expect(notice(), 'the earlier order does not bring the notice back').toBeNull()
    expect(warningToast(), 'no second advisory toast').toHaveBeenCalledTimes(1)
  })
})

describe('3.14 a second warned commit replaces the notice', () => {
  // 3.14
  it('Scenario: A second warned commit by the same fleet replaces the notice and raises its own warning', async () => {
    await commitAndConfirm()
    await click('burn-button')
    await answerOrder(1, orderResponse(burning('fleet_a', 5000, 80000), true))
    expect(notice(), 'shown at the second acceptance').not.toBeNull()
    expect(warningToast(), 'two advisory toasts in total').toHaveBeenCalledTimes(2)

    await answerListMine(lastListMine(), [burning('fleet_a', 5000, 80000)], W0)
    expect(notice(), 'the second order\'s read keeps it').not.toBeNull()

    await reconnect()
    await answerListMine(lastListMine(), [parked('fleet_a')], W0)
    expect(settled).toEqual([...CONFIRMED_LOG, 'order#1 answer', 'listMine#2 answer', 'listMine#3 answer'])
    expect(notice(), 'a later read with no burn removes it').toBeNull()
  })
})

describe('3.15 a rejected or failed commit', () => {
  // 3.15
  it.each([
    ['a cap rejection', CAP_ERROR],
    ['a failure with no mapped reason', UNMAPPED_ERROR],
  ] as const)(
    'Scenario: A rejected or failed commit shows no notice and leaves an earlier one alone — %s',
    async (_arm, failure) => {
      await commitAndConfirm()
      await click('burn-button')
      expect(pending.order.length, 'GIVEN: the second command is pending').toBe(2)
      const reads = listMineCalls()
      await rejectOrder(1, failure)

      expect(settled).toEqual([...CONFIRMED_LOG, 'order#1 reject'])
      expect(vi.mocked(toast.error), 'the error feedback is shown').toHaveBeenCalledTimes(1)
      expect(screen.queryAllByTestId('commit-stranding-notice'), 'exactly one notice: the earlier one').toHaveLength(1)
      expect(warningToast(), 'no new advisory toast').toHaveBeenCalledTimes(1)
      expect(listMineCalls(), 'the rejection caused no new read').toBe(reads)
    },
  )
})

describe('3.16 a response without the stranding field', () => {
  // 3.16 — the control leg (a warned second commit DOES show the notice) is
  // what makes the unwarned absence a test and not a pass against today's code.
  it.each([
    ['the field absent', 'absent'],
    ['the field false', false],
  ] as const)('Scenario: A response without the stranding field shows no notice — %s', async (_arm, warning) => {
    await commit({ warning })
    expect(notice(), 'no notice at the unwarned acceptance').toBeNull()
    await answerListMine(1, [burning('fleet_a', 1000, 61000)], W0)
    expect(notice(), 'no notice after its read').toBeNull()
    expect(warningToast(), 'no advisory toast').not.toHaveBeenCalled()
    expect(vi.mocked(toast.success), 'the success feedback once').toHaveBeenCalledTimes(1)

    // CONTROL LEG: a warned second commit by the same fleet shows the notice.
    await click('burn-button')
    await answerOrder(1, orderResponse(burning('fleet_a', 5000, 80000), true))
    expect(settled).toEqual([...CONFIRMED_LOG, 'order#1 answer'])
    expect(notice(), 'CONTROL: the warned commit shows the notice').not.toBeNull()
    expect(warningToast(), 'CONTROL: and raises its warning').toHaveBeenCalledTimes(1)
  })
})

describe('3.17 advisory and distinct from the preview line', () => {
  // 3.17
  it('Scenario: The notice is advisory and distinct from the preview\'s stranding line', async () => {
    mocks.preview.mockResolvedValue({ ...QUOTE, strandingWarning: true })
    mount()
    await answerListMine(0, [parked('fleet_a')], W0)
    await click('mock-select-feat-body-1')
    expect(has('preview-stranding'), 'GIVEN: the preview carries its own stranding line').toBe(true)
    const announcer = () => screen.getByTestId('space-announcer').textContent
    const before = announcer()

    await click('burn-button')
    await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
    await answerListMine(1, [burning('fleet_a', 1000, 61000)], W0)
    const shown = notice()
    expect(shown).not.toBeNull()
    const line = screen.getByTestId('preview-stranding')
    expect(shown, 'two separate elements').not.toBe(line)
    expect(line.contains(shown as Node)).toBe(false)
    expect((shown as Node).contains(line)).toBe(false)
    expect(shown!.hasAttribute('role'), 'no role').toBe(false)
    expect(shown!.closest('[aria-live],[role="alert"],[role="status"]'), 'no live-region ancestor').toBeNull()
    expect(shown!.querySelector('button'), 'no dismiss control').toBeNull()
    expect(shown!.className, 'no error treatment').not.toMatch(/red|rose/)
    const burnBtn = screen.getByTestId('burn-button')
    expect(burnBtn.compareDocumentPosition(shown as Node) & Node.DOCUMENT_POSITION_FOLLOWING, 'Burn precedes it').toBeTruthy()
    expect(announcer(), 'live-region text unchanged with the notice shown').toBe(before)

    await click('fleet-cmd-cut-drive-fleet_a')
    await answerCutDrive(0, drifting('fleet_a'))
    await answerListMine(lastListMine(), [drifting('fleet_a')], W0)
    expect(notice(), 'the cut removed the notice').toBeNull()
    expect(announcer(), 'live-region text unchanged after the notice was removed').toBe(before)
  })
})

describe('3.18 independent of the preview', () => {
  // 3.18
  it('Scenario: The notice does not depend on the preview — no-quote', async () => {
    mocks.preview.mockRejectedValue(new Error('boom'))
    await commit()
    expect(has('preview-no-quote'), 'GIVEN: the preview is in its no-quote state').toBe(true)
    expect(notice()).not.toBeNull()
  })

  it('Scenario: The notice does not depend on the preview — stale', async () => {
    mount()
    await answerListMine(0, [parked('fleet_a')], W0)
    await click('mock-select-feat-body-1')
    expect(has('preview-deltav'), 'GIVEN: a preview first resolved').toBe(true)
    mocks.preview.mockRejectedValue(new Error('boom'))
    await flush(PREVIEW_REFRESH_MS)
    expect(has('preview-stale'), 'GIVEN: the refresh failed, so the preview is stale').toBe(true)

    await click('burn-button')
    await answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))
    expect(notice()).not.toBeNull()
    expect(has('preview-stale'), 'the preview is still stale').toBe(true)
  })

  it('Scenario: The notice does not depend on the preview — not requested', async () => {
    await commitAndConfirm()
    await click('mock-select-feat-body-1')
    expect(selection(), 'GIVEN: nothing is selected').toBe('')
    expect(has('preview-deltav') || has('preview-arrival') || has('preview-fuel'), 'GIVEN: no preview figure').toBe(false)
    expect(has('preview-no-quote') || has('preview-stale')).toBe(false)
    expect(notice()).not.toBeNull()
  })
})

describe('3.19 the copy', () => {
  // 3.19
  it.each([
    ['a body order, 1000 to 61000', 'body'],
    ['a point order, 5000 to 80000, answered by a read with a different worldTime', 'point'],
  ] as const)('Scenario: The notice\'s copy names stations and lane gates and carries no wire text — %s', async (_arm, row) => {
    if (row === 'body') {
      await commitAndConfirm()
    } else {
      await commit({ select: 'mock-select-point', ordered: burningToPoint('fleet_a', 5000, 80000) })
      await answerListMine(1, [burningToPoint('fleet_a', 5000, 80000)], 99_999)
    }
    const shown = notice()
    expect(shown).not.toBeNull()
    const text = shown!.textContent ?? ''
    expect(text).toBe(NOTICE_COPY)
    expect(text).toMatch(/station/i)
    expect(text).toMatch(/lane gate/i)
    expect(text).toMatch(/place a different order/i)
    expect(text).not.toMatch(/\d/)
    expect(text).not.toMatch(/strand/i)
  })
})

describe('3.20 reload and remount', () => {
  // 3.20
  it.each([
    ['stranded true', true],
    ['stranded false', false],
  ] as const)('Scenario: A reload shows no notice and leaves the persistent indication to the roster — %s', async (_arm, value) => {
    await commit()
    await answerListMine(1, [withStranded(burning('fleet_a', 1000, 61000), value)], W0)
    expect(notice(), 'GIVEN: the notice is shown before the remount').not.toBeNull()
    expect(settled).toEqual(CONFIRMED_LOG)
    expect(pending.listMine.length, 'no read is left pending at unmount').toBe(2)
    expect(pending.order.length).toBe(1)

    // Unmount the current tree, then mount a fresh view on the SAME client.
    // (Whether the remount requests a read is deliberately not asserted.)
    cleanup()
    renderView()
    await flush(0)

    expect(notice(), 'a fresh view shows no notice').toBeNull()
    expect(has('fleet-stranded-fleet_a'), 'the roster indication tracks the read').toBe(value)
  })
})
