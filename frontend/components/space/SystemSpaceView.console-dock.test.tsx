import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, within, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE TESTS - openspec change add-console-dock, tasks 2.1-2.11 and 2.13
// (system-console: "The Console Dock Extends Beneath the Strip and Is
// Collapsed on Every Mount of the View", "The Log Tab Is the Sighting Log's
// Home on This View", "The Dock Is Keyboard-Operable", and the structural
// half of "...Nothing Covers It or Is Covered by It").
//
// REAL, never mocked: SystemSpaceView, ConsoleDock, VitalsStrip and its cells,
// SightingLog, ScanControl, SpaceCommandPanel, FleetActionsPanel, FleetRoster,
// buildSceneModel, @/lib/console-dock-layout. MOCKED: the reads (hooks), the
// stage (SpaceStage), navigation, providers - the module list of
// SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx with three changes
// (impl contract 5.3): useSightings is settable per argument and records its
// calls; useSettledScan is settable; the stage mock draws one trigger button
// per sighting mark.
//
// Conventions (contract 5.1): "not shown" is the `hidden` attribute for the
// dock's own elements; the log's absence while collapsed is asserted with a
// predicate that holds whether it is unmounted or hidden (that is
// keep-console-tab-content-mounted's call, not this change's); a remount under
// another system uses a `key`; tab walks start from a known element; control
// names are matched exactly. No dimension, overlap, scroll position or resolved
// calc()/var() is asserted here (design.md D-22).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

const sightings = vi.hoisted(() => {
  const refetch = () => undefined
  const fetchNextPage = () => undefined
  return {
    byArg: new Map<string, Record<string, unknown>>(),
    calls: [] as (string | null)[],
    refetch,
    fetchNextPage,
  }
})
const scanState = vi.hoisted(() => ({ settled: null as unknown }))

vi.mock('@/hooks/use-sightings', () => ({
  useSightings: (systemId: string | null) => {
    sightings.calls.push(systemId)
    const key = systemId ?? 'all'
    return (
      sightings.byArg.get(key) ?? {
        data: { pages: [{ sightings: [], nextCursor: '' }] },
        isLoading: false,
        isError: false,
        refetch: sightings.refetch,
        fetchNextPage: sightings.fetchNextPage,
        hasNextPage: false,
      }
    )
  },
}))

const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), reset: vi.fn(), isPending: false, isError: false, error: null })
  return {
    order: make(), jump: make(), cutDrive: make(), stop: make(), mine: make(), hold: make(), release: make(),
    sell: make(), refuel: make(), cancelAction: make(), scan: make(),
  }
})

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
    useRunningScan: () => ({ data: null, refetch: vi.fn() }),
  }
})
vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => ({ data: { targets: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useScan: () => mutations.scan,
  useSettledScan: () => ({ data: scanState.settled, isError: false, refetch: vi.fn() }),
}))
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
import {
  CONSOLE_DOCK_HEIGHT_VAR,
  CONSOLE_DOCK_LANE_COLUMN,
  CONSOLE_DOCK_LANE_LEFT_CENTER,
} from '@/lib/console-dock-layout'

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'
const OTHER_SYSTEM_ID = 'sys_3_4'

const INTERIOR = {
  systemId: SYSTEM_ID, extent: 200, character: 'normal', starClass: 'M', worldTime: T0, scale: 1,
  features: [{ id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 }],
  laneGates: [], contacts: [],
}

function ownFleet() {
  return {
    id: 'fleet_1', corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 30, Y: 0, Z: 0 }, attachedTo: undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 30, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
  }
}

function record(id: string, over: Record<string, unknown> = {}) {
  return {
    id, systemId: SYSTEM_ID, asOf: 1_000, hostId: `host-${id}`, cleanSweep: false,
    position: { X: 40, Y: 0, Z: -10 }, velocity: { X: 0, Y: 0, Z: 0 }, emitting: false,
    hullCount: 1, hullTypes: ['scout'],
    ...over,
  }
}

/** A settled scan that filed records: no reasonCode, so the real ScanControl offers its report link. */
const SETTLED_SCAN = {
  id: 'act-scan-1', type: 'scan', actor: 'fleet_1', scope: SYSTEM_ID,
  committedAt: T0 - 6_000, eta: T0 - 1_000, status: 'done', resolvedAt: T0 - 1_000, worldTime: T0,
  params: { systemId: SYSTEM_ID },
}

function hookResult(over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ sightings: [] as unknown[], nextCursor: '' }] },
    isLoading: false, isError: false,
    refetch: sightings.refetch, fetchNextPage: sightings.fetchNextPage, hasNextPage: false,
    ...over,
  }
}
function pileOf(records: unknown[], nextCursor = '') {
  return hookResult({ data: { pages: [{ sightings: records, nextCursor }] }, hasNextPage: nextCursor !== '' })
}

function answeredInterior() {
  return { data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn() }
}
function setReads() {
  useSystemSpace.mockReturnValue(answeredInterior())
  useMyFleets.mockReturnValue({ data: [ownFleet()], isLoading: false, isError: false, refetch: vi.fn() })
}

function mount(id: string = SYSTEM_ID) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = (systemId: string) => (
    <QueryClientProvider client={qc}>
      <SystemSpaceView key={systemId} systemId={systemId} />
    </QueryClientProvider>
  )
  const result = rtlRender(tree(id))
  return { ...result, goTo: (systemId: string) => result.rerender(tree(systemId)), again: () => result.rerender(tree(id)) }
}

const open = () => screen.getByTestId('console-dock-open')
const region = () => screen.getByTestId('console-dock-region')
const panel = () => screen.getByTestId('console-panel-log')
const tab = () => screen.getByTestId('console-tab-log')
const collapseBtn = () => screen.getByTestId('console-dock-collapse')

function expectCollapsed() {
  expect(screen.getByTestId('vitals-strip')).toBeVisible()
  expect(open()).toBeVisible()
  expect(open()).not.toHaveAttribute('hidden')
  expect(region()).toHaveAttribute('hidden')
  expect(region()).not.toBeVisible()
}
function expectExpanded() {
  expect(region()).not.toHaveAttribute('hidden')
  expect(region()).toBeVisible()
  expect(open()).toHaveAttribute('hidden')
}
/** The log is not shown: unmounted or hidden - both are correct for this change (contract 5.1). */
function expectLogNotShown() {
  const el = screen.queryByTestId('sighting-log')
  expect(el === null || el.closest('[hidden]') !== null).toBe(true)
}

beforeEach(() => {
  vi.clearAllMocks()
  sightings.byArg.clear()
  sightings.calls.length = 0
  scanState.settled = null
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  setReads()
})

afterEach(() => {
  vi.useRealTimers()
  document.documentElement.style.removeProperty(CONSOLE_DOCK_HEIGHT_VAR)
})

describe('SystemSpaceView + ConsoleDock - task 2.1 the default', () => {
  it('Scenario: The view opens with the dock collapsed', () => {
    mount()
    expectCollapsed()
    expect(tab().closest('[hidden]')).not.toBeNull() // the tab bar lives in the hidden region
    expect(tab()).not.toBeVisible()
    expect(panel()).not.toBeVisible()
  })

  it('Scenario: A reload shows the dock collapsed (a remount)', async () => {
    const user = userEvent.setup()
    const first = mount()
    await user.click(open())
    expectExpanded()
    first.unmount()
    mount()
    expectCollapsed()
  })

  it('Scenario: Navigating to another system and back shows the dock collapsed', async () => {
    const user = userEvent.setup()
    const view = mount(SYSTEM_ID)
    await user.click(open())
    expectExpanded()
    view.goTo(OTHER_SYSTEM_ID) // a key models Next's per-segment keying: the view remounts
    expectCollapsed()
    view.goTo(SYSTEM_ID)
    expectCollapsed()
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.2 the strip reads the same in both states', () => {
  it('Scenario: The strip reads the same in both states', () => {
    vi.useFakeTimers()
    mount()
    const CELLS = ['vitals-fleet-cell', 'vitals-fuel-cell', 'vitals-hold-cell', 'vitals-credits-cell', 'vitals-clock-cell']
    const read = () =>
      CELLS.map((id) => {
        const cell = screen.getByTestId(id)
        return {
          id,
          text: cell.textContent,
          raws: Array.from(cell.querySelectorAll('[data-raw]')).map((el) => el.getAttribute('data-raw')),
        }
      })
    const collapsed = read()
    const chevronCollapsed = screen.queryByTestId('vitals-fleet-chevron') !== null

    // non-vacuous: the acting fleet's identity is in the fleet cell and every cell has text
    expect(collapsed[0].text).toContain('fleet_1')
    for (const c of collapsed) expect(c.text, c.id).not.toBe('')
    expect(chevronCollapsed).toBe(true)

    fireEvent.click(open())
    expectExpanded()

    expect(read()).toEqual(collapsed)
    expect(screen.queryByTestId('vitals-fleet-chevron') !== null).toBe(true)
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.3 the Console control is not part of the strip', () => {
  it('Scenario: The Console control is not part of the strip', () => {
    mount()
    const strip = screen.getByTestId('vitals-strip')
    const interactive = Array.from(strip.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    expect(interactive.length).toBeGreaterThan(0)
    const chevron = screen.getByTestId('vitals-fleet-chevron')
    const menu = screen.queryByTestId('vitals-fleet-menu')
    for (const el of interactive) {
      const ok = el === chevron || (menu !== null && menu.contains(el))
      expect(ok, `${el.outerHTML.slice(0, 80)} is the chevron or inside its menu`).toBe(true)
    }
    expect(strip.contains(open())).toBe(false)
    expect(interactive).not.toContain(open())
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.4 the dock in the strip\'s failure states', () => {
  const states: [string, () => void][] = [
    ['the interior read has failed', () => useSystemSpace.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn() })],
    ['the own-fleets read has failed', () => useMyFleets.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })],
    ['the canvas region is unavailable', () => { stage.available = false }],
  ]
  it.each(states)('Scenario: The dock is present and expandable in the strip\'s failure states (%s)', async (_name, arrange) => {
    arrange()
    const user = userEvent.setup()
    mount()
    expect(open()).toBeVisible()
    expect(region()).toHaveAttribute('hidden')
    await user.click(open())
    expect(region()).not.toHaveAttribute('hidden')
    expect(region()).toBeVisible()
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.5 no live region changes', () => {
  it('Scenario: Expanding and collapsing change no live region', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    const outsidePanel = () =>
      Array.from(container.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"], [role="log"]')).filter(
        (el) => !panel().contains(el),
      )
    const before = outsidePanel()
    expect(before.length).toBeGreaterThan(0) // the balance and space announcers at least
    const snapshot = (els: HTMLElement[]) => els.map((el) => `${el.getAttribute('data-testid') ?? el.tagName}:${el.textContent}`)
    const base = snapshot(before)

    await user.click(open())
    expectExpanded()
    expect(snapshot(outsidePanel())).toEqual(base)

    await user.click(collapseBtn())
    expectCollapsed()
    expect(snapshot(outsidePanel())).toEqual(base)
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.6 the Tab walk on the view', () => {
  it('Scenario: The dock\'s controls follow the strip\'s chevron in the tab order (collapsed row)', async () => {
    const user = userEvent.setup()
    mount()
    screen.getByTestId('vitals-fleet-chevron').focus()
    await user.tab()
    expect(document.activeElement).toBe(open())
  })

  it('Scenario: The dock\'s controls follow the strip\'s chevron in the tab order (expanded row)', async () => {
    const user = userEvent.setup()
    mount()
    fireEvent.click(open())
    expectExpanded()
    screen.getByTestId('vitals-fleet-chevron').focus()
    await user.tab()
    expect(document.activeElement).toBe(tab())
    await user.tab()
    expect(document.activeElement).toBe(collapseBtn())
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.7 the log\'s placement', () => {
  const R = [record('sight-a'), record('sight-b', { position: { X: 41, Y: 0, Z: -9 } }), record('sight-c', { position: { X: 42, Y: 0, Z: -8 } })]

  it('Scenario: The expanded dock\'s Log panel holds the log / Scenario: No standalone toggle and no floating log remain / Scenario: The Log tab\'s label carries no count however many rows are listed (view-level half)', async () => {
    sightings.byArg.set('all', pileOf(R, 'cursor-2'))
    sightings.byArg.set(SYSTEM_ID, pileOf(R))
    const user = userEvent.setup()
    mount()

    const noToggle = () => {
      expect(screen.queryByTestId('sighting-log-open')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Open sighting log', hidden: true })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Close sighting log', hidden: true })).toBeNull()
    }
    // collapsed: no toggle, the log not shown
    noToggle()
    expectLogNotShown()

    await user.click(open())
    expectExpanded()
    noToggle()

    // the log, its rows and its controls are inside the Log panel and nowhere else
    expect(screen.getAllByTestId('sighting-log')).toHaveLength(1)
    const inPanel = within(panel())
    expect(inPanel.getByTestId('sighting-log')).toBeInTheDocument()
    const rows = screen.queryAllByTestId(/^sighting-row-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['sighting-row-sight-a', 'sighting-row-sight-b', 'sighting-row-sight-c'])
    for (const row of rows) expect(panel().contains(row)).toBe(true)
    expect(panel().contains(screen.getByRole('button', { name: 'Refresh sighting log' }))).toBe(true)
    expect(panel().contains(screen.getByTestId('sighting-log-load-more'))).toBe(true)

    // the tab's label carries no count: its accessible name is exactly `Log`
    expect(screen.getByRole('tab', { name: 'Log' })).toBe(tab())
    expect(tab().textContent).toBe('Log')
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.8 the log\'s three states in the panel', () => {
  const states: [string, Record<string, unknown>][] = [
    ['loading', hookResult({ data: undefined, isLoading: true })],
    ['empty', hookResult()],
    ['failed', hookResult({ data: undefined, isError: true })],
  ]
  it.each(states)('Scenario: The log\'s loading, empty and failed states appear in the panel (%s)', async (name, result) => {
    sightings.byArg.set('all', result)
    const user = userEvent.setup()
    mount()
    await user.click(open())
    expectExpanded()
    const inPanel = within(panel())
    if (name === 'loading') {
      expect(inPanel.getByText('Reading the pile…')).toBeInTheDocument()
      expect(inPanel.queryByTestId('sighting-log-empty')).toBeNull()
      expect(inPanel.queryByTestId('sighting-log-error')).toBeNull()
    } else if (name === 'empty') {
      expect(inPanel.getByTestId('sighting-log-empty')).toBeInTheDocument()
      expect(inPanel.queryByText('Reading the pile…')).toBeNull()
    } else {
      const err = inPanel.getByTestId('sighting-log-error')
      expect(within(err).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(inPanel.queryByText('Reading the pile…')).toBeNull()
    }
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.9 the settled report\'s link', () => {
  const LINK = { name: 'Open the sighting log' }

  it('Scenario: A settled sweep\'s report link expands a collapsed dock to the Log tab / Scenario: The report\'s link to the log moves focus to the Log tab (dock collapsed)', async () => {
    scanState.settled = SETTLED_SCAN
    const user = userEvent.setup()
    mount()
    expectCollapsed()
    expect(screen.getByTestId('scan-report')).toBeInTheDocument()
    await user.click(screen.getByRole('button', LINK))
    expectExpanded()
    expect(tab()).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tab())
    expect(within(panel()).getByTestId('sighting-log')).toBeInTheDocument()
  })

  it('Scenario: A settled sweep\'s report link does not collapse an expanded dock / Scenario: The report\'s link to the log moves focus to the Log tab (dock already expanded)', async () => {
    scanState.settled = SETTLED_SCAN
    const user = userEvent.setup()
    mount()
    await user.click(open())
    expectExpanded()
    await user.click(screen.getByRole('button', LINK))
    expectExpanded() // a toggling implementation collapses here
    expect(tab()).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tab())
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.10 ghost activation against the dock', () => {
  it('Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed / Scenario: The row for an activated ghost is highlighted when the tab is next shown', async () => {
    const rec = record('sight-ghost')
    sightings.byArg.set(SYSTEM_ID, pileOf([rec]))
    sightings.byArg.set('all', pileOf([rec]))
    const user = userEvent.setup()
    mount()
    expectCollapsed()
    const ghost = screen.getByTestId('mock-ghost-sight-ghost')
    expect(ghost).toHaveAttribute('data-highlighted', 'false')

    await user.click(ghost)
    expect(region()).toHaveAttribute('hidden') // still collapsed
    expect(screen.getByTestId('mock-ghost-sight-ghost')).toHaveAttribute('data-highlighted', 'true')

    await user.click(open())
    expectExpanded()
    expect(within(panel()).getByTestId('sighting-row-sight-ghost')).toHaveAttribute('data-highlighted', 'true')
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.11 the waiting indication', () => {
  function loadingInterior() {
    useSystemSpace.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() })
  }

  it('Scenario: The log reads nothing until the interior read\'s first load has finished / Scenario: The panel shows a waiting indication while the interior read\'s first load is in flight', async () => {
    loadingInterior()
    const user = userEvent.setup()
    mount()
    // collapsed
    expect(sightings.calls.filter((c) => c === null)).toHaveLength(0)
    expect(screen.queryByTestId('sighting-log')).toBeNull()

    await user.click(open())
    expectExpanded()
    expect(sightings.calls.filter((c) => c === null)).toHaveLength(0)
    expect(screen.queryByTestId('sighting-log')).toBeNull()
    const waiting = within(panel()).getByTestId('console-panel-waiting')
    expect(waiting.textContent ?? '').not.toBe('')
    expect(waiting.textContent).not.toContain('Reading the pile')
  })

  it('Scenario: The panel shows the log once the interior read\'s first load has answered or failed (answers)', async () => {
    loadingInterior()
    const user = userEvent.setup()
    const view = mount()
    await user.click(open())
    expect(within(panel()).getByTestId('console-panel-waiting')).toBeInTheDocument()

    useSystemSpace.mockReturnValue(answeredInterior())
    act(() => view.again())
    expectExpanded() // same view, not remounted
    expect(screen.queryByTestId('console-panel-waiting')).toBeNull()
    expect(within(panel()).getByTestId('sighting-log')).toBeInTheDocument()
  })

  it('Scenario: The panel shows the log once the interior read\'s first load has answered or failed (fails)', async () => {
    loadingInterior()
    const user = userEvent.setup()
    const view = mount()
    await user.click(open())
    expect(within(panel()).getByTestId('console-panel-waiting')).toBeInTheDocument()

    useSystemSpace.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn() })
    act(() => view.again())
    expectExpanded()
    expect(screen.queryByTestId('console-panel-waiting')).toBeNull()
    expect(within(panel()).getByTestId('sighting-log')).toBeInTheDocument()
  })
})

describe('SystemSpaceView + ConsoleDock - task 2.13 the dock\'s publication and its occupants', () => {
  it('Scenario: No floating surface is covered by or covers the collapsed dock / Scenario: No floating surface is covered by or covers the expanded dock (structural half: the published property, the lane classes, the column testid)', () => {
    sightings.byArg.set(SYSTEM_ID, hookResult({ data: undefined, isError: true }))
    const view = mount()
    const prop = () => document.documentElement.style.getPropertyValue(CONSOLE_DOCK_HEIGHT_VAR)

    expect(screen.getByTestId('sightings-unavailable')).toBeInTheDocument()
    expect(prop()).toBe('3.5rem')
    expect(screen.getByTestId('sightings-unavailable')).toHaveClass(CONSOLE_DOCK_LANE_LEFT_CENTER)
    expect(screen.getByTestId('space-command-column')).toHaveClass(CONSOLE_DOCK_LANE_COLUMN)

    fireEvent.click(open())
    expectExpanded()
    expect(prop()).toBe('13.75rem')
    expect(screen.getByTestId('sightings-unavailable')).toHaveClass(CONSOLE_DOCK_LANE_LEFT_CENTER)
    expect(screen.getByTestId('space-command-column')).toHaveClass(CONSOLE_DOCK_LANE_COLUMN)

    view.unmount()
    expect(prop()).toBe('')
  })
})
