import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, act, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// `system-space-view`'s ADDED "A Settled Sweep and the Scan Controls Are
// Reachable and Announced" — QA coverage gap: no test confirmed the settle
// announcement actually lands in the view's shared `role="status"` polite
// live region (`space-announcer`), the SAME mechanism a burn/jump/mine
// landing already uses. Mirrors `SystemSpaceView.scan-refetch.test.tsx`'s
// established fake-timer harness, driving the REAL `ScanSweepWatcher`
// (mounted inside `SystemSpaceView`) rather than asserting against an
// invented callback shape.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'
const FLEET_ID = 'fleet_1'

const settledScanRefetch = vi.fn()
const runningScanData: { data: { id: string; committedAt: number; eta: number } | null; refetch: ReturnType<typeof vi.fn> } = { data: null, refetch: vi.fn() }

const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), reset: vi.fn(), isPending: false, isError: false, error: null })
  return {
    order: make(), jump: make(), cutDrive: make(), stop: make(), mine: make(), hold: make(), release: make(),
    sell: make(), refuel: make(), cancelAction: make(), scan: make(),
  }
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
vi.mock('@/hooks/use-system-space', () => ({ useSystemSpace: (id: string) => useSystemSpace(id) }))
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: () => ({ data: { pages: [{ sightings: [], nextCursor: '' }] }, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-actions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-actions')
  return {
    ...actual,
    useRunningMine: () => useRunningMine(),
    useCancelAction: () => mutations.cancelAction,
    useRunningScan: () => runningScanData,
  }
})
vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => ({ data: { targets: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useScan: () => mutations.scan,
  useSettledScan: () => ({
    data: null,
    isError: false,
    refetch: settledScanRefetch,
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

const INTERIOR = {
  systemId: SYSTEM_ID, extent: 200, character: 'normal', starClass: 'M', worldTime: T0, scale: 1,
  features: [{ id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 }],
  laneGates: [], contacts: [],
}

function ownFleet() {
  return {
    id: FLEET_ID, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 5, Y: 0, Z: 0 }, attachedTo: undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
  }
}

function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => undefined) })
  useMyFleets.mockReturnValue({ data: [ownFleet()], isLoading: false, isError: false, refetch: vi.fn(async () => undefined) })
  useRunningMine.mockReturnValue({ data: null })
  runningScanData.data = { id: 'action_running_1', committedAt: T0 - 1_000, eta: T0 + 5_000 }
  stage.available = true
  stage.firstFrame = true
})

describe('SystemSpaceView — a settled sweep is announced through the shared polite live region (system-space-view "A Settled Sweep and the Scan Controls Are Reachable and Announced")', () => {
  it('names that records were filed, in the SAME role="status" live region a burn/jump/mine landing already uses', async () => {
    settledScanRefetch.mockResolvedValue({ data: { id: 'action_running_1', resolvedAt: T0 + 5_100, eta: T0 + 5_000 } })

    vi.useFakeTimers()
    try {
      render()
      const announcer = screen.getByTestId('space-announcer')
      expect(announcer.getAttribute('role')).toBe('status')
      expect(announcer.getAttribute('aria-live')).toBe('polite')
      expect(announcer.textContent).toBe('')

      // Past the sweep's ETA plus the view's own cushion.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000)
      })

      expect(
        announcer.textContent,
        'system-space-view "A Settled Sweep and the Scan Controls Are Reachable and Announced": the settled ' +
          'sweep\'s outcome never reached the shared polite live region',
      ).toMatch(/scan|sweep/i)
    } finally {
      vi.useRealTimers()
    }
  })
})
