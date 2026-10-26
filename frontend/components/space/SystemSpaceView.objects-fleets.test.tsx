import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Objects fleet increment: real parent, index, selection hook and console; mocked network reads and GPU stage.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

const shared = vi.hoisted(() => ({ fleetRefetch: vi.fn(), refetch: vi.fn(), fetchNextPage: vi.fn(), picks: { count: 0 } }))
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
// fleet inspection, the selection and acting fleet as attributes, and a
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
        'data-focus-fleet': props.focusFleetRequest?.id ?? props.focusFleetRequest?.fleetId ?? '',
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
  return { data: list, isLoading: false, isError: false, refetch: shared.fleetRefetch }
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = <QueryClientProvider client={qc}><SystemSpaceView systemId={SYSTEM_ID} /></QueryClientProvider>
  const view = rtlRender(tree)
  return { ...view, refresh: () => view.rerender(<QueryClientProvider client={qc}><SystemSpaceView systemId={SYSTEM_ID} /></QueryClientProvider>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  life.created = []; life.disposed = []
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


const life = vi.hoisted(() => ({ created: [] as string[], disposed: [] as string[] }))
vi.mock('./SpacecraftPreview', () => ({ SpacecraftPreview: ({ objectId, kind, accentColor }: { objectId: string; kind: string; accentColor: number }) => {
  React.useEffect(() => { life.created.push(objectId); return () => { life.disposed.push(objectId) } }, [objectId])
  return <div data-testid="test-preview" data-object={objectId} data-kind={kind} data-accent={accentColor} />
} }))
const row = (id: string) => screen.getByTestId(`index-fleet-${id}`)
const canvas = () => screen.getByTestId('space-canvas-region')
function showIndex() { const launcher = screen.queryByRole('button', { name: 'Objects (hidden)' }); if (launcher) fireEvent.click(launcher); expect(screen.getByTestId('system-index-search')).toBeVisible() }
function inspect(id = 'fleet_2') { fireEvent.click(row(id)) }
function seedPair() { useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1'), fleet('fleet_2')])) }
function noCommands() { for (const mutation of Object.values(mutations)) { expect(mutation.mutate).not.toHaveBeenCalled(); expect(mutation.mutateAsync).not.toHaveBeenCalled() } }

describe('Objects own-fleet parent integration', () => {
  it('Scenario: Local fleets join count and search', () => {
    useMyFleets.mockReturnValue(ownFleets([
      fleet('parked'), fleet('burning', { state: { Mode: 0 } }), fleet('drifting', { state: { Mode: 2 } }),
      fleet('remote', { systemId: 'elsewhere' }), fleet('transit', { jump: { toSystemId: 'elsewhere' } }),
      fleet('no-position', { position: null }), fleet('foreign', { own: false }),
    ]))
    const view = mount(); showIndex()
    for (const id of ['parked', 'burning', 'drifting']) expect(row(id)).toBeVisible()
    for (const id of ['remote', 'transit', 'no-position', 'foreign']) expect(screen.queryByTestId(`index-fleet-${id}`)).toBeNull()
    expect(screen.getByTestId('system-index-results').querySelectorAll('[aria-controls="object-details"]')).toHaveLength(4)
    expect(screen.queryByTestId('test-preview')).toBeNull()
    fireEvent.change(screen.getByLabelText('Find an object'), { target: { value: 'fleet' } })
    expect(row('parked')).toBeVisible(); expect(screen.queryByTestId('index-feat-star')).toBeNull()
    useMyFleets.mockReturnValue({ ...ownFleets([fleet('parked')]), isFetching: true }); view.refresh()
    expect(row('parked')).toBeVisible()
  })
  it.each(['loading', 'failed', 'empty'] as const)('Scenario: Fleet read unavailable or empty — %s preserves body source', reason => {
    useMyFleets.mockReturnValue({ ...ownFleets(reason === 'empty' ? [] : [fleet('stale')]), isLoading: reason === 'loading', isError: reason === 'failed' })
    mount(); showIndex()
    expect(screen.queryByTestId('index-fleet-stale')).toBeNull()
    expect(screen.getByTestId('index-feat-star')).toBeEnabled()
    expect(screen.getByTestId('system-index-results').querySelectorAll('[aria-controls="object-details"]')).toHaveLength(1)
    if (reason === 'failed') {
      const alert = screen.getAllByRole('alert').find(el => /fleet/i.test(el.textContent ?? '') && within(el).queryByRole('button', { name: /retry/i }))!
      expect(alert).toBeDefined(); fireEvent.click(within(alert).getByRole('button', { name: /retry/i }))
      expect(shared.fleetRefetch).toHaveBeenCalledTimes(1); expect(shared.refetch).not.toHaveBeenCalled()
    } else if (reason === 'loading') expect(within(screen.getByRole('region', { name: 'Objects panel' })).getByText(/loading.*fleet/i)).toBeVisible()
    else expect(screen.queryByText('Fleets', { exact: true })).toBeNull()
  })
  it.each(['loading', 'failed'] as const)('Scenario: Fleet read unavailable or empty — independent interior %s leaves fleets usable', reason => {
    useSystemSpace.mockReturnValue({ ...answeredInterior(), isLoading: reason === 'loading', isError: reason === 'failed' })
    mount(); showIndex(); expect(row('fleet_1')).toBeEnabled(); inspect('fleet_1')
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-kind', 'ship')
  })
  it('Scenario: Inspect fleet without changing acting or target', async () => {
    seedPair(); mount(); showIndex(); fireEvent.click(screen.getByTestId('index-feat-star'))
    const before = canvas().getAttribute('data-acting-fleet')
    row('fleet_2').focus(); await userEvent.setup().keyboard('{Enter}')
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-object', 'fleet_2')
    expect(canvas()).toHaveAttribute('data-acting-fleet', before); expect(canvas()).toHaveAttribute('data-selection', 'feat-star')
    expect(screen.queryByTestId('details-plot')).toBeNull()
    const detail = screen.getByRole('heading', { name: 'fleet_2' }).closest('aside')!
    for (const text of ['Known from', 'Resources', 'Fleets here', 'Services']) expect(within(detail).queryByText(text)).toBeNull()
    noCommands()
    fireEvent.click(screen.getByTestId('mock-select-feat-star'))
    expect(screen.queryByTestId('test-preview')).toBeNull()
  })

  it('canvas fleet activation inspects without changing the command fleet or travel target', () => {
    seedPair()
    mount()
    fireEvent.click(screen.getByTestId('mock-select-feat-star'))
    const commandFleet = canvas().getAttribute('data-acting-fleet')
    fireEvent.click(screen.getByTestId('mock-activate-fleet_2'))
    expect(row('fleet_2')).toHaveAttribute('aria-pressed', 'true')
    expect(canvas()).toHaveAttribute('data-acting-fleet', commandFleet)
    expect(canvas()).toHaveAttribute('data-selection', 'feat-star')
  })
  it('Scenario: Distinct identity and explicit fleet focus — local inspection while acting remote', () => {
    sessionStorage.setItem('hexaverse:selected-fleet:v1:corp-1', 'remote')
    useMyFleets.mockReturnValue(ownFleets([fleet('remote', { systemId: 'elsewhere' }), fleet('local')]))
    mount(); showIndex(); inspect('local')
    expect(canvas()).toHaveAttribute('data-acting-fleet', 'remote')
    fireEvent.click(screen.getByRole('button', { name: /Focus.*local/i }))
    expect(canvas()).toHaveAttribute('data-focus-fleet', 'local')
    expect(canvas()).toHaveAttribute('data-acting-fleet', 'remote'); expect(canvas()).toHaveAttribute('data-selection', '')
    noCommands()
  })
  it.each(['failed', 'remote', 'transit', 'removed'] as const)('Scenario: Eligibility changes withdraw fleet details — %s cannot resurrect', reason => {
    seedPair(); const view = mount(); showIndex(); inspect()
    expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    const withdrawn = reason === 'removed' ? [fleet('fleet_1')] : [fleet('fleet_1'), fleet('fleet_2', reason === 'remote' ? { systemId: 'elsewhere' } : reason === 'transit' ? { jump: {} } : {})]
    useMyFleets.mockReturnValue({ ...ownFleets(withdrawn), isError: reason === 'failed' }); view.refresh()
    expect(screen.queryByTestId('test-preview')).toBeNull(); expect(life.disposed).toContain('fleet_2')
    seedPair(); view.refresh(); expect(row('fleet_2')).toBeVisible(); expect(screen.queryByTestId('test-preview')).toBeNull()
  })
  it('Scenario: Close hide and live status refresh', () => {
    seedPair(); const view = mount(); showIndex(); inspect()
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-accent', String(0x4ade80))
    useMyFleets.mockReturnValue(ownFleets([fleet('fleet_1'), fleet('fleet_2', { state: { Mode: 2 } })])); view.refresh()
    expect(screen.getByTestId('test-preview')).toHaveAttribute('data-accent', String(0xc4b5fd))
    expect(life.created).toEqual(['fleet_2']); expect(life.disposed).toEqual([])
    fireEvent.change(screen.getByLabelText('Find an object'), { target: { value: 'no-match' } })
    expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name: 'Objects' })); expect(screen.queryByTestId('test-preview')).toBeNull()
    showIndex(); expect(screen.getByTestId('test-preview')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('details-back')); expect(screen.queryByTestId('test-preview')).toBeNull()
  })
})
