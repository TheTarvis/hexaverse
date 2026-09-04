import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// task 8.8 (`sighting-log`'s "The Log Reads on Mount, After a Sweep
// Settles, and on Explicit Refresh — Never on a Timer": "The mount read
// obeys the same ordering as the post-ETA one... a mount-time pile read
// issued alongside that opening interior read returns before the records
// exist — showing an empty log for a sweep that worked, with nothing
// scheduled to correct it").
//
// A NEW FILE, distinct from `SystemSpaceView.scan-refetch.test.tsx` (which
// covers the POST-ETA SCHEDULED refetch ordering — a sweep whose ETA passes
// WHILE THE VIEW IS ALREADY OPEN). This file covers the MOUNT-TIME race
// design.md Decision 7 calls "the likelier race": a sweep whose ETA passed
// WHILE THE VIEW WAS CLOSED, so the very FIRST interior read (not a
// scheduled refetch) is what settles it — and the sightings pile's own
// FIRST read must not be issued until that first interior read completes.
//
// SDET-CHOSEN CONTRACT (open to a mechanical-rename dispute, not a
// behavior dispute): the pile read this file observes is `useSightings`'s
// own `enabled` gate — the standard React Query mechanism for deferring a
// query — captured here as the second argument's `enabled` field. A
// developer gating this some other way (e.g. an internal ref inside a
// bespoke hook) should raise the naming as a dispute; the BEHAVIOR under
// test — no pile read fires until the settling interior read has
// completed — is what this file actually asserts, via the mock's own call
// history, not via the exact gating mechanism's name.
//
// EXPECTED RED TODAY: `SystemSpaceView.tsx` calls neither `useSightings`
// nor anything resembling a sighting-log mount gate at all — the spy below
// is simply never invoked, which is an honest, real "this ordering rule
// does not exist yet" red, not a broken harness.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()
const fleetsRefetch = vi.fn()

// Every call `useSightings` receives, in order — `{systemId, enabled}` or
// whatever shape the real hook settles on; captured loosely (`unknown[]`)
// so this file does not over-fit a signature no task text pins.
const sightingsCalls: unknown[] = []

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
    // A running sweep whose ETA is already PAST at mount — the exact
    // fixture this scenario needs: a sweep that settles on the FIRST
    // interior read, not on a later scheduled one.
    useRunningScan: () => ({ data: { id: 'action_past_eta', eta: 21_175_105_953 }, refetch: vi.fn() }),
  }
})
vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => ({ data: { targets: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useScan: () => mutations.scan,
  useSettledScan: () => ({ data: null, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: (...args: unknown[]) => {
    sightingsCalls.push(args)
    return { data: { pages: [{ sightings: [], nextCursor: '' }] }, isLoading: false, isError: false, refetch: vi.fn() }
  },
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
}))
vi.mock('@/hooks/use-galaxy', () => ({
  useGalaxy: () => ({ data: undefined, isLoading: false, isError: false, isStartArea: false }),
}))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: { uid: 'u1' }, authLoading: false, isAdmin: false }),
}))
vi.mock('@/hooks/use-burn-preview', () => ({
  useBurnPreview: () => ({ data: undefined, isLoading: false, isError: false, isFetching: false }),
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
    return ReactMod.createElement('div', { 'data-testid': 'space-canvas-region' })
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

function ownFleet(id: string) {
  return {
    id, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 0, Y: 0, Z: 0 }, attachedTo: undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
  }
}

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  sightingsCalls.length = 0
  useRunningMine.mockReturnValue({ data: null })
  useMyFleets.mockReturnValue({ data: [ownFleet('fleet_1')], isLoading: false, isError: false, refetch: fleetsRefetch })
  stage.available = true
  stage.firstFrame = true
})

describe('SystemSpaceView / SightingLog — the mount-time settle-ordering race (sighting-log task 8.8)', () => {
  // Scenario: A mount during an unsettled past-ETA sweep reads the pile
  // after the settling read.
  it('issues no pile read while the settling interior read is still in flight, then one once it completes', async () => {
    // GIVEN: an own fleet with a sweep whose ETA has already passed
    // (mocked above), and the FIRST interior read — the one that settles
    // it — still in flight at mount (isLoading: true, no data yet).
    useSystemSpace.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    })

    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)

    // WHILE the settling interior read is still in flight, no pile read
    // may have been issued yet.
    expect(
      sightingsCalls.length,
      'a pile read was issued before the settling interior read completed — the exact race design.md ' +
        'Decision 7 calls "the likelier race"',
    ).toBe(0)

    // WHEN the settling interior read completes...
    useSystemSpace.mockReturnValue({
      data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    await act(async () => {
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SystemSpaceView systemId={SYSTEM_ID} />
        </QueryClientProvider>,
      )
    })

    // ...THEN the pile read is issued (and its own `enabled`/readiness
    // gate, if the implementation exposes one, must not still be false).
    expect(
      sightingsCalls.length,
      'the pile was never read at all, even after the settling interior read completed',
    ).toBeGreaterThan(0)
  })
})
