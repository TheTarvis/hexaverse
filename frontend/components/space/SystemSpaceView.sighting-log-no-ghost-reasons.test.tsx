import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// `sighting-log`'s ADDED "A Log Row and Its Ghost Address the Same Record
// By Its Served Id" — QA finding (NO-SHIP, one MAJOR): `SightingLog.tsx`'s
// own `hasGhost` decides purely from `!cleanSweep && systemId === open` — a
// CLOSED LIST OF REASONS the requirement's own text forbids ("The log SHALL
// determine it from what the scene actually drew rather than from a list of
// reasons... a row that assumes a mark exists either does nothing or
// dereferences a missing one").
//
// Three cases the current, closed-list `hasGhost` gets WRONG, all
// exercised at the SYSTEM-SPACE-VIEW level (not by hand-feeding SightingLog
// a prop) so this test observes the REAL wiring — the real `buildSceneModel`
// pure function, mounted inside the real `SystemSpaceView` — rather than an
// assumption about a prop shape the developer has not landed yet:
//
//   (a) a target-naming record in the open system stored at the ORIGIN —
//       `buildSceneModel`'s own origin-omission rule means no mark is ever
//       drawn for it, but `hasGhost` has no idea and claims one exists.
//   (b) a record for the open system that the ghost layer's OWN single
//       bounded page did not return at all (it exists in the log's
//       unfiltered read, which pages independently) — `hasGhost` only
//       checks `systemId`, so it claims a ghost for a record the scene
//       never even received.
//   (c) ANY row, while the canvas region is unavailable — no marks are
//       drawn at all then (`system-space-view` "Ghost marks are absent
//       without error while the canvas is unavailable"), but `hasGhost`
//       has no way to know the canvas is down.
//
// EXPECTED RED TODAY: for all three, `SightingLog`'s current `hasGhost`
// wrongly reports "has a ghost" (the row highlights instead of stating "no
// mark in the open system") — confirmed by driving the REAL component tree,
// not by inventing a prop.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

// useSightings is called TWICE by the real tree with DIFFERENT arguments —
// `SightingsGhostFeed` (the ghost layer) with the open systemId, and
// `SightingLog` itself with `null` (its own unfiltered read) — so the mock
// must answer each call according to its own argument, exactly like the
// real hook's two distinct cache entries would.
const sightingsByArg = new Map<string, { sightings: Record<string, unknown>[] }>()
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: (systemId: string | null) => {
    const key = systemId ?? 'all'
    const sightings = sightingsByArg.get(key)?.sightings ?? []
    return {
      data: { pages: [{ sightings, nextCursor: '' }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    }
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
  useSettledScan: () => ({ data: null, isError: false, refetch: vi.fn() }),
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
    position: { X: 12, Y: 0, Z: 4 }, velocity: { X: 0, Y: 0, Z: 0 }, emitting: false,
    hullCount: 1, hullTypes: ['scout'],
    ...over,
  }
}

// (a) stored at the origin — the scene omits it entirely.
const ORIGIN_RECORD = record('sight-origin', { position: { X: 0, Y: 0, Z: 0 } })
// (b) in the open system, but the ghost layer's own filtered/paged read
// never returned it (simulated by simply not including it in that read's
// mocked response, while the log's unfiltered read does carry it).
const PAGE_BOUNDARY_RECORD = record('sight-beyond-page')
// (c) an ordinary record that WOULD have a real ghost when the canvas is
// available — the positive control that also stands in for the
// canvas-unavailable case.
const ORDINARY_RECORD = record('sight-ordinary', { position: { X: 40, Y: 0, Z: -10 } })

function setReads() {
  useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  useMyFleets.mockReturnValue({ data: [ownFleet()], isLoading: false, isError: false, refetch: vi.fn() })
}

function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>,
  )
}

async function openLogAndSelect(recordId: string) {
  const user = userEvent.setup()
  await user.click(screen.getByTestId('sighting-log-open'))
  await user.click(screen.getByTestId(`sighting-row-${recordId}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  sightingsByArg.clear()
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  setReads()
})

describe('SystemSpaceView + SightingLog — "no mark in the open system", determined from what the scene actually drew (sighting-log QA finding)', () => {
  it('(a) a target-naming record stored at the origin says "no mark", even though it is in the open system and not a clean sweep', async () => {
    sightingsByArg.set(SYSTEM_ID, { sightings: [ORIGIN_RECORD, ORDINARY_RECORD] })
    sightingsByArg.set('all', { sightings: [ORIGIN_RECORD, ORDINARY_RECORD] })
    render()

    await openLogAndSelect('sight-origin')
    const row = screen.getByTestId('sighting-row-sight-origin')
    expect(
      row.textContent,
      'sighting-log "A Log Row and Its Ghost Address the Same Record By Its Served Id": an origin-positioned ' +
        'record (which the scene OMITS, per its own origin rule) must state it has no mark, not claim one exists',
    ).toContain('no mark in the open system')
    expect(row.getAttribute('data-highlighted')).toBe('false')
  })

  it('(b) a record in the open system that the ghost layer\'s own single page never returned says "no mark"', async () => {
    // The ghost layer's filtered read did NOT include this record; the
    // log's own unfiltered read did — a real, arrangeable divergence
    // between the two independently-paged reads this requirement's own
    // text names explicitly.
    sightingsByArg.set(SYSTEM_ID, { sightings: [ORDINARY_RECORD] })
    sightingsByArg.set('all', { sightings: [ORDINARY_RECORD, PAGE_BOUNDARY_RECORD] })
    render()

    await openLogAndSelect('sight-beyond-page')
    const row = screen.getByTestId('sighting-row-sight-beyond-page')
    expect(
      row.textContent,
      'a record the ghost layer\'s own bounded page never drew must state it has no mark, not claim one exists ' +
        'merely because its systemId matches the open system',
    ).toContain('no mark in the open system')
    expect(row.getAttribute('data-highlighted')).toBe('false')
  })

  it('(c) any row says "no mark" while the canvas region is unavailable, even for a record that would otherwise have a real ghost', async () => {
    stage.available = false
    sightingsByArg.set(SYSTEM_ID, { sightings: [ORDINARY_RECORD] })
    sightingsByArg.set('all', { sightings: [ORDINARY_RECORD] })
    render()

    await openLogAndSelect('sight-ordinary')
    const row = screen.getByTestId('sighting-row-sight-ordinary')
    expect(
      row.textContent,
      'system-space-view "Ghost marks are absent without error while the canvas is unavailable": no mark is ' +
        'drawn at all while the canvas is down, so every row must say so',
    ).toContain('no mark in the open system')
    expect(row.getAttribute('data-highlighted')).toBe('false')
  })

  // SDET control: proves the harness CAN produce a real ghost/highlight —
  // the same ordinary record, canvas AVAILABLE, is NOT reported as having
  // no mark. Without this, all three tests above could pass vacuously
  // against a `hasGhost` that always returns false.
  it('SDET control: the identical ordinary record DOES highlight when the canvas is available and the record is genuinely drawn', async () => {
    sightingsByArg.set(SYSTEM_ID, { sightings: [ORDINARY_RECORD] })
    sightingsByArg.set('all', { sightings: [ORDINARY_RECORD] })
    render()

    await openLogAndSelect('sight-ordinary')
    const row = screen.getByTestId('sighting-row-sight-ordinary')
    expect(row.textContent).not.toContain('no mark in the open system')
    expect(row.getAttribute('data-highlighted')).toBe('true')
  })
})
