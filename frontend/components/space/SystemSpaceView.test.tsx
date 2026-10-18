import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`: *System Space View Route and Data Fan-In*,
// *Realtime Refetch Rules While the Space View Is Open*, *Departure Hand-Off
// to the Galaxy View*, *Fleet Roster Cross-Navigation*, *A Landed Resolution
// Is Announced to Assistive Technology* (tasks.md 2.1-2.5, 2.13, 2.14, 4.12,
// 4.13).
//
// THE CONTRACT — `frontend/components/space/SystemSpaceView.tsx`:
//   export function SystemSpaceView({ systemId }: { systemId: string })
//
// It fans in over exactly two independently-failing reads:
//   `useSystemSpace(systemId)`  from `@/hooks/use-system-space`
//   `useMyFleets()`             from `@/hooks/use-fleets`
// and filters the second to this system ON THE CLIENT.
//
// data-testid contract this suite fixes (the e2e suites share it):
//   space-view, space-canvas-region, space-loading,
//   space-interior-error, space-interior-retry,
//   space-fleet-panel, space-fleets-error, space-fleets-retry,
//   space-announcer            (polite live region for landed resolutions)
//   mine-section, sell-section, refuel-section, stationkeep-control,
//   mine-unavailable           (the failed-read withdrawal notice)
//   selection-prompt
// plus the roster's own existing ids (`fleet-row-*`, `fleet-cmd-*-<id>`).
//
// VACUITY NOTES inline. The structural one: every "X is shown" assertion is
// paired with an assertion that the other region is NOT in that state, so a
// component rendering all states at once fails.

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const interiorRefetch = vi.fn()
const fleetsRefetch = vi.fn()
const stationRefetch = vi.fn()
const boardRefetch = vi.fn()
const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()
// add-vitals-strip: these five previously-hardcoded market hooks are now
// mockable per test — the five station/board-failure scenarios below
// (system-space-view MODIFIED "System Space View Route and Data Fan-In")
// had NO existing coverage anywhere in the frontend suite prior to this
// change (a pre-existing gap this red phase closes, not one this change
// introduces).
const useStation = vi.fn()
const useMarketBoard = vi.fn()

// HARNESS NOTE (revised 2026-09-03, orchestrator-adjudicated — the developer
// disputed this file as unsatisfiable by an honest implementation, and the
// dispute was upheld). What was wrong was the HARNESS, not the assertions:
// this file asserts the composed view — `FleetRoster` and
// `FleetActionsPanel` mounted for real, which is precisely what the
// `fleet-roster`/`sell-section`/`refuel-section`/`stationkeep-control`/
// `mine-unavailable` assertions below are FOR — but supplied no
// QueryClientProvider, mocked `@/hooks/use-actions` without `importActual`
// (leaving `useCancelAction` undefined for the roster), and left
// `@/hooks/use-market` and `@/hooks/use-galaxy` unmocked (the latter reaching
// for an AccountProvider that no test mounts). The only implementation that
// could have gone green against that harness was one that inlined stub
// markup for the roster and the panel — a green suite over a view no player
// can use. Every assertion in this file is unchanged; only the mock surface
// and the provider wrapper below are new.
//
// The mocking rule applied here: DATA SOURCES are mocked (each read/mutation
// hook is a seam this file drives), COMPOSITION is not (no child component of
// the view is stubbed except `SpaceStage`, whose seam is WebGL).

// Stable, inert mutation results. Stable identity matters: these objects are
// returned on every render, and a fresh object each time can retrigger an
// effect that depends on one.
// The station, its venue quotes and the corporation's credit balance — the
// three server-served facts the docked panel needs and cannot invent. Hoisted
// so the module mocks above can read them.
const market = vi.hoisted(() => ({
  station: {
    systemId: 'sys_-7_17',
    featureId: 'feat-station',
    createdAt: 0,
  } as Record<string, unknown> | undefined,
  board: {
    worldTime: 21_175_110_953,
    refreshCadenceMs: 30_000,
    venues: [
      {
        venue: 'sys_-7_17',
        systemId: 'sys_-7_17',
        quotes: [
          {
            kind: 'metals',
            entries: [
              { unitPrice: 12, source: 'request', remainingQuantity: 4, requestId: 'r1' },
              { unitPrice: 5, source: 'floor', unlimited: true },
            ],
          },
        ],
      },
    ],
  } as Record<string, unknown> | undefined,
  corporation: { id: 'corp-1', name: 'SDET Corp', credits: 1250 } as Record<string, unknown> | null,
  // add-vitals-strip: mutated per-test, mirroring `stage.available`'s own
  // pattern — true simulates "resolved once, has since failed to refresh".
  corporationSessionFailed: false,
}))

const mutations = vi.hoisted(() => {
  const make = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })
  return {
    order: make(),
    jump: make(),
    cutDrive: make(),
    stop: make(),
    mine: make(),
    hold: make(),
    release: make(),
    sell: make(),
    refuel: make(),
    cancelAction: make(),
  }
})

vi.mock('@/hooks/use-system-space', () => ({ useSystemSpace: (id: string) => useSystemSpace(id) }))
vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return {
    ...actual,
    useMyFleets: () => useMyFleets(),
    useOrder: () => mutations.order,
    useJump: () => mutations.jump,
    useCutDrive: () => mutations.cutDrive,
    useStop: () => mutations.stop,
    useMine: () => mutations.mine,
    useHold: () => mutations.hold,
    useRelease: () => mutations.release,
  }
})
// `...actual` is load-bearing: the roster calls `useCancelAction`, and a
// bare object mock left it `undefined` — a TypeError inside the roster that
// no assertion in this file is about.
vi.mock('@/hooks/use-actions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-actions')
  return {
    ...actual,
    // Shaped as the REAL hook is — a React Query result, `{ data }` — not as
    // a bare action. A mock that misreports its module's own contract forces
    // the implementation to accept both shapes forever.
    useRunningMine: () => useRunningMine(),
    useCancelAction: () => mutations.cancelAction,
  }
})
// The market verbs the docked panel offers. Nothing in THIS file drives a
// sale or a refuel to completion (`FleetActionsPanel.test.tsx` owns those);
// here they need only exist so the panel mounts and its sections render.
vi.mock('@/hooks/use-market', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-market')
  return {
    ...actual,
    useMarketBoard: () => useMarketBoard(),
    useStation: (systemId: string | null) => useStation(systemId),
    useSell: () => mutations.sell,
    useRefuel: () => mutations.refuel,
  }
})
// The corporation's own session data — where the credit balance comes from
// (`docked-fleet-actions`: *Credit Balance Readout*, "sourced from the
// corporation's own session data").
vi.mock('@/components/corporation-provider', () => ({
  useCorporationOptional: () => market.corporation,
  useCorporation: () => market.corporation,
  // add-vitals-strip, impl contract §6: the strip's staleness rule ("a
  // session that resolved once and has since failed to refresh reads
  // Unavailable, not the cached figure") is unreachable through
  // `useCorporationOptional`'s bare `corporation?.credits` — this is the
  // seam `useCorporationSessionOptional` exists to close.
  // `market.corporationSessionFailed` defaults to false and is flipped per
  // test (mirrors `stage.available`'s own mutate-the-hoisted-flag pattern).
  useCorporationSessionOptional: () => ({
    corporation: market.corporation,
    isError: market.corporationSessionFailed,
  }),
}))
// The roster resolves system NAMES through the galaxy read. Mocked rather
// than provided, because the real hook reaches for `useAccountContext` and
// this file mounts no AccountProvider — the roster's naming behaviour is
// `FleetRoster.test.tsx`'s subject, not this file's.
vi.mock('@/hooks/use-galaxy', () => ({
  useGalaxy: () => ({ data: undefined, isLoading: false, isError: false, isStartArea: false }),
}))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: { uid: 'u1' }, authLoading: false, isAdmin: false }),
}))
vi.mock('@/hooks/use-burn-preview', () => ({
  useBurnPreview: () => ({ preview: null, stale: false, noQuote: false, retry: vi.fn() }),
}))
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// The stage is mocked AT ITS SEAM so this file can drive the two signals the
// view arbitrates on — renderer availability and first-frame — without a
// WebGL harness. The guard's own behaviour (creation failure, loss, restore,
// retry, diagnostics) is covered by `SpaceStage.renderer.test.tsx` and by the
// shared `components/render-guard` suite; what is under test HERE is the
// view's precedence rules between those signals and its two data reads.
const stage = vi.hoisted(() => ({ available: true, firstFrame: true }))
vi.mock('./SpaceStage', async () => {
  const React = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function SpaceStageMock(props: any) {
    React.useEffect(() => {
      props.onAvailabilityChange?.(stage.available)
      if (stage.available && stage.firstFrame) props.onFirstFrame?.()
    }, [props])
    return React.createElement(
      'div',
      {
        'data-testid': 'space-canvas-region',
        // add-vitals-strip: exposed so "activating the strip changes no
        // space-view selection" is assertable from OUTSIDE — the view's
        // `selection` state has no other observable surface at this mock
        // boundary.
        'data-selection': props.selection ? (props.selection.bodyId ?? 'point') : '',
        'data-fleet-states': (props.scene?.marks ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((m: any) => m.kind === 'fleet')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => m.id)
          .join(','),
      },
      stage.available ? null : React.createElement('div', { 'data-testid': 'renderer-unsupported' }, 'WebGL unavailable'),
      // A minimal, test-only trigger for the real `onSelect` callback the
      // view passes down — the mock otherwise renders no pickable surface
      // at all (that surface is SpaceStage's own seam, out of THIS file's
      // scope).
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'mock-select-body', onClick: () => props.onSelect?.({ bodyId: 'feat-body-0' }) },
        'select',
      ),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

// MIGRATION NOTE (task 9.4, openspec change `add-figure-formatting`): the
// credit-balance integration assertion below moves off a loose text regex
// (which happens to still match the formatted `₡ 1,250` text and would
// therefore be a tautological non-migration) onto `balance-figure`'s
// data-raw, the strong assertion task 9.4 calls for.

const T0 = 21_175_110_953
const SYSTEM_ID = 'sys_-7_17'

const INTERIOR = {
  systemId: SYSTEM_ID,
  extent: 658.7081316032265,
  character: 'normal',
  starClass: 'M',
  worldTime: T0,
  scale: 1,
  features: [
    { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 },
    {
      id: 'feat-body-0',
      type: 'rocky',
      space: { X: 18, Y: -3, Z: -15 },
      size: 1.76,
      resources: [{ kind: 'metals', richness: 0.3 }],
      orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18591, phase: 373097, inclination: 500434, node: 205958 },
    },
    {
      id: 'feat-station',
      type: 'station',
      space: { X: -22, Y: 0, Z: 9 },
      size: 0.6,
      resources: [],
      orbitElements: { parentId: 'feat-star', radius: 32, periodMs: 72000, phase: 10, inclination: 0, node: 0 },
    },
  ],
  laneGates: [
    {
      // The SERVED gate body id (tasks.md 9.1b, adjudicated after this
      // file's red handoff). It is what a burn order names and what
      // `attachedTo` reports — never reconstructed client-side.
      id: 'gate-sys_-6_16',
      destSystemId: 'sys_-6_16',
      laneId: 'lane_-7_17_-6_16',
      space: { X: 694, Y: 0, Z: -207 },
      size: 1.2,
      orbitElements: { parentId: 'feat-star', radius: 724.57, periodMs: 0, phase: 1000101, inclination: 0, node: 0 },
    },
  ],
  contacts: [],
}

function dockedFleet(over: Record<string, unknown> = {}) {
  return {
    id: 'fleet_1',
    corporationId: 'corp-1',
    systemId: SYSTEM_ID,
    own: true,
    worldTime: T0,
    scale: 1,
    position: { X: 18, Y: -3, Z: -15 },
    attachedTo: 'feat-body-0',
    state: {
      Mode: 1,
      Burn: null,
      Drift: null,
      Park: { Kind: 0, BodyId: 'feat-body-0', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    },
    roster: {
      ships: [{ class: 'hauler' }],
      cargo: { fuel: 12, metals: 3 },
      cargoCapacity: 40,
      freeHold: 25,
      miningRate: 0.001,
      fuelPricePerTon: 5,
      stationKeepRateTonsPerSecond: 0.02,
    },
    ...over,
  }
}

/** The home station body, as both the interior read and the station read name it. */
const STATION = { featureId: 'feat-station' }

/** The same hull, mid-burn toward `feat-body-0`. */
function burningFleet(over: Record<string, unknown> = {}) {
  return dockedFleet({
    attachedTo: undefined,
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 0, Y: 0, Z: 0 },
        Target: { BodyId: 'feat-body-0', Point: null },
        Intercept: { X: 18, Y: -3, Z: -15 },
        Curve: [],
        Length: 1,
        DepartMs: T0 - 1_000,
        ArriveMs: T0 + 120_000,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
    ...over,
  })
}

function setReads(
  interior: Partial<{ data: unknown; isLoading: boolean; isError: boolean; error: unknown }> = {},
  fleets: Partial<{ data: unknown; isLoading: boolean; isError: boolean }> = {},
) {
  useSystemSpace.mockReturnValue({
    data: INTERIOR,
    isLoading: false,
    isError: false,
    error: null,
    refetch: interiorRefetch,
    ...interior,
  })
  useMyFleets.mockReturnValue({
    data: [dockedFleet()],
    isLoading: false,
    isError: false,
    refetch: fleetsRefetch,
    ...fleets,
  })
}

function setMarketReads(
  station: Partial<{ data: unknown; isError: boolean; error: unknown }> = {},
  board: Partial<{ data: unknown; isError: boolean; error: unknown }> = {},
) {
  useStation.mockReturnValue({ data: market.station, isLoading: false, isError: false, error: null, refetch: stationRefetch, ...station })
  useMarketBoard.mockReturnValue({ data: market.board, isLoading: false, isError: false, error: null, refetch: boardRefetch, ...board })
}

beforeEach(() => {
  vi.clearAllMocks()
  useRunningMine.mockReturnValue({ data: null })
  stage.available = true
  stage.firstFrame = true
  market.corporationSessionFailed = false
  market.corporation = { id: 'corp-1', name: 'SDET Corp', credits: 1250 }
  setReads()
  setMarketReads()
})

// Every read and mutation the composed tree makes is mocked above, so the
// client below never fetches; it exists because React Query's `useQueryClient`
// (the roster's running-mine cache sweep) throws without a provider.
function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrap = (node: React.ReactElement) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>
  const rendered = rtlRender(wrap(ui))
  return { ...rendered, rerender: (node: React.ReactElement) => rendered.rerender(wrap(node)) }
}

const view = (systemId = SYSTEM_ID) => render(<SystemSpaceView systemId={systemId} />)

describe('SystemSpaceView — the data fan-in', () => {
  // Scenario: The own-fleets read is the corporation-scoped one
  it('Scenario: The own-fleets read is the corporation-scoped one', () => {
    view()
    // The corporation-scoped hook is the one consumed...
    expect(useMyFleets).toHaveBeenCalled()
    // ...and no system-scoped fleet read exists on this view at all. If one
    // were introduced it would have to be a distinct hook, so asserting the
    // module surface is the honest check available at this level; the wire
    // half is asserted in e2e (no `?systemId=` request is issued).
    expect(useSystemSpace).toHaveBeenCalledWith(SYSTEM_ID)
  })

  it('SDET-added: the interior read is disabled until a non-empty system id is known', () => {
    render(<SystemSpaceView systemId="" />)
    expect(useSystemSpace).toHaveBeenCalledWith('')
    // The hook receives the empty id and is expected to disable itself; the
    // view must not crash or render an error for it.
    expect(screen.queryByTestId('space-interior-error')).toBeNull()
  })

  // Scenario: Loading state before data arrives
  it('Scenario: Loading state before data arrives', () => {
    setReads({ data: undefined, isLoading: true })
    view()
    expect(screen.getByTestId('space-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('space-interior-error')).toBeNull()
  })

  // Scenario: A failed interior read shows a retriable error in the canvas
  // region
  it('Scenario: A failed interior read shows a retriable error in the canvas region', async () => {
    setReads({ data: undefined, isError: true, error: new Error('interior read exploded') })
    view()
    const err = screen.getByTestId('space-interior-error')
    expect(err).toBeInTheDocument()
    expect(err, 'the underlying message must be carried when available').toHaveTextContent(
      /interior read exploded/i,
    )
    await userEvent.click(screen.getByTestId('space-interior-retry'))
    expect(interiorRefetch).toHaveBeenCalled()
    expect(screen.queryByTestId('space-loading')).toBeNull()
  })

  // Scenario: A failed interior read leaves the fleet-state-anchored
  // commands usable
  //
  // REVISED 2026-09-03 (SDET, post-handoff — cause: this test as handed off
  // was self-contradictory and no honest implementation could satisfy it).
  // It asserted `fleet-cmd-jump-fleet_1` for a fleet attached to an ORDINARY
  // body — a fleet with no lane to jump down — while the SDET-added case at
  // the bottom of this file asserts that exactly such a fleet is NOT offered
  // jump. Jump is anchored to the acting fleet's own served `laneId` (it is
  // present iff the fleet is attached to a gate body), so the gate-attached
  // fixture is what the scenario's "attached to a body" means for its jump
  // clause.
  //
  // The assertion is STRENGTHENED rather than relaxed: instead of listing
  // ids that happen to be present when the read fails, it renders the SAME
  // fleet twice — once with a healthy interior read, once with a failed one
  // — and demands the command set be IDENTICAL. That is the requirement's
  // actual claim ("the interior failure withdraws nothing that fleet state
  // alone grants"), and unlike a bare presence list it fails against an
  // implementation that offers a command in neither state.
  it('Scenario: A failed interior read leaves the fleet-state-anchored commands usable', () => {
    // No single fleet can be docked at a station AND attached to a gate AND
    // mid-burn at once, so the seven commands the scenario lists are
    // exercised across the three states that make each of them meaningful.
    // Each state is rendered TWICE — once with a healthy interior read, once
    // with a failed one — and the command set must be identical, which is
    // the requirement's actual claim.
    const cases: { what: string; fleet: Record<string, unknown>; expect: string[] }[] = [
      {
        what: 'docked at the station, cargo aboard',
        fleet: dockedFleet({ attachedTo: STATION.featureId }),
        expect: ['sell-section', 'refuel-section', 'stationkeep-control'],
      },
      {
        what: 'attached to a lane-gate body, carrying its served laneId',
        fleet: dockedFleet({ attachedTo: 'gate-sys_-6_16', laneId: 'lane_-7_17_-6_16' }),
        expect: ['fleet-cmd-jump-fleet_1'],
      },
      {
        what: 'under way',
        fleet: burningFleet(),
        expect: ['fleet-cmd-cut-drive-fleet_1', 'fleet-cmd-stop-fleet_1'],
      },
    ]
    const ALWAYS = ['fleet-roster', 'space-fleet-panel']
    const ALL = [
      ...ALWAYS,
      'sell-section',
      'refuel-section',
      'stationkeep-control',
      'fleet-cmd-cut-drive-fleet_1',
      'fleet-cmd-stop-fleet_1',
      'fleet-cmd-jump-fleet_1',
    ]
    // `queryAllByTestId`, not `queryByTestId`: the composed view currently
    // renders cut-drive/stop/jump on BOTH the roster row and the actions
    // panel, so the singular query raises "found multiple elements" and
    // masks the parity question this test is asking. The duplication itself
    // is reported separately (see the SDET-added case below).
    const present = () => ALL.filter((id) => screen.queryAllByTestId(id).length > 0)

    for (const c of cases) {
      setReads({}, { data: [c.fleet] })
      const healthy = render(<SystemSpaceView systemId={SYSTEM_ID} />)
      const whenHealthy = present()
      healthy.unmount()

      setReads({ data: undefined, isError: true, error: new Error('nope') }, { data: [c.fleet] })
      const failed = render(<SystemSpaceView systemId={SYSTEM_ID} />)
      const whenFailed = present()
      failed.unmount()

      // Vacuity guard: this state must actually offer the commands it is
      // here to exercise, or "identical" is satisfied by offering none.
      for (const id of [...ALWAYS, ...c.expect]) {
        expect(whenHealthy, `${c.what}: ${id} must be offered with a healthy read`).toContain(id)
      }
      expect(
        whenFailed,
        `${c.what}: a failed interior read must withdraw no command anchored to the fleet's own served state`,
      ).toEqual(whenHealthy)
    }
  })

  it('SDET-added: each fleet command resolves to exactly one control in the composed view', () => {
    // NOT an adjudication of WHICH surface should own these verbs — that is a
    // spec question, reported to the orchestrator: `fleet-roster`'s *The
    // Roster Row Is the Fleet Command Surface, Jump Gated by Attachment
    // Alone* is still in force and unmodified by this change, while
    // `system-space-view`/`docked-fleet-actions` place the same verbs on the
    // command and actions panels. Both readings can satisfy THIS assertion:
    // drop one surface, or give the two surfaces distinct test ids.
    //
    // What it pins is the property every e2e selector in this change depends
    // on, and which a player also depends on: one visible control per verb.
    // Two live "Cut drive" buttons for one fleet is a UI defect regardless of
    // which spec wins, and it makes `getByTestId` ambiguous in Playwright's
    // strict mode — where it is a hard error, not a warning.
    setReads({}, { data: [burningFleet()] })
    view()
    for (const id of ['fleet-cmd-cut-drive-fleet_1', 'fleet-cmd-stop-fleet_1']) {
      expect(screen.queryAllByTestId(id).length, `${id} is rendered by two surfaces at once`).toBe(1)
    }
  })

  // The composition seam nothing else can see: `FleetActionsPanel.test.tsx`
  // proves the panel offers sell and shows a balance GIVEN a station and a
  // credit figure; only this file can prove the VIEW actually goes and gets
  // them. A view that hands the panel `station={null}` / `credits={null}`
  // renders a sell control that silently does nothing when clicked and a
  // balance readout that is a permanent em dash — both of which pass every
  // panel-level test.
  //
  // Scenario: Sell is offered while docked at a station with cargo aboard
  // Scenario: The panel shows the current credit balance
  it('Scenario: The panel shows the current credit balance (the view sources it, not the panel)', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const { container } = view()
    // `balance-value` (case c) keeps its wrapper id; `balance-figure` is the
    // credits <Figure> — the view has to have read the balance for the
    // panel to have one at all.
    const figure = screen.getByTestId('balance-figure')
    expect(
      figure.getAttribute('data-raw'),
      "the balance readout must show the corporation's served credit balance, not a placeholder — " +
        'the view has to read it for the panel to have one',
    ).toBe('1250')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('SDET-added: sell is offered against the station the view read, not against any docked body', () => {
    // `docked-fleet-actions`: the sell verb is offered "whenever the acting
    // fleet's effective state is `docked` to a station", and the commit is
    // submitted "against the acting fleet's docked station". A panel handed
    // no station cannot do the second, so offering the first is a control
    // that fails silently under the player's hand.
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const atStation = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
    // ...and the proceeds preview is live, which requires the venue quotes
    // the view must also have read.
    screen.getByTestId('sell-proceeds-preview')
    atStation.unmount()

    // The same fleet, same cargo, docked to an ordinary rocky body: there is
    // no station to sell to.
    setReads({}, { data: [dockedFleet({ attachedTo: 'feat-body-0' })] })
    view()
    expect(
      screen.queryByTestId('sell-section'),
      'a fleet docked to a planet has no station to sell to',
    ).toBeNull()
  })

  // Scenario: A failed interior read withdraws the mine offer without
  // misreporting the body
  it('Scenario: A failed interior read withdraws the mine offer without misreporting the body', async () => {
    setReads({ data: undefined, isError: true, error: new Error('nope') })
    view()
    // The offer is absent — resource kinds reach this view only on the
    // interior read (design.md Decision 12).
    expect(screen.queryByTestId('mine-section')).toBeNull()
    // ...and its absence is attributed to the failed read, NEVER to an empty
    // body. This is the sentence the decision was written to forbid.
    const notice = screen.getByTestId('mine-unavailable')
    expect(notice.textContent!.toLowerCase()).not.toMatch(
      /nothing to mine|no resources|carries no resources|has nothing/,
    )
    // ...and it offers the same retry.
    const retries = screen.getAllByTestId(/retry/)
    expect(retries.length).toBeGreaterThan(0)
    await userEvent.click(screen.getByTestId('space-interior-retry'))
    expect(interiorRefetch).toHaveBeenCalled()
  })

  // Scenario: A failed own-fleets read shows a retriable error in the fleet
  // panel
  it('Scenario: A failed own-fleets read shows a retriable error in the fleet panel', async () => {
    setReads({}, { data: undefined, isError: true })
    view()
    expect(screen.getByTestId('space-fleets-error')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('space-fleets-retry'))
    expect(fleetsRefetch).toHaveBeenCalled()
    // The canvas keeps rendering the interior — only the own-fleet marks are
    // absent.
    expect(screen.getByTestId('space-canvas-region')).toBeInTheDocument()
    expect(screen.queryByTestId('space-interior-error')).toBeNull()
  })

  // Scenario: An arrived fleet reads as arrived on both the canvas and the
  // roster
  it('Scenario: An arrived fleet reads as arrived on both the canvas and the roster', () => {
    // The corporation-scoped read settles a due arrival per system through
    // the shared `settleIfDue` seam; the system-scoped one does NOT. Both
    // panels therefore read one fleet from ONE source, and there is no state
    // in which the canvas shows it burning while the roster shows it docked —
    // a disagreement that is not cosmetic, since the docked commands live on
    // the roster's panel.
    const settled = dockedFleet({ id: 'fleet_1', attachedTo: 'feat-body-0' })
    setReads({}, { data: [settled] })
    view()
    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveTextContent(/docked|attached/i)
    expect(screen.getByTestId('space-canvas-region').getAttribute('data-fleet-states')).toContain(
      'fleet_1',
    )
  })

  // Scenario: Loading persists through first frame after data arrives
  it('Scenario: Loading persists through first frame after data arrives', () => {
    stage.firstFrame = false
    setReads()
    view()
    expect(
      screen.getByTestId('space-loading'),
      'the placeholder must hold rather than showing an empty or black canvas',
    ).toBeInTheDocument()
  })

  it('SDET-added: the placeholder clears once the first frame lands', async () => {
    stage.firstFrame = true
    setReads()
    view()
    await waitFor(() => expect(screen.queryByTestId('space-loading')).toBeNull())
  })

  // Scenario: An unsupported rendering context takes precedence over the
  // loading placeholder
  it('Scenario: An unsupported rendering context takes precedence over the loading placeholder', async () => {
    stage.available = false
    stage.firstFrame = false
    setReads()
    view()
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.queryByTestId('space-loading')).toBeNull()
  })

  // Scenario: The unsupported state is independent of the interior data read
  it('Scenario: The unsupported state is independent of the interior data read', async () => {
    stage.available = false
    setReads() // BOTH reads succeed
    view()
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.queryByTestId('space-interior-error')).toBeNull()
  })

  // Scenario: A failed interior read takes precedence over the unsupported
  // state
  it('Scenario: A failed interior read takes precedence over the unsupported state', async () => {
    stage.available = false
    setReads({ data: undefined, isError: true, error: new Error('interior down') })
    view()
    await waitFor(() => expect(screen.getByTestId('space-interior-error')).toBeInTheDocument())
    expect(screen.getByTestId('space-interior-error')).toHaveTextContent(/interior down/i)
    expect(screen.getByTestId('space-interior-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('renderer-unsupported')).toBeNull()
    expect(screen.getByTestId('fleet-roster')).toBeInTheDocument()
    expect(screen.getByTestId('space-fleet-panel')).toBeInTheDocument()
  })

  // Scenario: A failed own-fleets read does not suppress the unsupported
  // state
  it('Scenario: A failed own-fleets read does not suppress the unsupported state', async () => {
    stage.available = false
    setReads({}, { data: undefined, isError: true })
    view()
    await waitFor(() => expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument())
    expect(screen.getByTestId('space-fleets-error')).toBeInTheDocument()
  })

  it('SDET-added: fleets in other systems are filtered out on the client', () => {
    setReads({}, { data: [dockedFleet(), dockedFleet({ id: 'fleet_elsewhere', systemId: 'sys_other' })] })
    view()
    // Both are in the ROSTER (the roster is corp-wide)...
    expect(screen.getByTestId('fleet-row-fleet_elsewhere')).toBeInTheDocument()
    // ...but the acting-fleet panel is anchored to this system's fleet.
    expect(screen.getByTestId('fleet-row-fleet_1')).toBeInTheDocument()
  })

  it('retains a transit fleet in vitals and replaces local commands with destination guidance', () => {
    setReads({}, { data: [dockedFleet({ jump: { laneId: 'lane', destSystemId: 'destination', departMs: T0, arriveMs: T0 + 60000 } })] })
    view()
    expect(screen.getByTestId('fleet-location-panel')).toHaveTextContent('In transit')
    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('space-fleet-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('open-fleet-system'))
    expect(push).toHaveBeenCalledWith('/systems/destination')
  })

  // Scenario: The view reads the open system's station and the market
  // board. PRE-EXISTING requirement text, reproduced verbatim in this
  // change's MODIFIED delta — and, found while authoring this red suite, a
  // gap with NO prior coverage anywhere in the frontend (not introduced by
  // add-vitals-strip; closed here since every scenario in the delta must
  // appear in the coverage table).
  it('Scenario: The view reads the open system\'s station and the market board', () => {
    view()
    expect(useStation).toHaveBeenCalledWith(SYSTEM_ID)
    expect(useMarketBoard).toHaveBeenCalled()
  })

  // Scenario: A failed station read withdraws the station-anchored offers
  // without misreporting the system
  it('Scenario: A failed station read withdraws the station-anchored offers without misreporting the system', async () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    setMarketReads({ data: undefined, isError: true, error: new Error('station read exploded') })
    view()
    expect(screen.queryByTestId('sell-section')).toBeNull()
    expect(screen.queryByTestId('refuel-section')).toBeNull()
    const notice = screen.getByTestId('station-unavailable')
    expect(notice.textContent!.toLowerCase()).not.toMatch(/nothing to trade/)
    await userEvent.click(screen.getByTestId('station-retry'))
    expect(stationRefetch).toHaveBeenCalled()
    // The canvas and the fleet's other own-state-anchored commands stay
    // invokable — the fixture's park mode is 'orbit' (Park.Kind 0), which
    // offers the hold control.
    expect(screen.queryByTestId('space-interior-error')).toBeNull()
    expect(screen.getByTestId('stationkeep-control')).toBeInTheDocument()
  })

  // Scenario: A system with no station shows no station error
  it('Scenario: A system with no station shows no station error', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    setMarketReads({ data: undefined, isError: true, error: { status: 404 } })
    view()
    expect(screen.queryByTestId('sell-section')).toBeNull()
    expect(screen.queryByTestId('refuel-section')).toBeNull()
    expect(screen.queryByTestId('station-unavailable')).toBeNull()
    expect(screen.queryByTestId('station-retry')).toBeNull()
  })

  // Scenario: A failed market-board read withdraws the sell offer but not
  // the refuel offer
  it('Scenario: A failed market-board read withdraws the sell offer but not the refuel offer', async () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    setMarketReads({}, { data: undefined, isError: true, error: new Error('board down') })
    view()
    expect(screen.queryByTestId('sell-section')).toBeNull()
    expect(screen.getByTestId('market-board-unavailable')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('market-board-retry'))
    expect(boardRefetch).toHaveBeenCalled()
    // Refuel's cost preview comes from the fleet's OWN served fuel price,
    // never the board.
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-cost-preview')).toBeInTheDocument()
  })

  // Scenario: An unresolved credit balance withdraws the readout, not the
  // verbs
  it('Scenario: An unresolved credit balance withdraws the readout, not the verbs', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    market.corporationSessionFailed = true
    view()
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'false')
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
  })
})

describe('SystemSpaceView — the world clock is projected at the served scale', () => {
  // Scenario: Live world time is projected at the served scale, not an
  // assumed one
  it('Scenario: Live world time is projected at the served scale, not an assumed one', async () => {
    // The client clock's scale is un-defaulted here (`clockScale`'s own `?? 1`
    // chain is the LAST resort, never the assumed value); `WORLD_TIME_SCALE`
    // is a real server flag. Under continuous space a mis-scaled clock draws
    // every orbit and burn mark visibly wrong, and reaches u = 1 at the wrong
    // wall instant.
    const warped = { ...INTERIOR, scale: 60 }
    setReads({ data: warped })
    view()
    const clock = await screen.findByTestId('space-world-clock')
    expect(clock).toHaveAttribute('data-scale', '60')
  })

  it('SDET-added: with the interior read failed, the clock falls back to the fleet read\'s served scale, never to 1', () => {
    // tasks.md 2.3: this is the state in which the roster and the
    // fleet-anchored commands stay mounted with their countdowns ticking and
    // the fleet read is the only clock on screen.
    setReads({ data: undefined, isError: true, error: new Error('x') }, { data: [dockedFleet({ scale: 60 })] })
    view()
    const clock = screen.getByTestId('space-world-clock')
    expect(clock).toHaveAttribute('data-scale', '60')
  })
})

describe('SystemSpaceView — realtime refetch rules', () => {
  // Scenario: A running mine self-schedules a refetch at its ETA
  it('Scenario: A running mine self-schedules a refetch at its ETA', async () => {
    vi.useFakeTimers()
    try {
      useRunningMine.mockReturnValue({ data: { id: 'act_1', eta: T0 + 5_000, type: 'mine' } })
      setReads()
      view()
      interiorRefetch.mockClear()
      fleetsRefetch.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000)
      })
      expect(fleetsRefetch, 'no refetch before the ETA').not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000)
      })
      expect(fleetsRefetch, 'a refetch shortly after the ETA').toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: A running burn or jump self-schedules a refetch at its arrival
  it('Scenario: A running burn or jump self-schedules a refetch at its arrival', async () => {
    vi.useFakeTimers()
    try {
      const burning = dockedFleet({
        attachedTo: undefined,
        state: {
          Mode: 0,
          Park: null,
          Drift: null,
          Burn: {
            Origin: { X: 0, Y: 0, Z: 0 },
            Target: { BodyId: 'feat-body-0', Point: null },
            Intercept: { X: 18, Y: -3, Z: -15 },
            Curve: [],
            Length: 1,
            DepartMs: T0 - 1000,
            ArriveMs: T0 + 8_000,
            Accel: 1,
            InsertionPhase: 0,
          },
        },
      })
      setReads({}, { data: [burning] })
      view()
      fleetsRefetch.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7_000)
      })
      expect(fleetsRefetch).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000)
      })
      expect(fleetsRefetch).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: A missed event on reconnect triggers a resync
  it('Scenario: A missed event on reconnect triggers a resync', async () => {
    view()
    interiorRefetch.mockClear()
    fleetsRefetch.mockClear()
    // The live subscription drops and later reconnects. Nothing else would
    // recover the completions that landed while it was down.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sse-reconnect', { detail: { channel: SYSTEM_ID } }))
    })
    await waitFor(() => {
      expect(interiorRefetch.mock.calls.length + fleetsRefetch.mock.calls.length).toBeGreaterThan(0)
    })
  })

  // Scenario: The poll runs at a constant interval with nothing pending
  it('Scenario: The poll runs at a constant interval with nothing pending', async () => {
    const { BOARD_POLL_MS } = await import('@/lib/realtime')
    vi.useFakeTimers()
    try {
      view()
      interiorRefetch.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOARD_POLL_MS + 100)
      })
      const after1 = interiorRefetch.mock.calls.length
      expect(after1).toBeGreaterThan(0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOARD_POLL_MS)
      })
      expect(interiorRefetch.mock.calls.length, 'a CONSTANT interval, not a backoff').toBe(after1 * 2)
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: Animation between refetches needs no extra request
  it('Scenario: Animation between refetches needs no extra request', async () => {
    vi.useFakeTimers()
    try {
      view()
      interiorRefetch.mockClear()
      fleetsRefetch.mockClear()
      // Many animation frames' worth of world time, well inside one poll.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(interiorRefetch).not.toHaveBeenCalled()
      expect(fleetsRefetch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView — departure hand-off, scoped to the acting fleet', () => {
  function departing(id: string) {
    return dockedFleet({
      id,
      systemId: 'sys_-6_16',
      attachedTo: undefined,
      position: undefined,
      jump: { laneId: 'lane_-7_17_-6_16', destSystemId: 'sys_-6_16', departMs: T0, arriveMs: T0 + 60_000 },
    })
  }

  // Scenario: Watching the acting fleet depart navigates to the galaxy view
  it('Scenario: Watching the acting fleet depart navigates to the galaxy view', async () => {
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    // fleet_1 is the acting fleet (the only own fleet here). It is present
    // and in-system on the first read...
    expect(push).not.toHaveBeenCalled()
    // ...then departs, observed on THIS view.
    setReads({}, { data: [departing('fleet_1')] })
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  // Scenario: A non-acting fleet's departure does not navigate
  it('Scenario: A non-acting fleet\'s departure does not navigate', async () => {
    setReads({}, { data: [dockedFleet({ id: 'A' }), dockedFleet({ id: 'B' })] })
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    // Command fleet A.
    await userEvent.click(screen.getByTestId('fleet-row-A'))
    // Fleet B departs on its own schedule.
    setReads({}, { data: [dockedFleet({ id: 'A' }), departing('B')] })
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(push, 'a player mid-input must not be yanked off the screen').not.toHaveBeenCalled()
    // ...and the acting fleet is still the one they chose.
    expect(screen.getByTestId('fleet-row-A')).toBeInTheDocument()
  })

  // Scenario: Opening the view with an already-departed fleet does not
  // navigate
  it('Scenario: Opening the view with an already-departed fleet does not navigate', async () => {
    setReads({}, { data: [departing('fleet_1')] })
    view()
    await new Promise((r) => setTimeout(r, 20))
    expect(push).not.toHaveBeenCalled()
  })
})

describe('SystemSpaceView — a gate-targeted burn ends in a jumpable attachment', () => {
  // Scenario: Attachment from a gate-targeted burn makes the jump command
  // available
  it('Scenario: Attachment from a gate-targeted burn makes the jump command available', () => {
    // The fleet has arrived attached to the gate body it burned toward, and
    // its own read now carries that gate's laneId. Jump becomes available on
    // its roster row — gated by attachment alone, with no charted-lane
    // precondition and no canvas selection.
    const atGate = dockedFleet({
      attachedTo: 'gate-sys_-6_16',
      laneId: 'lane_-7_17_-6_16',
    })
    setReads({}, { data: [atGate] })
    view()
    const jump = screen.getByTestId('fleet-cmd-jump-fleet_1') as HTMLButtonElement
    expect(jump).toBeInTheDocument()
    expect(jump.disabled).toBe(false)
  })

  it('SDET-added: a fleet attached to an ordinary body is not offered jump', () => {
    setReads({}, { data: [dockedFleet()] })
    view()
    const jump = screen.queryByTestId('fleet-cmd-jump-fleet_1') as HTMLButtonElement | null
    if (jump) expect(jump.disabled).toBe(true)
  })
})

describe('SystemSpaceView — roster cross-navigation', () => {
  // Scenario: Selecting a fleet in another system navigates there
  //
  // Spec: 0011/S3 — "A row takes you to its fleet, whatever tier it's on".
  // The marker moved here from the deleted
  // `components/board/SystemBoardView.test.tsx` (openspec change
  // `build-production-space-view`, tasks.md 10.1): the docs/specs scenario
  // names "that system's board opens", and this view is the board's
  // successor, so the cross-navigation assertion below IS 0011/S3's
  // coverage under the new view's name.
  it('Scenario: Selecting a fleet in another system navigates there', async () => {
    setReads({}, { data: [dockedFleet(), dockedFleet({ id: 'far', systemId: 'sys_-6_16' })] })
    view()
    await userEvent.click(screen.getByTestId('fleet-row-far'))
    expect(push).toHaveBeenCalledWith('/systems/sys_-6_16')
  })

  // Scenario: Selecting a fleet with no position navigates to the galaxy
  it('Scenario: Selecting a fleet with no position navigates to the galaxy', async () => {
    const onLane = dockedFleet({
      id: 'lane',
      systemId: '',
      position: undefined,
      attachedTo: undefined,
      jump: { laneId: 'l', destSystemId: 'sys_x', departMs: T0, arriveMs: T0 + 1000 },
    })
    setReads({}, { data: [dockedFleet(), onLane] })
    view()
    await userEvent.click(screen.getByTestId('fleet-row-lane'))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('SDET-added: selecting a fleet in THIS system sets it acting and does not navigate', async () => {
    setReads({}, { data: [dockedFleet({ id: 'A' }), dockedFleet({ id: 'B' })] })
    view()
    await userEvent.click(screen.getByTestId('fleet-row-B'))
    expect(push).not.toHaveBeenCalled()
  })
})

describe('SystemSpaceView — landed resolutions are announced', () => {
  const announcer = () => screen.getByTestId('space-announcer')

  it('SDET-added: the announcer is a POLITE live region', () => {
    view()
    expect(announcer()).toHaveAttribute('aria-live', 'polite')
  })

  // Scenario: A pending resolution is not announced before it lands
  it('Scenario: A pending resolution is not announced before it lands', () => {
    useRunningMine.mockReturnValue({ data: { id: 'act_1', eta: T0 + 60_000, type: 'mine' } })
    const burning = dockedFleet({
      attachedTo: undefined,
      state: {
        Mode: 0,
        Park: null,
        Drift: null,
        Burn: { Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'feat-body-0', Point: null }, Intercept: { X: 1, Y: 0, Z: 0 }, Curve: [], Length: 1, DepartMs: T0 - 1, ArriveMs: T0 + 60_000, Accel: 1, InsertionPhase: 0 },
      },
    })
    setReads({}, { data: [burning] })
    view()
    expect(announcer().textContent?.trim() ?? '').toBe('')
  })

  // Scenario: A burn arrival and its docking are announced
  it('Scenario: A burn arrival and its docking are announced', async () => {
    const burning = dockedFleet({
      attachedTo: undefined,
      state: {
        Mode: 0,
        Park: null,
        Drift: null,
        Burn: { Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'feat-body-0', Point: null }, Intercept: { X: 18, Y: -3, Z: -15 }, Curve: [], Length: 1, DepartMs: T0 - 1, ArriveMs: T0 + 5_000, Accel: 1, InsertionPhase: 0 },
      },
    })
    setReads({}, { data: [burning] })
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    // The refetch lands the settled, attached state.
    setReads({}, { data: [dockedFleet()] })
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    await waitFor(() => expect(announcer().textContent ?? '').toMatch(/arriv/i))
    expect(announcer().textContent, 'the body it is now attached to must be named').toMatch(
      /feat-body-0|rocky/i,
    )
  })

  // Scenario: A mine completion is announced
  it('Scenario: A mine completion is announced', async () => {
    useRunningMine.mockReturnValue({ data: { id: 'act_1', eta: T0 + 1_000, type: 'mine' } })
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    useRunningMine.mockReturnValue({ data: null })
    setReads({}, { data: [dockedFleet({ roster: { ...dockedFleet().roster, cargo: { fuel: 12, metals: 9 } } })] })
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    await waitFor(() => expect(announcer().textContent ?? '').toMatch(/min\w*.*(complete|finished)/i))
  })

  // Scenario: A jump arrival is announced
  it('Scenario: A jump arrival is announced', async () => {
    const inTransit = dockedFleet({
      id: 'fleet_1',
      systemId: SYSTEM_ID,
      position: undefined,
      attachedTo: undefined,
      jump: { laneId: 'l', destSystemId: SYSTEM_ID, departMs: T0 - 1000, arriveMs: T0 + 1000 },
    })
    setReads({}, { data: [inTransit] })
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    setReads({}, { data: [dockedFleet()] })
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    await waitFor(() => expect(announcer().textContent ?? '').toMatch(/arriv/i))
  })
})

// =============================================================================
// add-vitals-strip — the seams only THIS file can prove: that
// `system-console`'s `VitalsStrip` is actually MOUNTED, fed from the view's
// OWN reads (never a second read of its own), and that the wiring survives
// exactly the failure states `VitalsStrip.test.tsx` cannot exercise because
// they are not inputs on `VitalsStripProps` at all (impl contract §7.2)
// — the interior read and the renderer's availability. RED-PHASE,
// COMPILE-clean today (SystemSpaceView.tsx exists) but ASSERTION-RED: the
// strip is not mounted yet, so every `vitals-*`/`fuel-gauge`/`hold-gauge`
// query below throws "unable to find an element".
// =============================================================================

describe('SystemSpaceView — the vitals strip is mounted and fed from the view\'s own reads (system-console)', () => {
  // Scenario: The strip renders with every read resolved (task 8.5's own
  // "mounts the strip fed from its own reads" — the composition seam
  // nothing else can see, same shape as the credit-balance seam above:
  // `VitalsStrip.test.tsx` proves the strip renders correctly GIVEN props;
  // only this file proves `SystemSpaceView` actually SUPPLIES them).
  it('Scenario: The strip renders with every read resolved — fed from the view\'s own interior/fleets/session/galaxy reads, never a second read of its own', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const { container } = view()
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '12')
    expect(screen.getByTestId('hold-capacity-used')).toHaveAttribute('data-raw', String(40 - 25))
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1250')
    assertFiguresMatchModule(container.querySelector('[data-testid="vitals-strip"]') as HTMLElement, { scale: 1 })
  })

  // Scenario: The strip survives a failed interior read — the cells fed by
  // the fleet read and the session are unchanged. VitalsStrip has no
  // interior prop of its own (contract §7.2), so this is provable only
  // here: the view must keep mounting the strip, fed from the reads that
  // did NOT fail.
  it('Scenario: The strip survives a failed interior read', () => {
    setReads(
      { data: undefined, isError: true, error: new Error('interior down') },
      { data: [dockedFleet({ attachedTo: STATION.featureId })] },
    )
    view()
    expect(screen.getByTestId('space-interior-error')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-row-fleet_1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '12')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1250')
  })

  // Scenario: The strip survives an unavailable renderer. Same reasoning:
  // renderer availability reaches VitalsStrip through no prop it has.
  it('Scenario: The strip survives an unavailable renderer', () => {
    stage.available = false
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    view()
    expect(screen.getByTestId('renderer-unsupported')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '12')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1250')
  })

  // Scenario: The strip survives a failed own-fleets read — mounted here to
  // confirm the VIEW routes `fleets.isError` into the strip's
  // `fleetsFailed` prop (never confusing it with `fleets.data` simply being
  // empty); `VitalsStrip.test.tsx` covers the strip's OWN response to
  // `fleetsFailed=true` given directly.
  it('Scenario: The strip survives a failed own-fleets read, with no error or retry of its own', () => {
    setReads({}, { data: undefined, isError: true })
    view()
    expect(screen.getByTestId('space-fleets-error')).toBeInTheDocument()
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.queryByTestId('vitals-fleet-chevron')).not.toBeInTheDocument()
  })

  // The credits cell's staleness rule (system-console: "A stale session
  // read is never presented as a current balance") has NO reachable
  // implementation path through `useCorporationOptional` — this is the
  // seam `useCorporationSessionOptional` (contract §6) exists to close, and
  // the derivation (`sessionFailed ? null : (corporation?.credits ?? null)`)
  // lives in THIS component, not in VitalsStrip. Only this file can
  // exercise it.
  it('SDET-added: a session that resolved once and has since failed to refresh reads Unavailable on the strip, never the cached figure (contract §6.3)', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const { rerender } = view()
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'true')

    market.corporationSessionFailed = true
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)
    expect(screen.getByTestId('balance-value')).toHaveAttribute('data-available', 'false')
    expect(screen.queryByTestId('balance-figure')).toBeNull()
  })

  // Scenario: Clicking a strip cell leaves the selection unchanged /
  // Scenario: Switching the acting fleet leaves the selection unchanged.
  // `selection` is THIS component's own state — VitalsStrip has no setter
  // for it at all (contract §7.2), so this is provable only at this level.
  it('Scenario: Clicking a strip cell leaves the selection unchanged', async () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    view()
    await userEvent.click(screen.getByTestId('mock-select-body'))
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
    await userEvent.click(screen.getByTestId('vitals-clock-cell'))
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
  })

  it('Scenario: Switching the acting fleet leaves the selection unchanged', async () => {
    setReads(
      {},
      { data: [dockedFleet({ id: 'fleet_1' }), dockedFleet({ id: 'fleet_2', systemId: SYSTEM_ID, attachedTo: undefined })] },
    )
    view()
    await userEvent.click(screen.getByTestId('mock-select-body'))
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
    await userEvent.click(screen.getByTestId('fleet-row-fleet_2'))
    expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
  })

  // docked-fleet-actions MODIFIED "Sell Commit"/"Refuel Commit": "the
  // strip's hold and credits cells... reflect the sale's/refuel's effect
  // without a page navigation". `VitalsStrip.test.tsx` proves the strip
  // reacts correctly to new props; this proves the VIEW keeps supplying
  // them from the SAME `useMyFleets()`/session reads a settled mutation's
  // query invalidation (`hooks/use-market.ts`'s real `onSuccess`,
  // unmodified by this change) would refetch — no navigation anywhere in
  // either test.
  it('Scenario: A successful sale refreshes hold and balance — landing on the strip, without navigation', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const { rerender } = view()
    // `hold-capacity-used`/`balance-figure` are RULING 17's inherited
    // testids — they would still pass against today's PANEL-rendered
    // readout even before the strip exists, which would make this
    // assertion tautological on its own (README lesson two's shape). The
    // `vitals-strip` presence check is what actually pins the new surface.
    expect(screen.getByTestId('vitals-strip')).toBeInTheDocument()
    expect(screen.getByTestId('hold-capacity-used')).toHaveAttribute('data-raw', String(40 - 25))
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1250')

    // What a settled sale's query invalidation would land: less cargo, more
    // credits, same fleet, same route.
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId, roster: { ...dockedFleet().roster, cargo: { fuel: 12 }, freeHold: 40 } })] })
    market.corporation = { id: 'corp-1', name: 'SDET Corp', credits: 1300 }
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)

    expect(screen.getByTestId('hold-capacity-used')).toHaveAttribute('data-raw', '0')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1300')
    expect(push, 'no navigation on a settled sale').not.toHaveBeenCalled()
  })

  it('Scenario: A successful refuel refreshes hold, range, and balance — landing on the strip and the roster row, without navigation', () => {
    setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    const { rerender } = view()
    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '12')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1250')

    setReads(
      {},
      { data: [dockedFleet({ attachedTo: STATION.featureId, roster: { ...dockedFleet().roster, cargo: { fuel: 22, metals: 3 }, freeHold: 15, estimatedRange: 9000 } })] },
    )
    market.corporation = { id: 'corp-1', name: 'SDET Corp', credits: 1150 }
    rerender(<SystemSpaceView systemId={SYSTEM_ID} />)

    expect(screen.getByTestId('vitals-fuel-tons')).toHaveAttribute('data-raw', '22')
    // The estimated range on the fleet ROSTER row (unchanged surface,
    // docked-fleet-actions' own clause) updates from the SAME read.
    expect(screen.getByTestId('fleet-range-fleet_1')).toHaveAttribute('data-raw', '9000')
    expect(screen.getByTestId('balance-figure')).toHaveAttribute('data-raw', '1150')
    expect(push, 'no navigation on a settled refuel').not.toHaveBeenCalled()
  })
})


it('opens real object details without an order and replaces them with travel review', async () => {
  view()
  await userEvent.click(screen.getByTestId('index-feat-body-0'))
  expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', 'feat-body-0')
  expect(screen.getByRole('complementary', { name: 'Details for feat-body-0' })).toHaveTextContent('metals')
  expect(screen.getByTestId('space-command-column')).toBeVisible()
  expect(mutations.order.mutate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByTestId('index-focus'))
  expect(mutations.order.mutate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByTestId('details-plot'))
  expect(screen.getByTestId('compact-travel-card')).toBeVisible()
  expect(screen.getByTestId('details-plot')).not.toBeVisible()
  expect(screen.getByTestId('system-index-search')).not.toBeVisible()
  expect(screen.getByTestId('space-command-column')).toBeVisible()
  expect(mutations.order.mutate).not.toHaveBeenCalled()
})

it('withholds cached object details after interior failure and offers retry', async () => {
  setReads({ isError: true })
  view()
  expect(screen.queryByTestId('index-feat-body-0')).not.toBeInTheDocument()
  expect(screen.getByText('System objects are unavailable.')).toBeVisible()
  await userEvent.click(screen.getByTestId('index-retry'))
  expect(interiorRefetch).toHaveBeenCalled()
})

it.each(['index-feat-body-0', 'guide-target'])('advances object discovery through %s without issuing an order', async entry => {
  const { newGuide, saveGuide } = await import('@/lib/command-onboarding')
  const guide = { ...newGuide('corp-1', 'fleet_1', SYSTEM_ID), phase: 'target' as const, targetId: 'feat-body-0' }
  vi.mocked(localStorage.getItem).mockImplementation(key => key === 'hexaverse:command-guide:v1:corp-1' ? JSON.stringify(guide) : null)
  try {
    view()
    expect(screen.getByTestId('recovery-copy')).toHaveTextContent('Contact found. Let’s test your engines.')
    expect(screen.getByTestId('live-object-browser')).toHaveAttribute('data-attention', 'true')
    await userEvent.click(screen.getByTestId(entry))
    expect(screen.queryByTestId('recovery-transmission')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Complete tutorial · 0/1')
    expect(screen.getByTestId('system-index-search')).toBeVisible()
    expect(screen.getByTestId('live-object-browser')).toHaveAttribute('data-attention', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
    expect(screen.queryByTestId('recovery-transmission')).not.toBeInTheDocument()
    expect(mutations.order.mutate).not.toHaveBeenCalled()
  } finally {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    act(() => saveGuide({ ...guide, phase: 'dismissed' }))
  }
})


it.each(['wake', 'target', 'done'] as const)('shows tutorial objective from %s with the correct completion count', async phase => {
  const { newGuide } = await import('@/lib/command-onboarding')
  const guide = { ...newGuide('corp-1', 'fleet_1', SYSTEM_ID), phase, targetId: 'feat-body-0', acceptedAt: 1, mineActionId: 'mine-1', resource: 'metals', stationId: 'station-1' }
  vi.mocked(localStorage.getItem).mockImplementation(key => key === 'hexaverse:command-guide:v1:corp-1' ? JSON.stringify(guide) : null)
  try {
    view()
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent(`Complete tutorial · ${phase === 'done' ? '1/1' : '0/1'}`)
  } finally {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  }
})

it.each(['index-feat-station', 'guide-objects'])('introduces the station then scanning through %s', async entry => {
  const { newGuide } = await import('@/lib/command-onboarding')
  const guide = { ...newGuide('corp-1', 'fleet_1', SYSTEM_ID), phase: 'objects' as const }
  const values = new Map([['hexaverse:command-guide:v1:corp-1', JSON.stringify(guide)]])
  vi.mocked(localStorage.getItem).mockImplementation(key => values.get(key) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { values.set(key, value) })
  try {
    view()
    await userEvent.click(screen.getByTestId(entry))
    expect(screen.getByTestId('recovery-transmission')).toHaveAttribute('data-phase', 'station')
    expect(screen.getByTestId('recovery-copy')).toHaveTextContent('home port')
    expect(screen.getByTestId('system-index-search')).toBeVisible()
    await userEvent.click(screen.getByTestId('guide-introduce-scan'))
    expect(screen.getByTestId('recovery-copy')).toHaveTextContent('Let’s scan')
    expect(mutations.order.mutate).not.toHaveBeenCalled()
  } finally {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
  }
})

it('waits for refreshed resource data after scan completion before offering travel', async () => {
  const { newGuide } = await import('@/lib/command-onboarding')
  const guide = { ...newGuide('corp-1', 'fleet_1', SYSTEM_ID), phase: 'contacts' as const, scanActionId: 'scan-1' }
  const values = new Map([['hexaverse:command-guide:v1:corp-1', JSON.stringify(guide)]])
  vi.mocked(localStorage.getItem).mockImplementation(key => values.get(key) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { values.set(key, value) })
  let resolveRead!: (value: unknown) => void
  interiorRefetch.mockReturnValue(new Promise(resolve => { resolveRead = resolve }))
  setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
  try {
    view()
    expect(screen.getByTestId('recovery-transmission')).toHaveAttribute('data-phase', 'contacts')
    expect(screen.queryByTestId('guide-target')).not.toBeInTheDocument()
    await act(async () => resolveRead({ data: INTERIOR, isError: false }))
    await waitFor(() => expect(screen.getByTestId('recovery-transmission')).toHaveAttribute('data-phase', 'target'))
    expect(JSON.parse(values.get('hexaverse:command-guide:v1:corp-1')!).targetId).toBe('feat-body-0')
  } finally {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
    interiorRefetch.mockReset()
  }
})

it('keeps docked station services in station details and preserves quantities across closing', async () => {
  setReads({}, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
  view()
  expect(screen.getByTestId('sell-section')).not.toBeVisible()
  expect(screen.getByTestId('refuel-section')).not.toBeVisible()
  await userEvent.click(screen.getByTestId(`index-${STATION.featureId}`))
  const details = screen.getByRole('complementary', { name: `Details for ${STATION.featureId}` })
  expect(details).toContainElement(screen.getByTestId('sell-section'))
  expect(screen.getByTestId('refuel-section')).toBeVisible()
  fireEvent.change(screen.getByTestId('refuel-tons-input'), { target: { value: '3' } })
  await userEvent.click(screen.getByTestId('index-feat-body-0'))
  expect(screen.getByTestId('refuel-section')).not.toBeVisible()
  await userEvent.click(screen.getByTestId(`index-${STATION.featureId}`))
  expect(screen.getByTestId('refuel-tons-input')).toHaveValue(3)
  await userEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
  expect(screen.getByTestId('refuel-section')).not.toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Objects (hidden)' }))
  expect(screen.getByTestId('refuel-tons-input')).toHaveValue(3)
})


describe('compact command fleet gate travel', () => {
  it('uses the owned fleet server lane and guards repeated activation even without a renderer', async () => {
    const fleet = dockedFleet({ id: 'gate-command-fleet', attachedTo: 'gate-sys_-6_16', laneId: 'server-served-lane' })
    stage.available = false
    setReads({}, { data: [fleet] })
    view()
    await userEvent.click(screen.getByTestId('travel-status-entry'))
    const jump = screen.getByTestId('travel-jump')
    expect(jump).toBeEnabled()
    expect(mutations.jump.mutate).not.toHaveBeenCalled()
    act(() => {
      fireEvent.click(jump)
      fireEvent.click(jump)
    })
    expect(mutations.jump.mutate).toHaveBeenCalledTimes(1)
    expect(mutations.jump.mutate.mock.calls[0][0]).toEqual({ fleetId: 'gate-command-fleet', laneId: 'server-served-lane' })
    expect(mutations.order.mutate).not.toHaveBeenCalled()
  })

  it('keeps gate travel disabled while mining owns the movement channel', async () => {
    setReads({}, { data: [dockedFleet({ attachedTo: 'gate-sys_-6_16', laneId: 'server-served-lane' })] })
    useRunningMine.mockReturnValue({ data: { id: 'active-mine', type: 'mine', eta: T0 + 600000 } })
    view()
    await userEvent.click(screen.getByTestId('travel-status-entry'))
    const jump = screen.getByTestId('travel-jump')
    expect(jump).toBeDisabled()
    fireEvent.click(jump)
    expect(mutations.jump.mutate).not.toHaveBeenCalled()
  })

  it.each([
    ['ordinary body attachment', { attachedTo: 'feat-body-0', laneId: undefined }],
    ['remote gate', { attachedTo: 'remote-gate', systemId: 'other-system', laneId: 'remote-lane' }],
    ['fleet already in transit', { laneId: 'server-served-lane', jump: { laneId: 'server-served-lane', destSystemId: 'other-system', departMs: T0, arriveMs: T0 + 60000 } }],
  ])('offers no jump for %s', async (_label, overrides) => {
    setReads({}, { data: [dockedFleet(overrides)] })
    view()
    await userEvent.click(screen.getByTestId('travel-status-entry'))
    expect(screen.getByTestId('compact-travel-card')).toBeVisible()
    expect(screen.queryByTestId('travel-jump')).not.toBeInTheDocument()
    expect(mutations.jump.mutate).not.toHaveBeenCalled()
  })
})


describe('reachable non-map HUD actions', () => {
  it('keeps docked trading and holding usable when the interior and renderer are unavailable', async () => {
    stage.available = false
    setReads({ data: undefined, isError: true, error: new Error('interior unavailable') }, { data: [dockedFleet({ attachedTo: STATION.featureId })] })
    view()
      expect(screen.getByTestId('sell-section')).toBeVisible()
    expect(screen.getByTestId('refuel-section')).toBeVisible()
    expect(screen.getByTestId('stationkeep-control')).toBeVisible()
    expect(screen.queryByTestId('celestial-actions')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('refuel-tons-input'), { target: { value: '3' } })
    await userEvent.click(screen.getByTestId('refuel-button'))
    expect(mutations.refuel.mutate).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('stationkeep-control'))
    expect(mutations.hold.mutate).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
    expect(screen.getByTestId('refuel-section')).not.toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Objects (hidden)' }))
    expect(screen.getByTestId('refuel-tons-input')).toHaveValue(3)
  })

  it('offers the existing Cut drive verb in visible fleet status without needing the renderer', async () => {
    stage.available = false
    setReads({}, { data: [burningFleet()] })
    view()
    await userEvent.click(screen.getByTestId('travel-status-entry'))
    const cut = screen.getByTestId('travel-cut-drive')
    expect(cut).toBeVisible()
    expect(cut).toBeEnabled()
    act(() => { fireEvent.click(cut); fireEvent.click(cut) })
    expect(mutations.cutDrive.mutate).toHaveBeenCalledTimes(1)
    expect(mutations.cutDrive.mutate.mock.calls[0][0]).toBe('fleet_1')
    expect(mutations.stop.mutate).not.toHaveBeenCalled()
  })

  it('does not offer Cut drive for a quiet parked fleet', async () => {
    view()
    await userEvent.click(screen.getByTestId('travel-status-entry'))
    expect(screen.queryByTestId('travel-cut-drive')).not.toBeInTheDocument()
  })
})

it('hands phone onboarding to one full-page panel and resumes the guide only when requested', async () => {
  const { newGuide } = await import('@/lib/command-onboarding')
  const guide = { ...newGuide('corp-1', 'fleet_1', SYSTEM_ID), phase: 'objects' as const }
  const values = new Map([['hexaverse:command-guide:v1:corp-1', JSON.stringify(guide)]])
  const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  vi.mocked(localStorage.getItem).mockImplementation(key => values.get(key) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { values.set(key, value) })
  try {
    view()
    expect(screen.getByRole('dialog', { name: 'Recovery transmission' })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('guide-objects'))
    expect(screen.queryByTestId('recovery-transmission')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Objects panel' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close Objects panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Resume guide' }))
    expect(screen.getByRole('dialog', { name: 'Recovery transmission' })).toBeInTheDocument()
    expect(screen.getByTestId('recovery-transmission')).toHaveAttribute('data-phase', 'station')
    expect(mutations.order.mutate).not.toHaveBeenCalled()
  } finally {
    media.mockRestore()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
  }
})
