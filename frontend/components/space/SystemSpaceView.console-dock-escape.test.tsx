import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE TESTS - openspec change keep-console-tab-content-mounted, tasks
// 2.1-2.6 (system-console: "Escape Collapses the Expanded Dock" and
// "Activating the Dock Changes No Space-View Selection").
// Impl contract: docs/handoffs/keep-console-tab-content-mounted-impl-contract.md
// sections 3.7 (what is mocked), 3.8 (the stage stand-ins and the test-only
// identifiers) and 3.9 (task by task).
//
// REAL, never mocked: SystemSpaceView, ConsoleDock, VitalsStrip and its
// cells (so the real fleet menu's handlers run), SightingLog, ScanControl,
// FleetActionsPanel, SpaceCommandPanel, FleetRoster. MOCKED: every read (a
// hook), the stage, navigation, providers. Two differences from
// SystemSpaceView.console-dock.test.tsx: (1) ONE shared `refetch` spy is
// every mocked read's `refetch`, and every mutation's `mutate` is reachable,
// so task 2.4 can assert that none was called; (2) the stage mock below.
//
// Test-only identifiers minted here (none exists in production code):
// `mock-camera-control`, `mock-select-${bodyId}`, `mock-activate-${fleetId}`,
// and the attribute `data-acting-fleet` on the stage mock's root.
// `data-selection` is the real stage's own attribute (SpaceStage.tsx:435).
//
// Escape is `user.keyboard('{Escape}')`: it dispatches on
// `document.activeElement` and bubbles through the testing library's `div`
// container (where React runs the fleet menu's handlers) to `window`.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

const shared = vi.hoisted(() => ({ refetch: vi.fn(), fetchNextPage: vi.fn(), picks: { count: 0 } }))
const sightings = vi.hoisted(() => ({ byArg: new Map<string, Record<string, unknown>>() }))
const scanState = vi.hoisted(() => ({ settled: null as unknown }))
const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), reset: vi.fn(), isPending: false, isError: false, error: null })
  return {
    order: make(), jump: make(), cutDrive: make(), stop: make(), mine: make(), hold: make(), release: make(),
    sell: make(), refuel: make(), cancelAction: make(), scan: make(),
  }
})

vi.mock('@/hooks/use-sightings', () => ({
  useSightings: (systemId: string | null) =>
    sightings.byArg.get(systemId ?? 'all') ?? {
      data: { pages: [{ sightings: [], nextCursor: '' }] },
      isLoading: false, isError: false, refetch: shared.refetch, fetchNextPage: shared.fetchNextPage, hasNextPage: false,
    },
}))
vi.mock('@/hooks/use-system-space', () => ({ useSystemSpace: (id: string) => useSystemSpace(id) }))
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
vi.mock('@/hooks/use-actions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-actions')
  return {
    ...actual,
    useRunningMine: () => useRunningMine(),
    useCancelAction: () => mutations.cancelAction,
    useRunningScan: () => ({ data: null, refetch: shared.refetch }),
  }
})
vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => ({ data: { targets: [] }, isLoading: false, isError: false, refetch: shared.refetch }),
  useScan: () => mutations.scan,
  useSettledScan: () => ({ data: scanState.settled, isError: false, refetch: shared.refetch }),
}))
vi.mock('@/hooks/use-market', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-market')
  return {
    ...actual,
    useMarketBoard: () => ({ data: undefined, isLoading: false, isError: false, refetch: shared.refetch }),
    useStation: () => ({ data: undefined, isLoading: false, isError: false, refetch: shared.refetch }),
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

// The stage stand-ins (contract 3.8): a camera control, a body pick, an
// acting-fleet change, the selection and acting fleet as attributes, and a
// pick counter.
const stage = vi.hoisted(() => ({ available: true, firstFrame: true }))
vi.mock('./SpaceStage', async () => {
  const ReactMod = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function SpaceStageMock(props: any) {
    ReactMod.useEffect(() => {
      props.onAvailabilityChange?.(stage.available)
      if (stage.available && stage.firstFrame) props.onFirstFrame?.()
    }, [props])
    return ReactMod.createElement(
      'div',
      {
        'data-testid': 'space-canvas-region',
        'data-selection': props.selection ? (props.selection.bodyId ?? 'point') : '',
        'data-acting-fleet': props.actingFleetId ?? '',
        // a press on the region itself (never on a trigger below) is a pick
        onClick: (e: { target: unknown; currentTarget: unknown }) => { if (e.target === e.currentTarget) shared.picks.count += 1 },
        onPointerDown: (e: { target: unknown; currentTarget: unknown }) => { if (e.target === e.currentTarget) shared.picks.count += 1 },
      },
      ReactMod.createElement('button', { type: 'button', 'data-testid': 'mock-camera-control' }, 'camera'),
      ReactMod.createElement('button', {
        type: 'button',
        'data-testid': 'mock-select-feat-star',
        onClick: () => { shared.picks.count += 1; props.onSelect?.({ bodyId: 'feat-star' }) },
      }),
      ReactMod.createElement('button', {
        type: 'button',
        'data-testid': 'mock-activate-fleet_2',
        onClick: () => { shared.picks.count += 1; props.onActivateFleet?.('fleet_2') },
      }),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'

const INTERIOR = {
  systemId: SYSTEM_ID, extent: 200, character: 'normal', starClass: 'M', worldTime: T0, scale: 1,
  features: [{ id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 }],
  laneGates: [], contacts: [],
}
/** The mine fixture (contract 3.8): the acting fleet attached to a rocky body that carries resources, no running mine. */
const INTERIOR_WITH_ROCK = {
  ...INTERIOR,
  features: [
    ...INTERIOR.features,
    {
      id: 'feat-rock', type: 'rocky', space: { X: 18, Y: -3, Z: -15 }, size: 1.76,
      resources: [{ kind: 'metals', richness: 0.8 }, { kind: 'water', richness: 0.4 }],
      orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18591, phase: 373097, inclination: 500434, node: 205958 },
    },
  ],
}

function fleet(id: string, over: Record<string, unknown> = {}) {
  return {
    id, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 30, Y: 0, Z: 0 }, attachedTo: undefined as string | undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 30, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
    ...over,
  }
}

function answeredInterior(data: unknown = INTERIOR) {
  return { data, isLoading: false, isError: false, error: null, refetch: shared.refetch }
}
function ownFleets(list: Record<string, unknown>[]) {
  return { data: list, isLoading: false, isError: false, refetch: shared.refetch }
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>,
  )
}

const open = () => screen.getByTestId('console-dock-open')
const region = () => screen.getByTestId('console-dock-region')
const collapseBtn = () => screen.getByTestId('console-dock-collapse')
const canvas = () => screen.getByTestId('space-canvas-region')
const chevron = () => screen.getByTestId('vitals-fleet-chevron')
const refreshControl = () => within(screen.getByTestId('console-panel-log')).getByRole('button', { name: 'Refresh sighting log' })

function expand() { fireEvent.click(open()) }
const clearSpies = () => {
  shared.refetch.mockClear()
  shared.fetchNextPage.mockClear()
  for (const m of Object.values(mutations)) { m.mutate.mockClear(); m.mutateAsync.mockClear() }
}
function expectNoRequestSpyCalled() {
  expect(shared.refetch, 'a mocked read\'s refetch was called').not.toHaveBeenCalled()
  for (const [name, m] of Object.entries(mutations)) {
    expect(m.mutate, `mutation ${name}.mutate was called`).not.toHaveBeenCalled()
    expect(m.mutateAsync, `mutation ${name}.mutateAsync was called`).not.toHaveBeenCalled()
  }
}

function pileOf(records: unknown[], nextCursor = '') {
  return {
    data: { pages: [{ sightings: records, nextCursor }] },
    isLoading: false, isError: false, refetch: shared.refetch, fetchNextPage: shared.fetchNextPage, hasNextPage: nextCursor !== '',
  }
}
function record(id: string) {
  return {
    id, systemId: SYSTEM_ID, asOf: 1_000, hostId: `host-${id}`, cleanSweep: false,
    position: { X: 40, Y: 0, Z: -10 }, velocity: { X: 0, Y: 0, Z: 0 }, emitting: false,
    hullCount: 1, hullTypes: ['scout'],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sightings.byArg.clear()
  scanState.settled = null
  shared.picks.count = 0
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  useSystemSpace.mockReturnValue(answeredInterior())
  useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1')]))
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// Task 2.1 - Escape with focus inside the dock
// ============================================================================
describe('Task 2.1 - Escape with focus inside the dock collapses it and moves focus to the Console control', () => {
  const rows: [string, () => HTMLElement][] = [
    ['the Log tab', () => screen.getByTestId('console-tab-log')],
    ['the collapse control', () => collapseBtn()],
    ['a control inside the panel (Refresh)', () => refreshControl()],
  ]
  for (const [name, target] of rows) {
    it(`Scenario: Escape with focus inside the dock collapses it and moves focus to the Console control (focus on ${name})`, async () => {
      const user = userEvent.setup()
      mount()
      expand()
      target().focus()
      expect(document.activeElement, "precondition: focus is on the row's control").toBe(target())
      await user.keyboard('{Escape}')
      expect(region()).toHaveAttribute('hidden')
      expect(document.activeElement).toBe(open())
    })
  }
})

// ============================================================================
// Task 2.2 - Escape with focus elsewhere
// ============================================================================
describe('Task 2.2 - Escape with focus outside the dock', () => {
  type Row = { name: string; scenario: string; arrange: () => void; focus: () => HTMLElement; prepare?: () => Promise<void> | void }
  const rows: Row[] = [
    {
      name: 'a camera control',
      scenario: 'Escape with focus outside the dock leaves focus where it was',
      arrange: () => undefined,
      focus: () => screen.getByTestId('mock-camera-control'),
    },
    {
      name: "the strip's chevron with its menu closed",
      scenario: "Collapsing with focus on the strip's chevron leaves focus there",
      arrange: () => undefined,
      focus: () => chevron(),
    },
    {
      name: 'the document body',
      scenario: 'Escape with focus on no control collapses the dock',
      arrange: () => undefined,
      focus: () => document.body,
    },
    {
      name: 'a number field holding a typed value',
      scenario: "Escape with focus in a text field or a select collapses the dock and keeps the field's value",
      arrange: () => {
        useSystemSpace.mockReturnValue(answeredInterior(INTERIOR_WITH_ROCK))
        useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1', { attachedTo: 'feat-rock' })]))
      },
      prepare: () => {
        fireEvent.change(screen.getByTestId('mine-tons-input'), { target: { value: '7' } })
        expect((screen.getByTestId('mine-tons-input') as HTMLInputElement).value, 'precondition: the field holds the typed value').toBe('7')
      },
      focus: () => screen.getByTestId('mine-tons-input'),
    },
    {
      name: 'a closed select showing a chosen option',
      scenario: "Escape with focus in a text field or a select collapses the dock and keeps the field's value",
      arrange: () => {
        useSystemSpace.mockReturnValue(answeredInterior(INTERIOR_WITH_ROCK))
        useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1', { attachedTo: 'feat-rock' })]))
      },
      prepare: async () => {
        await userEvent.setup().selectOptions(screen.getByTestId('mine-kind-select'), 'water')
        expect((screen.getByTestId('mine-kind-select') as HTMLSelectElement).value, 'precondition: the select shows the chosen option').toBe('water')
      },
      focus: () => screen.getByTestId('mine-kind-select'),
    },
    {
      name: 'the interior read failed, focus on the body',
      scenario: "Escape collapses the dock in the strip's failure states",
      arrange: () => useSystemSpace.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: shared.refetch }),
      focus: () => document.body,
    },
    {
      name: 'the own-fleets read failed, focus on a camera control',
      scenario: "Escape collapses the dock in the strip's failure states",
      arrange: () => useMyFleets.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: shared.refetch }),
      focus: () => screen.getByTestId('mock-camera-control'),
    },
    {
      name: 'the canvas unavailable, focus on the body',
      scenario: "Escape collapses the dock in the strip's failure states",
      arrange: () => { stage.available = false },
      focus: () => document.body,
    },
  ]
  for (const { name, scenario, arrange, prepare, focus } of rows) it(`Scenario: ${scenario} (${name})`, async () => {
    const user = userEvent.setup()
    arrange()
    mount()
    expand()
    await prepare?.()
    const target = focus()
    if (target === document.body) (document.activeElement as HTMLElement | null)?.blur()
    else target.focus()
    const el = document.activeElement
    const valueBefore = (el as HTMLInputElement | null)?.value
    expect(el, 'precondition: focus is where the row puts it').toBe(target)

    await user.keyboard('{Escape}')

    expect(region(), 'the dock did not collapse').toHaveAttribute('hidden')
    expect(document.activeElement, 'focus moved').toBe(el)
    expect((document.activeElement as HTMLInputElement | null)?.value, 'the value changed').toBe(valueBefore)
  })
})

// ============================================================================
// Task 2.3 - a collapse by a pointer press that moves no focus (guard)
// ============================================================================
describe('Task 2.3 - collapsing by a pointer press that moves no focus leaves focus on the chevron', () => {
  it('Scenario: Collapsing by a pointer press that moves no focus leaves focus on the chevron', () => {
    mount()
    expand()
    chevron().focus()
    expect(document.activeElement, 'precondition: the chevron holds focus').toBe(chevron())
    // a click event with no mousedown: no focus moves (user.click would focus the collapse control)
    fireEvent.click(collapseBtn())
    expect(region()).toHaveAttribute('hidden')
    expect(document.activeElement).toBe(chevron())
  })
})

// ============================================================================
// Task 2.4 - none of it changes the selection
// ============================================================================
describe('Task 2.4 - the selection, the acting fleet and every request are untouched', () => {
  function arrangeSelection() {
    useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1'), fleet('fleet_2')]))
    mount()
    fireEvent.click(screen.getByTestId('mock-select-feat-star'))
    fireEvent.click(screen.getByTestId('mock-activate-fleet_2'))
    expect(canvas(), 'precondition: a body is selected').toHaveAttribute('data-selection', 'feat-star')
    expect(canvas(), 'precondition: a non-default fleet is acting').toHaveAttribute('data-acting-fleet', 'fleet_2')
    clearSpies()
  }
  function expectUntouched(hidden: boolean) {
    expect(canvas()).toHaveAttribute('data-selection', 'feat-star')
    expect(canvas()).toHaveAttribute('data-acting-fleet', 'fleet_2')
    expectNoRequestSpyCalled()
    if (hidden) expect(region(), 'the dock should be collapsed').toHaveAttribute('hidden')
    else expect(region(), 'the dock should be expanded').not.toHaveAttribute('hidden')
  }

  it('Scenario: Escape collapsing the dock clears no selection (Escape, dock expanded)', async () => {
    const user = userEvent.setup()
    arrangeSelection()
    expand()
    await user.keyboard('{Escape}')
    expectUntouched(true)
  })

  it('Scenario: Escape with the dock collapsed changes nothing', async () => {
    const user = userEvent.setup()
    arrangeSelection()
    await user.keyboard('{Escape}')
    expectUntouched(true)
  })

  it('Scenario: Expanding and collapsing the dock leaves the acting fleet unchanged (by pointer)', () => {
    arrangeSelection()
    expand()
    fireEvent.click(collapseBtn())
    expectUntouched(true)
  })

  it('Scenario: Expanding and collapsing the dock leaves the acting fleet unchanged (by keyboard)', async () => {
    const user = userEvent.setup()
    arrangeSelection()
    open().focus()
    await user.keyboard('{Enter}')
    expect(region(), 'checkpoint: Enter on the Console control expanded the dock').not.toHaveAttribute('hidden')
    collapseBtn().focus()
    await user.keyboard('{Enter}')
    expectUntouched(true)
  })
})

// ============================================================================
// Task 2.5 - the fleet menu's precedence
// ============================================================================
describe("Task 2.5 - the fleet cell's menu takes Escape first", () => {
  const rows: [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
    ['focus on a menu entry', async (user) => { await user.click(chevron()) }],
    [
      'focus on the chevron with the menu open',
      async (user) => {
        await user.click(chevron())
        chevron().focus()
      },
    ],
  ]
  for (const [name, openMenu] of rows) it(`Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded / Scenario: A held Escape that closed the menu does not also collapse the dock (${name})`, async () => {
    const user = userEvent.setup()
    mount()
    expand()
    await openMenu(user)
    expect(screen.getByTestId('vitals-fleet-menu'), 'precondition: the menu is open').toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('vitals-fleet-menu'), 'the menu did not close').toBeNull()
    expect(document.activeElement, 'focus is not on the chevron').toBe(chevron())
    expect(region(), 'the first Escape collapsed the dock').not.toHaveAttribute('hidden')

    // the held key: a repeated keydown following the closing keydown
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape', repeat: true })
    expect(region(), 'a repeated keydown collapsed the dock').not.toHaveAttribute('hidden')

    // positive control: a second, fresh Escape collapses the dock
    await user.keyboard('{Escape}')
    expect(region(), 'the second Escape did not collapse the dock').toHaveAttribute('hidden')
  })
})

// ============================================================================
// Task 2.6 - activating the dock is not a pick (cannot fail at tier 1)
// ============================================================================
describe('Task 2.6 - a pointer press on the dock leaves the selection unchanged', () => {
  it('Scenario: A pointer press on any part of the dock leaves the selection unchanged', async () => {
    sightings.byArg.set('all', pileOf([record('sight-a')], 'cursor-2'))
    const user = userEvent.setup()
    useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1'), fleet('fleet_2')]))
    mount()
    fireEvent.click(screen.getByTestId('mock-select-feat-star'))
    fireEvent.click(screen.getByTestId('mock-activate-fleet_2'))
    expect(shared.picks.count, 'precondition: the arrangement\'s own picks were counted').toBeGreaterThan(0)
    shared.picks.count = 0
    const unchanged = () => {
      expect(canvas()).toHaveAttribute('data-selection', 'feat-star')
      expect(canvas()).toHaveAttribute('data-acting-fleet', 'fleet_2')
    }

    await user.click(open())
    unchanged()
    const presses: (() => HTMLElement)[] = [
      () => screen.getByRole('tablist'),
      () => screen.getByTestId('console-tab-log'),
      () => screen.getByTestId('console-panel-log'),
      () => refreshControl(),
      () => within(screen.getByTestId('console-panel-log')).getByTestId('sighting-row-sight-a'),
      () => screen.getByTestId('sighting-log-load-more'),
      () => collapseBtn(),
    ]
    for (const press of presses) {
      await user.click(press())
      unchanged()
    }
    expect(shared.picks.count, 'the canvas received a pick').toBe(0)
  })
})
