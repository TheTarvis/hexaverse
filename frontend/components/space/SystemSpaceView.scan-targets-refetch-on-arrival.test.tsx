import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// `system-space-view`'s ADDED "The Focused-Scan Target List Comes From the
// Server, Never From a Client Predicate" — REVISED 2026-09-03 per the
// eighth adversary round (handoffs/link8b-adversary-r8.md, findings F1,
// F2, F5, F6, all six rulings accepted verbatim).
//
// F5's own finding about THIS file's first version: a component test with
// a mocked `useScanTargets` asserting a second hook call "satisfies it
// without ever exercising the invalidation wiring 4.9 builds — and wiring
// is exactly what broke" (the reported Playwright bug). This revision
// drives the REAL `useScanTargets`/`useScan`/`useSettledScan`
// (`@/hooks/use-scan`) and the REAL `useRunningScan`/`useCancelAction`/
// `useAcknowledgeAction` (`@/hooks/use-actions`) against a REAL
// `QueryClient`, mocking only the NETWORK BOUNDARY — `fleetService`/
// `actionService` — so every assertion below is a genuine count of calls
// to the mocked SERVICE function, never a hook-call spy.
//
// Five scenarios, one shared harness:
//   - A landed arrival refetches the target list (F5)
//   - A failed refetch drops the stale list rather than restating it (F1)
//   - Changing the acting fleet refetches the list (F2, strengthened)
//   - Cancelling a sweep issues a fresh scan-targets read (F6)
//   - A settled sweep refetches the target list (added 2026-09-03: a live
//     Playwright run against the current tree hit the docked leg's SECOND
//     sweep with "No host is in range to sweep." even though the fleet
//     never moved — `system-space-view`'s own requirement prose already
//     commits to this ordering ("that fleet's scan-target read" among the
//     post-settle follower reads, refetched "only after [the interior
//     read] has completed"), and its own scenario list already names it
//     verbatim ("A settled sweep refetches the target list") — this is a
//     coverage gap in THIS suite, not a spec change: the existing F5/F1/F2/
//     F6 scenarios never drove a genuine settle through `ScanSweepWatcher`,
//     so nothing here ever exercised the ordering the requirement's prose
//     already demanded. `resync()` currently fires the scan-target refetch
//     at its own top, concurrently with (not sequenced after)
//     `interior.refetch()` — racing the real backend's settlement, which
//     only that interior read triggers.)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()

// --- the network boundary: mocked SERVICE functions, never the hooks ------
const mockScanTargets = vi.fn()
const mockScan = vi.fn()
const mockListRunning = vi.fn()
const mockListSettled = vi.fn()
const mockCancel = vi.fn()
const mockAcknowledge = vi.fn()

vi.mock('@/lib/services', () => ({
  fleetService: {
    scanTargets: (...args: unknown[]) => mockScanTargets(...args),
    scan: (...args: unknown[]) => mockScan(...args),
  },
  actionService: {
    listRunning: (...args: unknown[]) => mockListRunning(...args),
    listSettled: (...args: unknown[]) => mockListSettled(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    acknowledge: (...args: unknown[]) => mockAcknowledge(...args),
  },
}))

// `@/hooks/use-scan` and `@/hooks/use-actions` are DELIBERATELY NOT
// MOCKED — they run for real, over the mocked services above, so the
// scan-targets invalidation wiring under test actually executes.

const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), reset: vi.fn(), isPending: false, isError: false, error: null })
  return { order: make(), jump: make(), cutDrive: make(), stop: make(), mine: make(), hold: make(), release: make(), sell: make(), refuel: make() }
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
// A SHARED spy, not a fresh `vi.fn()` per call — link8b-adversary-r11's own
// F11-1 test (below) needs to count PILE REFETCH calls across renders, the
// same reason `SystemSpaceView.scan-refetch.test.tsx`'s `sightingsRefetch`
// spy is shared. `vi.clearAllMocks()` in `beforeEach` resets its call count
// between tests without disturbing this stub.
const sightingsRefetch = vi.fn()
vi.mock('@/hooks/use-sightings', () => ({
  useSightings: () => ({ data: { pages: [{ sightings: [], nextCursor: '' }] }, isLoading: false, isError: false, refetch: sightingsRefetch }),
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
const FLEET_A = 'fleet_a'
const FLEET_B = 'fleet_b'
const HOST_ID = 'feat-body-0'

const INTERIOR = {
  systemId: SYSTEM_ID, extent: 200, character: 'normal', starClass: 'M', worldTime: T0, scale: 1,
  features: [
    { id: 'feat-star', type: 'star', space: { X: 0, Y: 0, Z: 0 }, size: 5.2 },
    { id: HOST_ID, type: 'rocky', space: { X: 18, Y: -3, Z: -15 }, size: 1.76 },
  ],
  laneGates: [], contacts: [],
}

function fleetFixture(id: string, over: Record<string, unknown> = {}) {
  return {
    id, corporationId: 'corp-1', systemId: SYSTEM_ID, own: true, worldTime: T0, scale: 1,
    position: { X: 5, Y: 0, Z: 0 }, attachedTo: undefined as string | undefined,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-star', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'hauler' }], cargo: {}, cargoCapacity: 40, freeHold: 40, miningRate: 0, fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02 },
    ...over,
  }
}

function burningFleet(id: string) {
  return fleetFixture(id, {
    state: {
      Mode: 0, Park: null, Drift: null,
      Burn: {
        Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: HOST_ID, Point: null }, Intercept: { X: 18, Y: -3, Z: -15 },
        Curve: [], Length: 1, DepartMs: T0 - 1_000, ArriveMs: T0 + 5_000, Accel: 1, InsertionPhase: 0,
      },
    },
  })
}

function landedAttachedFleet(id: string) {
  return fleetFixture(id, {
    attachedTo: HOST_ID,
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: HOST_ID, Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
  })
}

const fleetsRefetch = vi.fn()

function setReads(fleets: Record<string, unknown>[]) {
  useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  useMyFleets.mockReturnValue({ data: fleets, isLoading: false, isError: false, refetch: fleetsRefetch })
}

let qc: QueryClient
function renderView() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrap = (node: React.ReactElement) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>
  const rendered = rtlRender(wrap(<SystemSpaceView systemId={SYSTEM_ID} />))
  return { ...rendered, rerender: () => rendered.rerender(wrap(<SystemSpaceView systemId={SYSTEM_ID} />)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListRunning.mockResolvedValue([])
  mockListSettled.mockResolvedValue([])
  stage.available = true
  stage.firstFrame = true
})

describe('SystemSpaceView + ScanControl — real network-level scan-target refetches (link8b-adversary-r8, F1/F2/F5/F6)', () => {
  // Scenario: A landed arrival refetches the target list.
  it('F5: re-issues a REAL network scan-targets read once the acting fleet lands and attaches, with no user action', async () => {
    mockScanTargets
      .mockResolvedValueOnce([]) // mount, mid-burn: nothing in range
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // after landing

    setReads([burningFleet(FLEET_A)])
    const { rerender } = renderView()

    await waitFor(() => expect(screen.getByText('No host is in range to sweep.')).toBeInTheDocument())
    expect(mockScanTargets).toHaveBeenCalledTimes(1)

    setReads([landedAttachedFleet(FLEET_A)])
    rerender()

    await waitFor(
      () => {
        expect(
          mockScanTargets,
          'F5: no SECOND network-level scan-targets read was issued after the acting fleet landed and attached',
        ).toHaveBeenCalledTimes(2)
      },
      { timeout: 3_000 },
    )
    // task 6.15: "...sees the newly attached host offered" — not merely
    // that SOME select renders, but that the specific host the fleet
    // attached to is what the second read's data actually offers.
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
  })

  // Scenario: A failed refetch drops the stale list rather than restating it.
  it('F1: a failed refetch shows the retriable error, never the stale "no host is in range" claim', async () => {
    mockScanTargets
      .mockResolvedValueOnce([]) // mount, mid-burn: legitimately empty
      .mockRejectedValueOnce(new Error('scan-targets: 500')) // the triggered refetch fails

    setReads([burningFleet(FLEET_A)])
    const { rerender } = renderView()

    await waitFor(() => expect(screen.getByText('No host is in range to sweep.')).toBeInTheDocument())

    setReads([landedAttachedFleet(FLEET_A)])
    rerender()

    await waitFor(() => expect(mockScanTargets).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(
        screen.queryByText('No host is in range to sweep.'),
        'system-space-view "A failed refetch drops the stale list rather than restating it": the stale ' +
          'empty-set claim is still shown after the triggered refetch failed',
      ).not.toBeInTheDocument()
      expect(screen.getByText('The available scan targets could not be read.')).toBeInTheDocument()
    })
  })

  // Scenario: Changing the acting fleet refetches the list (strengthened).
  it('F2: an A -> B -> A re-selection issues a NEW network read for A, never A\'s earlier page', async () => {
    let callsForA = 0
    mockScanTargets.mockImplementation(async (fleetId: string) => {
      if (fleetId === FLEET_A) {
        callsForA += 1
        return callsForA === 1 ? [] : [{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]
      }
      return [{ hostId: 'feat-body-1', kind: 'body', durationMs: 1_000 }]
    })

    setReads([fleetFixture(FLEET_A), fleetFixture(FLEET_B)])
    renderView()

    // A is acting by default (roster's first non-transit own fleet).
    await waitFor(() => expect(mockScanTargets).toHaveBeenCalledWith(FLEET_A))
    expect(callsForA).toBe(1)

    // Select B.
    const user = userEvent.setup()
    await user.click(screen.getByTestId(`fleet-row-${FLEET_B}`))
    await waitFor(() => expect(mockScanTargets).toHaveBeenCalledWith(FLEET_B))

    // Re-select A.
    await user.click(screen.getByTestId(`fleet-row-${FLEET_A}`))
    await waitFor(
      () => {
        expect(
          callsForA,
          'focused-scan "Changing the acting fleet refetches the list": re-selecting A served a page cached ' +
            'under an earlier selection instead of issuing a fresh network read',
        ).toBe(2)
      },
      { timeout: 3_000 },
    )
  })

  // Scenario: A settled sweep refetches the target list (system-space-view,
  // requirement "A Running Sweep Self-Schedules the Refetch That Settles
  // It, Then Reads the Inbox and the Pile" + its own named scenario).
  // SDET-added 2026-09-03, closing a coverage gap a live Playwright run
  // surfaced (this scenario was already in the spec's own scenario list;
  // nothing in this file had ever driven a genuine ETA-triggered settle
  // through the real `ScanSweepWatcher`).
  //
  // The interior refetch is held OPEN on a controllable deferred promise —
  // never resolved by the mocked `useSystemSpace().refetch` until the test
  // says so — so this test can tell "fired concurrently with the settling
  // read" (wrong: races the backend's own `resolveDue`, which only that
  // read triggers) from "fired only once that read has completed" (right,
  // per the requirement's own prose: "only after that interior refetch has
  // completed, never concurrently with it").
  it('Scenario: A settled sweep refetches the target list', async () => {
    const RUNNING_ACTION_ID = 'action_running_settle_1'
    let scanTargetsCalls = 0
    const order: string[] = []
    let resolveInterior: (() => void) | null = null

    mockScanTargets.mockImplementation(async () => {
      scanTargetsCalls += 1
      // Decision 15: definitionally empty while the sensor channel is held.
      if (scanTargetsCalls === 1) return []
      order.push(`scan-targets-call-${scanTargetsCalls}`)
      return [{ hostId: HOST_ID, kind: 'body', durationMs: 2_000 }]
    })
    mockListRunning
      .mockResolvedValueOnce([
        {
          id: RUNNING_ACTION_ID,
          type: 'scan',
          actor: FLEET_A,
          scope: SYSTEM_ID,
          committedAt: T0 - 1_000,
          eta: T0 + 5_000,
          status: 'running',
          worldTime: T0,
        },
      ])
      .mockResolvedValue([])

    useSystemSpace.mockReturnValue({
      data: INTERIOR,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInterior = () => {
              order.push('interior-refetch-resolved')
              resolve()
            }
          }),
      ),
    })
    useMyFleets.mockReturnValue({
      data: [landedAttachedFleet(FLEET_A)],
      isLoading: false,
      isError: false,
      refetch: vi.fn(async () => undefined),
    })

    vi.useFakeTimers()
    try {
      renderView()

      // Mount: the running sweep holds the channel — the served set is
      // legitimately empty, and the control says so (never "no host in
      // range", which is reserved for the case nothing explains).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(scanTargetsCalls).toBe(1)

      // Past the sweep's ETA plus the view's own cushion: `ScanSweepWatcher`
      // fires `resyncInterior()`, whose returned promise this test is
      // holding open on purpose.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000)
      })

      expect(
        scanTargetsCalls,
        'system-space-view "...only after that interior refetch has completed, never concurrently with ' +
          'it": a second network-level scan-targets read fired before the settling interior refetch ever ' +
          'resolved',
      ).toBe(1)

      // Now let the interior refetch complete — the real settle.
      await act(async () => {
        resolveInterior?.()
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(
        scanTargetsCalls,
        'system-space-view "A settled sweep refetches the target list": no fresh scan-target read followed ' +
          'the settled sweep',
      ).toBe(2)
      expect(
        order,
        'the scan-target re-read must be sequenced AFTER the interior refetch resolves, never before it',
      ).toEqual(['interior-refetch-resolved', 'scan-targets-call-2'])
    } finally {
      vi.useRealTimers()
    }

    await waitFor(() =>
      expect(
        screen.queryByText('No host is in range to sweep.'),
        'the held-channel empty set must not be re-offered as "no host is in range" once the sweep settles',
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
  })

  // Scenario: Cancelling a sweep issues a fresh scan-targets read.
  it('F6: cancelling a running sweep issues a fresh network scan-targets read, offering real targets', async () => {
    const RUNNING_ACTION_ID = 'action_running_1'
    // Running, THEN cleared once the cancel succeeds and invalidates this
    // same query — a real cancel removes the action from the running
    // inbox; a mock that kept returning it forever would never let the
    // control's `running` branch clear, independent of anything under test.
    mockListRunning
      .mockResolvedValueOnce([
        { id: RUNNING_ACTION_ID, type: 'scan', actor: FLEET_A, scope: SYSTEM_ID, committedAt: T0 - 1_000, eta: T0 + 5_000, status: 'running', worldTime: T0 },
      ])
      .mockResolvedValue([])
    mockCancel.mockResolvedValue({ id: RUNNING_ACTION_ID, status: 'cancelled' })
    mockScanTargets
      .mockResolvedValueOnce([]) // Decision 15: definitionally empty while the sweep runs
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 2_000 }]) // fresh, post-cancel

    setReads([fleetFixture(FLEET_A)])
    renderView()

    await waitFor(() => expect(screen.getByTestId('scan-cancel')).toBeInTheDocument())
    expect(mockScanTargets).toHaveBeenCalledTimes(1)

    const user = userEvent.setup()
    await user.click(screen.getByTestId('scan-cancel'))

    await waitFor(
      () => {
        expect(
          mockScanTargets,
          'system-space-view "A Running Sweep\'s Window and Cancel Come From the Action Inbox": no fresh ' +
            'network-level scan-targets read followed a successful cancel',
        ).toHaveBeenCalledTimes(2)
      },
      { timeout: 3_000 },
    )
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toBeInTheDocument())
  })

  // Scenario: An accepted commit is never followed by the empty-set copy
  // (system-space-view — ADDED 2026-09-03, closing the commit-time twin of
  // A2/link8b-adversary-r9: A2 covers the SETTLE instant where the
  // running-status read lands before the scan-target read catches up; this
  // is the inverse race, at the COMMIT instant, where the scan-target
  // refetch (triggered by `useScan`'s own onSuccess invalidation) resolves
  // to the Decision-15 held-channel empty set BEFORE the running-status
  // refetch (the SAME invalidation, the other query) lands with the
  // just-committed sweep. Between those two reads, nothing distinguishes
  // "empty because nothing is in range" from "empty because the sensor
  // channel this very commit just claimed is held" — so the control must
  // show neither the empty-set copy nor a commit control, only that the
  // commit was accepted and its window is still being confirmed.
  //
  // PROPOSED test id: `scan-commit-pending` (told to the developer in the
  // SDET's own handoff report — no existing id names this state).
  it('Scenario: An accepted commit is never followed by the empty-set copy', async () => {
    const RUNNING_ACTION_ID = 'action_committed_1'

    mockScanTargets
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // mount: a real target
      .mockResolvedValue([]) // triggered by the commit: Decision 15's held-channel empty set
    mockListRunning.mockResolvedValueOnce([]) // mount: no running sweep yet

    let resolveRunning!: (actions: unknown[]) => void
    mockListRunning.mockImplementationOnce(
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveRunning = resolve
        }),
    )

    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    renderView()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    // The commit is accepted and its OWN scan-targets refetch has already
    // resolved to the held-channel empty set — but the running-status
    // refetch (the read that would explain it) is still the pending
    // promise above. Neither the empty-set copy nor a commit control may
    // be shown in this window.
    await waitFor(() => expect(mockScanTargets).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      const text = screen.getByTestId('scan-control').textContent?.toLowerCase() ?? ''
      expect(
        text,
        'system-space-view "An accepted commit is never followed by the empty-set copy": the held-channel ' +
          'empty set was reported as "no host is in range" before the running-status read confirmed the ' +
          'commit',
      ).not.toContain('no host is in range')
      expect(
        screen.queryByTestId('scan-commit-button'),
        'an accepted commit awaiting its confirming read must not re-offer a commit control',
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByTestId('scan-commit-pending'),
      'no committed/awaiting-window state was shown between the accepted commit and the running-status ' +
        'read that confirms it',
    ).toBeInTheDocument()

    // Now let the running-status read land with the just-committed sweep —
    // the countdown must appear, with no further user action.
    resolveRunning([
      {
        id: RUNNING_ACTION_ID,
        type: 'scan',
        actor: FLEET_A,
        scope: SYSTEM_ID,
        committedAt: T0,
        eta: T0 + 3_000,
        status: 'running',
        worldTime: T0,
      },
    ])
    await waitFor(() => expect(screen.getByTestId('scan-countdown')).toBeInTheDocument())
  })

  // link8b-adversary-r10, ruling P1 (both halves) + P3 + P5 — the pending
  // window's own exits. Round 10 found the committed-and-awaiting-window
  // state (added for the commit-time race above) has no exit but success:
  // a failed or an already-settled running-status read hangs it forever
  // (P1, BLOCKER), a remount inside the window loses it entirely because
  // it is pure local `useState` (P3, MAJOR), and cancel is unspecified
  // inside the window (P5, MAJOR). SDET note for the developer: these were
  // confirmed RED against the tree as it stood when written; the writer is
  // implementing after the current Playwright run finishes.

  // P1, first half — Scenario: A failed running-status read ends the
  // pending state rather than hanging it.
  it('P1a: a failed running-status read after an accepted commit shows the failed-read state, never an indefinite scan-commit-pending', async () => {
    mockScanTargets
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // mount
      .mockResolvedValue([]) // triggered by the commit
    mockListRunning
      .mockResolvedValueOnce([]) // mount: no running sweep
      .mockRejectedValueOnce(new Error('actions: 500')) // triggered by the commit: FAILS
    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    renderView()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    await waitFor(() => {
      expect(
        screen.getByText(/could not be read/i),
        'link8b-adversary-r10 P1: a failed running-status read after an accepted commit must end the ' +
          'pending state and show the failed-read state, not hang indefinitely',
      ).toBeInTheDocument()
      expect(
        screen.queryByTestId('scan-commit-pending'),
        'the pending presentation must not survive a running-status read that failed outright',
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('scan-commit-button'),
        'a failed running-status read must not re-offer a fresh commit control either',
      ).not.toBeInTheDocument()
    })
  })

  // P1, second half — the sweep settled inside the round trip: the
  // running-status read lands showing nothing running, while the
  // settled-status read already carries the outcome.
  it('P1b: a running-status read showing nothing running, because the sweep already settled, hands off to the settled report rather than an indefinite scan-commit-pending', async () => {
    const SETTLED_ACTION_ID = 'action_settled_inside_roundtrip'
    mockScanTargets
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // mount
      .mockResolvedValue([]) // triggered by the commit
    mockListRunning.mockResolvedValue([]) // never shows a running sweep — it already settled
    mockListSettled.mockResolvedValue([
      {
        id: SETTLED_ACTION_ID,
        type: 'scan',
        actor: FLEET_A,
        scope: SYSTEM_ID,
        committedAt: T0 - 5_000,
        eta: T0 - 1_000,
        status: 'done',
        resolvedAt: T0 - 500,
        worldTime: T0,
      },
    ])
    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    renderView()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    // The running-status read's own (second) call must actually have
    // resolved before this means anything.
    await waitFor(() => expect(mockListRunning).toHaveBeenCalledTimes(2))

    await waitFor(() => {
      expect(
        screen.getByTestId('scan-report'),
        'the settled report must be shown once the running-status read confirms nothing is running',
      ).toBeInTheDocument()
      expect(
        screen.queryByTestId('scan-commit-pending'),
        'link8b-adversary-r10 P1: a running-status read landing with nothing running, because the sweep ' +
          'already settled inside the round trip, must end the pending state — not hang it indefinitely ' +
          'alongside the settled report',
      ).not.toBeInTheDocument()
    })
  })

  // link8b-adversary-r11, finding F11-1 (BLOCKER, ACCEPTED) — the early-
  // settle exit's own post-settle follower reads. P1b (above) PRE-SEEDS
  // `mockListSettled` with the settled action before the commit even
  // happens (`mockListSettled.mockResolvedValue([...])`, used for EVERY
  // call including the one at mount), so it proves the hand-off (the
  // settled report renders) but cannot observe whether the follower reads
  // were actually ISSUED as a consequence of the window ending — the
  // settled-status query was already fresh from mount, before the commit
  // was ever made. This sibling starts `mockListSettled` EMPTY at mount and
  // holds the running-status read open past the commit, so the settled
  // report can only ever appear if the system issues a genuinely FRESH
  // settled-status read once the window ends — exactly what F11-1's new
  // paragraph and scenario ("A sweep that settles inside the commit round
  // trip still reports") mandate, alongside a fresh sighting-pile read and
  // a fresh scan-target read.
  //
  // EXPECTED RED: `ScanSweepWatcher` (`SystemSpaceView.tsx:129-188`) only
  // arms its timer when `runningScan.data?.eta != null` — on this path the
  // client never read a running sweep at all (it settled before the
  // running-status read landed), so no eta was ever observed and no timer
  // is ever armed. None of the three follower reads fire, so the settled
  // report never appears and the control falls back to the held-channel
  // empty set's "No host is in range to sweep." — the exact defect this
  // scenario forbids.
  it('Scenario: A sweep that settles inside the commit round trip still reports', async () => {
    const SETTLED_ACTION_ID = 'action_settled_inside_roundtrip_f11'
    let resolveRunning!: (actions: unknown[]) => void
    let settledCalls = 0
    let scanTargetsCalls = 0

    mockScanTargets.mockImplementation(async () => {
      scanTargetsCalls += 1
      if (scanTargetsCalls === 1) return [{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }] // mount
      return [] // every post-commit call: the held-channel empty set (Decision 15)
    })
    mockListSettled.mockImplementation(async () => {
      settledCalls += 1
      // Nothing settled at mount. The ONLY way this test can ever see the
      // settled action below is a genuinely FRESH network-level call,
      // issued as a consequence of the window ending — never data that was
      // already sitting in the cache from an earlier, coincidental fetch.
      return settledCalls === 1
        ? []
        : [
            {
              id: SETTLED_ACTION_ID,
              type: 'scan',
              actor: FLEET_A,
              scope: SYSTEM_ID,
              committedAt: T0 - 5_000,
              eta: T0 - 1_000,
              status: 'done',
              resolvedAt: T0 - 500,
              worldTime: T0,
            },
          ]
    })
    mockListRunning
      .mockResolvedValueOnce([]) // mount: no running sweep
      .mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveRunning = resolve
          }),
      ) // triggered by the commit: held open until this test releases it below

    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    renderView()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    // Confirm the commit's own onSuccess invalidation has actually fired
    // (the second scan-targets call, and the running-status read now held
    // open) BEFORE releasing it — so what follows is unambiguously a
    // consequence of the window ENDING, not of the commit itself.
    await waitFor(() => expect(mockListRunning).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(scanTargetsCalls).toBeGreaterThanOrEqual(2))
    const scanTargetsCallsAtCommit = scanTargetsCalls
    const settledCallsAtCommit = settledCalls
    const sightingsCallsAtCommit = sightingsRefetch.mock.calls.length

    // Release the running-status read: it lands showing NOTHING running —
    // the sweep settled before it landed. This is the window's
    // early-settle exit.
    resolveRunning([])

    // F11-1's own three follower reads, each a genuinely FRESH network
    // call issued as a consequence of the window ending.
    await waitFor(
      () => {
        expect(
          settledCalls,
          'link8b-adversary-r11 F11-1: the early-settle exit must issue that fleet\'s SETTLED-STATUS inbox ' +
            'read — no ETA-scheduled trigger for it exists on this path, since the client never read a ' +
            'running sweep to schedule one',
        ).toBeGreaterThan(settledCallsAtCommit)
        expect(
          scanTargetsCalls,
          'link8b-adversary-r11 F11-1: the early-settle exit must issue a FRESH scan-target read, so the ' +
            'empty set served while the sensor channel was held is never re-offered as "no host is in range"',
        ).toBeGreaterThan(scanTargetsCallsAtCommit)
        expect(
          sightingsRefetch.mock.calls.length,
          'link8b-adversary-r11 F11-1: the early-settle exit must issue the open system\'s SIGHTING-PILE read',
        ).toBeGreaterThan(sightingsCallsAtCommit)
      },
      { timeout: 3_000 },
    )

    // And the outcome is actually reported — the control must not fall
    // back to "no host is in range" off the empty set served while the
    // sensor channel was held, which is exactly the defect this scenario
    // exists to forbid.
    await waitFor(() => {
      expect(
        screen.queryByText('No host is in range to sweep.'),
        'link8b-adversary-r11 F11-1: the held-channel empty set must not be re-offered as "no host is in ' +
          'range" one instant after the window that forbade it',
      ).not.toBeInTheDocument()
      expect(
        screen.getByTestId('scan-report'),
        'the settled sweep\'s outcome must be reported once its post-settle follower read lands',
      ).toBeInTheDocument()
    })
  })

  // P3 — Scenario: the pending presentation persists across a remount
  // while the window is open (it is a property of the WINDOW, not of one
  // mount — a panel collapse/expand must not lose it and fall back to
  // "No host is in range").
  it('P3: the pending presentation survives an unmount/remount while the running-status refetch is still in flight', async () => {
    let resolveRunning!: (actions: unknown[]) => void
    mockScanTargets
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // mount
      .mockResolvedValue([]) // triggered by the commit: Decision 15's held-channel empty set
    mockListRunning
      .mockResolvedValueOnce([]) // mount: no running sweep
      .mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveRunning = resolve
          }),
      ) // triggered by the commit: held open, simulating "still in flight"
    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    const rendered = renderView()
    const stableQc = qc // the SAME QueryClient survives the remount below; only the component tree does not

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    // Before the remount: pending, as F5/the earlier commit-race test
    // already establish — the control-group half of this test.
    await waitFor(() => expect(screen.getByTestId('scan-commit-pending')).toBeInTheDocument())

    // A remount that is NOT a re-selection (e.g. the fleet panel collapsing
    // and reopening) — the SAME QueryClient, so the cache (scan-targets
    // already resolved to [], running-status still the SAME in-flight
    // promise) survives, but `committedPending`'s local `useState` does
    // not.
    rendered.unmount()
    rtlRender(
      <QueryClientProvider client={stableQc}>
        <SystemSpaceView systemId={SYSTEM_ID} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(
        screen.queryByText('No host is in range to sweep.'),
        'link8b-adversary-r10 P3: a remount inside the pending window must not restore "no host is in ' +
          'range" — the presentation is a property of the WINDOW (still-open running-status refetch), not ' +
          'of one mount\'s local state',
      ).not.toBeInTheDocument()
      expect(
        screen.getByTestId('scan-commit-pending'),
        'the pending presentation must survive the remount while the running-status refetch is still open',
      ).toBeInTheDocument()
    })

    // Clean up the still-open promise so it cannot leak into a later test.
    resolveRunning([])
  })

  // P5 — Scenario: no cancel affordance is offered while the window is
  // open, and no fleet-level cancel request is issued in its place.
  it('P5: no cancel affordance is rendered in the pending window, and no cancel request is issued', async () => {
    let resolveRunning!: (actions: unknown[]) => void
    mockScanTargets
      .mockResolvedValueOnce([{ hostId: HOST_ID, kind: 'body', durationMs: 3_000 }]) // mount
      .mockResolvedValue([])
    mockListRunning
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveRunning = resolve
          }),
      )
    mockScan.mockResolvedValue(fleetFixture(FLEET_A))

    setReads([fleetFixture(FLEET_A)])
    renderView()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('scan-target-select')).toHaveTextContent(HOST_ID))
    await user.selectOptions(screen.getByTestId('scan-target-select'), HOST_ID)
    await user.click(screen.getByTestId('scan-commit-button'))

    await waitFor(() => expect(screen.getByTestId('scan-commit-pending')).toBeInTheDocument())

    expect(
      screen.queryByTestId('scan-cancel'),
      'link8b-adversary-r10 P5: no cancel affordance may be offered inside the pending window — the ' +
        'action id it would need arrives only with the running-status read',
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('scan-control')).queryByRole('button', { name: /cancel/i }),
      'no cancel-labelled control of any kind may render inside scan-control while the window is open',
    ).not.toBeInTheDocument()
    expect(
      mockCancel,
      'no cancel request may be issued (fleet-level or otherwise) while the window is open, since no ' +
        'action id is available yet',
    ).not.toHaveBeenCalled()

    resolveRunning([])
  })
})
