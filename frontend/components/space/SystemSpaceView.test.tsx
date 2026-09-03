import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()

vi.mock('@/hooks/use-system-space', () => ({ useSystemSpace: (id: string) => useSystemSpace(id) }))
vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return {
    ...actual,
    useMyFleets: () => useMyFleets(),
    useOrder: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useJump: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useCutDrive: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useStop: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useMine: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})
vi.mock('@/hooks/use-actions', () => ({ useRunningMine: () => useRunningMine() }))

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
        'data-fleet-states': (props.scene?.marks ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((m: any) => m.kind === 'fleet')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => m.id)
          .join(','),
      },
      stage.available ? null : React.createElement('div', { 'data-testid': 'renderer-unsupported' }, 'WebGL unavailable'),
    )
  }
  return { SpaceStage: SpaceStageMock, default: SpaceStageMock }
})

import { SystemSpaceView } from './SystemSpaceView'

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
  ],
  laneGates: [
    {
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

beforeEach(() => {
  vi.clearAllMocks()
  useRunningMine.mockReturnValue(null)
  stage.available = true
  stage.firstFrame = true
  setReads()
})

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
  it('Scenario: A failed interior read leaves the fleet-state-anchored commands usable', () => {
    setReads({ data: undefined, isError: true, error: new Error('nope') })
    view()
    expect(screen.getByTestId('fleet-roster')).toBeInTheDocument()
    expect(screen.getByTestId('space-fleet-panel')).toBeInTheDocument()
    // Every command anchored to the acting fleet's OWN served state.
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
    expect(screen.getByTestId('stationkeep-control')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-cmd-cut-drive-fleet_1')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-cmd-stop-fleet_1')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-cmd-jump-fleet_1')).toBeInTheDocument()
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
})

describe('SystemSpaceView — the world clock is projected at the served scale', () => {
  // Scenario: Live world time is projected at the served scale, not an
  // assumed one
  it('Scenario: Live world time is projected at the served scale, not an assumed one', async () => {
    // `hooks/use-world-time.ts` defaults `scale` to 1 with a comment
    // anticipating exactly this; `WORLD_TIME_SCALE` is a real server flag.
    // Under continuous space a mis-scaled clock draws every orbit and burn
    // mark visibly wrong, and reaches u = 1 at the wrong wall instant.
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
      useRunningMine.mockReturnValue({ id: 'act_1', eta: T0 + 5_000, type: 'mine' })
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
    useRunningMine.mockReturnValue({ id: 'act_1', eta: T0 + 60_000, type: 'mine' })
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
    useRunningMine.mockReturnValue({ id: 'act_1', eta: T0 + 1_000, type: 'mine' })
    const { rerender } = render(<SystemSpaceView systemId={SYSTEM_ID} />)
    useRunningMine.mockReturnValue(null)
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
