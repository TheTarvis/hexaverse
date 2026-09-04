// RED-phase(-ish) suite for the rebuilt `hooks/use-fleets.ts`
// (migrate-fleet-to-continuous-burns, tasks.md 8.1: the old use-fleets.ts —
// and its paired test — were deleted wholesale; this file is the fresh
// replacement `code-quality-checks`'s frontend-test-coverage validator
// requires). No SDET suite pins this hook's exact shape (FleetRoster.test.tsx
// mocks the whole module and only requires `useMyFleets` to exist), so its
// internal contract — which verb each hook commits, and what it invalidates
// — is this implementer's own design decision, tested directly against
// design.md's endpoint list (Decision 10, "the fleet contract") rather than
// against the implementation itself.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCutDrive,
  useHold,
  useJump,
  useMine,
  useMyFleets,
  useOrder,
  useRelease,
  useStop,
} from './use-fleets'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { Fleet, MineCommit } from '@/lib/types/fleet'

vi.mock('@/lib/services', () => ({
  fleetService: {
    listMine: vi.fn(),
    order: vi.fn(),
    cutDrive: vi.fn(),
    stop: vi.fn(),
    jump: vi.fn(),
    mine: vi.fn(),
    hold: vi.fn(),
    release: vi.fn(),
  },
}))

const mockService = vi.mocked(fleetService)

const parkedFleet: Fleet = {
  id: 'fleet_1',
  corporationId: 'corp',
  systemId: 'sys-0',
  state: { Mode: 1, Burn: null, Park: null, Drift: null },
  position: { X: 0, Y: 0, Z: 0 },
  own: true,
  worldTime: 0,
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return { Wrapper, qc }
}

describe('useMyFleets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the requester’s own fleets across systems', async () => {
    mockService.listMine.mockResolvedValue([parkedFleet])
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useMyFleets(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.listMine).toHaveBeenCalled()
    expect(result.current.data).toEqual([parkedFleet])
  })

  it('honours an `enabled: false` override (the logged-out start area)', async () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useMyFleets({ enabled: false }), { wrapper: Wrapper })

    await Promise.resolve()
    expect(mockService.listMine).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useOrder — fleet-movement "In-System Burn Order to a Body or a Point"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('commits a burn through fleetService.order and invalidates the fleet + board reads', async () => {
    mockService.order.mockResolvedValue({ ...parkedFleet, attachedTo: undefined })
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useOrder(), { wrapper: Wrapper })
    result.current.mutate({ fleetId: 'fleet_1', request: { bodyId: 'body-1' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.order).toHaveBeenCalledWith('fleet_1', { bodyId: 'body-1' })
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.mine())
    expect(keys).toContainEqual(queryKeys.fleets.detail('fleet_1'))
    expect(keys).toContainEqual(queryKeys.systemSpace.detail('sys-0'))
  })
})

describe('useCutDrive — fleet-movement "Cut Drive Converts the Burn to a Drift and Goes Dark"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts to the cut-drive endpoint with no body', async () => {
    mockService.cutDrive.mockResolvedValue(parkedFleet)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useCutDrive(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.cutDrive).toHaveBeenCalledWith('fleet_1')
  })
})

describe('useStop — fleet-movement "Stop In Place Commits a Velocity-Nulling Burn"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts to the stop endpoint', async () => {
    mockService.stop.mockResolvedValue(parkedFleet)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useStop(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.stop).toHaveBeenCalledWith('fleet_1')
  })
})

describe('useJump — fleet-movement "Lane Jump From a Docked Gate"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts the laneId to the jump endpoint', async () => {
    mockService.jump.mockResolvedValue(parkedFleet)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useJump(), { wrapper: Wrapper })
    result.current.mutate({ fleetId: 'fleet_1', laneId: 'lane-9' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.jump).toHaveBeenCalledWith('fleet_1', 'lane-9')
  })
})

describe('useMine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('commits a mine run and invalidates the fleet, board, and running-actions reads', async () => {
    const commit: MineCommit = { actionId: 'action_1', eta: 90_000, worldTime: 0 }
    mockService.mine.mockResolvedValue(commit)
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useMine('sys-0'), { wrapper: Wrapper })
    result.current.mutate({
      fleetId: 'fleet_1',
      request: { featureId: 'body-1', kind: 'metals', tons: 40 },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.mine).toHaveBeenCalledWith('fleet_1', {
      featureId: 'body-1',
      kind: 'metals',
      tons: 40,
    })
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.mine())
    expect(keys).toContainEqual(queryKeys.fleets.detail('fleet_1'))
    expect(keys).toContainEqual(queryKeys.systemSpace.detail('sys-0'))
    expect(keys).toContainEqual(queryKeys.actions.running('fleet_1'))
  })
})


// --- add-scan-and-sightings-surface, tasks.md 4.9 (F4, link8b-adversary-
// r8): cut drive, stop, hold and release each rewrite the fleet's served
// kinematic state with NO scheduled ETA to land later, so each must ALSO
// invalidate that fleet's scan-target list — never asserted by an SDET
// suite (this hook carries no pinned shape at all, per this file's own
// header comment), so it gets its own test here.
describe('useCutDrive / useStop / useHold / useRelease — each also invalidates the acting fleet\'s scan-target list (F4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('useCutDrive invalidates queryKeys.fleets.scanTargets(fleetId)', async () => {
    mockService.cutDrive.mockResolvedValue(parkedFleet)
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCutDrive(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.scanTargets('fleet_1'))
  })

  it('useStop invalidates queryKeys.fleets.scanTargets(fleetId)', async () => {
    mockService.stop.mockResolvedValue(parkedFleet)
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useStop(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.scanTargets('fleet_1'))
  })

  it('useHold invalidates the fleet read and queryKeys.fleets.scanTargets(fleetId)', async () => {
    mockService.hold.mockResolvedValue(parkedFleet)
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useHold(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.hold).toHaveBeenCalledWith('fleet_1')
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.mine())
    expect(keys).toContainEqual(queryKeys.fleets.scanTargets('fleet_1'))
  })

  it('useRelease invalidates the fleet read and queryKeys.fleets.scanTargets(fleetId)', async () => {
    mockService.release.mockResolvedValue(parkedFleet)
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useRelease(), { wrapper: Wrapper })
    result.current.mutate('fleet_1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.release).toHaveBeenCalledWith('fleet_1')
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(queryKeys.fleets.mine())
    expect(keys).toContainEqual(queryKeys.fleets.scanTargets('fleet_1'))
  })

  it('useOrder and useJump do NOT invalidate scan-targets at commit time (they land later, via the ETA-scheduled refetch)', async () => {
    mockService.order.mockResolvedValue({ ...parkedFleet, attachedTo: undefined })
    mockService.jump.mockResolvedValue({ ...parkedFleet, attachedTo: undefined })
    const { Wrapper, qc } = createWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const order = renderHook(() => useOrder(), { wrapper: Wrapper })
    order.result.current.mutate({ fleetId: 'fleet_1', request: { bodyId: 'body-1' } })
    await waitFor(() => expect(order.result.current.isSuccess).toBe(true))

    const jump = renderHook(() => useJump(), { wrapper: Wrapper })
    jump.result.current.mutate({ fleetId: 'fleet_1', laneId: 'lane-1' })
    await waitFor(() => expect(jump.result.current.isSuccess).toBe(true))

    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).not.toContainEqual(queryKeys.fleets.scanTargets('fleet_1'))
  })
})
