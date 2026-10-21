import { it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Historical ghost reads remain independent of HUD visibility after removing
// the obsolete Command and Console compositions.

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

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sightings.byArg.clear()
  sightings.calls.length = 0
  scanState.settled = null
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  setReads()
})

function expectNoConsole() {
  expect(screen.queryByRole('button', { name: 'Console' })).not.toBeInTheDocument()
  expect(screen.queryByTestId('console-dock-region')).not.toBeInTheDocument()
  expect(screen.queryByTestId('sighting-log')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open the sighting log' })).not.toBeInTheDocument()
}

it('delays historical ghost reads until the interior answers; never mounts the removed unfiltered log', () => {
  useSystemSpace.mockReturnValue({ data: undefined, isLoading: true, isFetching: true, isError: false, refetch: vi.fn() })
  const view = mount()
  expect(sightings.calls).toEqual([])
  useSystemSpace.mockReturnValue(answeredInterior())
  act(() => view.again())
  expect(sightings.calls).toContain(SYSTEM_ID)
  expect(sightings.calls).not.toContain(null)
  expectNoConsole()
})

it('preserves disclosed historical ghosts and highlight interaction while panels are hidden', () => {
  sightings.byArg.set(SYSTEM_ID, pileOf([record('retained')]))
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
  const ghost = screen.getByTestId('mock-ghost-retained')
  fireEvent.click(ghost)
  expect(ghost).toHaveAttribute('data-highlighted', 'true')
  expectNoConsole()
})

it('starts another system without a Console destination or an unfiltered log read', () => {
  const view = mount()
  view.goTo(OTHER_SYSTEM_ID)
  expectNoConsole()
  expect(sightings.calls).toContain(OTHER_SYSTEM_ID)
  expect(sightings.calls).not.toContain(null)
})
