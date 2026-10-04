import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// tasks.md 6.6-6.10, 8.8 (`system-space-view`'s ADDED "A Running Sweep
// Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the
// Pile"; `sighting-log`'s "The Log Reads on Mount, After a Sweep Settles,
// and on Explicit Refresh").
//
// A NEW FILE, not an edit to the existing (much larger) SystemSpaceView.
// test.tsx — that file is handed-off and immutable; this addendum exercises
// ONLY the ordering rule this change adds, reusing that file's own
// established mocking technique (fake timers + refetch spies) verbatim
// (see its "SystemSpaceView — realtime refetch rules" describe block).
//
// WHY THIS ORDERING MATTERS MOST OF ALL (README lesson two / design.md
// Decision 7): reading the pile and the inbox each settle nothing and mint
// nothing. If either fires CONCURRENTLY with the interior refetch that
// settles a due sweep, it can return before the sweep has resolved — an
// empty log and a still-running action for a sweep that worked. A test that
// only asserts "all three eventually fire" (never their ORDER) cannot catch
// this — the exact shape of the lesson this repo has already been burned by
// twice on this chain.
//
// EXPECTED RED TODAY: `SystemSpaceView.tsx` has no scan-refetch logic at
// all yet — no per-own-fleet `useRunningScan` fan-out, no post-settle
// sightings/inbox refetch. Every assertion below observes a spy that is
// simply never called (not a crash, not a compile error): a real, honest
// "the behavior described does not exist yet" red.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const interiorRefetch = vi.fn(async (): Promise<void> => undefined)
const fleetsRefetch = vi.fn()
const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

// Keyed by fleetId, so this file can drive "which own fleet has a running
// sweep" independently of the acting-fleet selection (task 6.6's own
// scenario: a NON-acting fleet's sweep must still schedule a refetch).
const runningScanByFleet = vi.hoisted(() => new Map<string, { id: string; eta: number } | null>())
const sightingsRefetch = vi.fn()
const runningScanRefetchCalls: string[] = []
const settledScanRefetchCalls: string[] = []

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
    useRunningScan: (fleetId: string | null) => {
      const data = fleetId ? (runningScanByFleet.get(fleetId) ?? null) : null
      return {
        data,
        refetch: vi.fn(() => {
          if (fleetId) runningScanRefetchCalls.push(fleetId)
        }),
      }
    },
  }
})
vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => ({ data: { targets: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useScan: () => mutations.scan,
  useSettledScan: (fleetId: string | null) => ({
    data: null,
    isError: false,
    refetch: vi.fn(() => {
      if (fleetId) settledScanRefetchCalls.push(fleetId)
    }),
  }),
}))
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: (systemId?: string | null) => ({
    data: { pages: [{ sightings: [], nextCursor: '' }] },
    isLoading: false,
    isError: false,
    refetch: (...args: unknown[]) => sightingsRefetch(systemId, ...args),
  }),
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
  // add-vitals-strip RULING 32: SystemSpaceView now calls
  // useCorporationSessionOptional for the strip's credits-staleness rule;
  // useCorporationOptional structurally cannot satisfy it (no isError). This
  // file's own assertions are untouched — only the mock's exported surface
  // is extended to match the module it mocks.
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

function ownFleet(id: string, over: Record<string, unknown> = {}) {
  return {
    id, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 0, Y: 0, Z: 0 }, attachedTo: undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
    ...over,
  }
}

function setReads() {
  useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: interiorRefetch })
  useMyFleets.mockReturnValue({ data: [ownFleet('fleet_1'), ownFleet('fleet_2')], isLoading: false, isError: false, refetch: fleetsRefetch })
}

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  runningScanByFleet.clear()
  runningScanRefetchCalls.length = 0
  settledScanRefetchCalls.length = 0
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  setReads()
})

describe('SystemSpaceView — a running sweep self-schedules the settle refetch, per own fleet', () => {
  // Scenario: Each own fleet's running sweep schedules the refetch that
  // settles it — including a NON-ACTING fleet's.
  it('Scenario: A non-acting fleet\'s running sweep still schedules a refetch at its ETA', async () => {
    vi.useFakeTimers()
    try {
      // fleet_1 is the acting fleet (roster's default first-of-here); fleet_2
      // has the running sweep and is never selected.
      runningScanByFleet.set('fleet_2', { id: 'action_sweep_2', eta: T0 + 5_000 })
      render(<SystemSpaceView systemId={SYSTEM_ID} />)
      interiorRefetch.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000)
      })
      expect(interiorRefetch, 'no refetch before the sweep\'s ETA').not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000)
      })
      expect(interiorRefetch, 'a refetch shortly after the non-acting fleet\'s sweep ETA').toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: No sweep refetch is scheduled when no own fleet is sweeping.
  it('Scenario: No sweep-driven refetch is scheduled when no own fleet has a running sweep', async () => {
    vi.useFakeTimers()
    try {
      render(<SystemSpaceView systemId={SYSTEM_ID} />)
      interiorRefetch.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      // The baseline poll (BOARD_POLL_MS, 20s) still fires — this scenario
      // is about the ABSENCE of an ADDITIONAL, sweep-driven trigger, so the
      // assertion is on count, not on zero calls outright.
      const baselineCalls = interiorRefetch.mock.calls.length
      expect(baselineCalls, 'the baseline poll alone, not a phantom sweep trigger').toBeLessThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView — the pile and both inbox reads refetch only AFTER the settling interior read completes', () => {
  // Scenario: The pile and the inbox are refetched only after the settling
  // read completes / Both inbox reads are refetched, not one.
  it('Scenario: sightings and inbox refetches are not issued until the interior refetch\'s promise resolves', async () => {
    vi.useFakeTimers()
    try {
      let resolveInterior: () => void = () => {}
      interiorRefetch.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveInterior = resolve
          }),
      )
      runningScanByFleet.set('fleet_1', { id: 'action_sweep_1', eta: T0 + 5_000 })
      render(<SystemSpaceView systemId={SYSTEM_ID} />)
      sightingsRefetch.mockClear()
      runningScanRefetchCalls.length = 0
      settledScanRefetchCalls.length = 0

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_500)
      })
      // The interior refetch has been ISSUED (its promise is pending) but has
      // NOT YET RESOLVED — the follower reads must not have fired yet.
      expect(sightingsRefetch, 'the pile must not refetch before the settling read completes').not.toHaveBeenCalled()
      expect(
        runningScanRefetchCalls.length + settledScanRefetchCalls.length,
        'neither inbox read may refetch before the settling read completes',
      ).toBe(0)

      await act(async () => {
        resolveInterior()
        await Promise.resolve()
      })
      expect(sightingsRefetch, 'the pile refetches once the settling read has completed').toHaveBeenCalled()
      // link8b-adversary-r11 (F11-1's currency check; adjudicated TEST DEFECT
      // on the pre-existing disjunction below, ORCHESTRATOR-AUTHORIZED per
      // the TDD protocol's "developer's test dispute in the developer's
      // favor" cause): task 6.7 demands "assert both inbox reads and the
      // scan-target read are re-issued", but
      // `A.includes('fleet_1') || B.includes('fleet_1')` is satisfied by
      // EITHER call alone -- dropping `settledScan.refetch()` (or, symmetrically,
      // `runningScan.refetch()`) from `ScanSweepWatcher` would leave this
      // assertion green. Split into two independent assertions, one per
      // inbox read, per the task's own text ("Both inbox reads are
      // refetched, not one" is this same file's OWN scenario title above).
      expect(
        runningScanRefetchCalls.includes('fleet_1'),
        'system-space-view "Both inbox reads are refetched, not one": the sweeping fleet\'s RUNNING-status ' +
          'inbox read was not refetched after settlement',
      ).toBe(true)
      expect(
        settledScanRefetchCalls.includes('fleet_1'),
        'system-space-view "Both inbox reads are refetched, not one": the sweeping fleet\'s SETTLED-status ' +
          'inbox read was not refetched after settlement',
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
