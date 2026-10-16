import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Profiler } from 'react'

// RED-PHASE SUITE — openspec change `fix-world-time-render-loop`,
// `system-space-view`'s ADDED *Animation Never Re-Renders the View, and
// Never Starves a Navigation* (tasks 2.1, 2.2, 2.3, 2.5), plus 3.3's new
// `data-world-time` coarse assertion and 3.6's second half (impl contract
// §10.1, F8). SpaceStage is REAL here — `SystemSpaceView.test.tsx` mocks it
// at its seam, so none of these frame-level claims are provable there.
//
// Mocks copied from `SystemSpaceView.test.tsx`'s data-source seam, WITHOUT
// its `./SpaceStage` mock (F8).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ systemId: 'sys_-7_17' }),
  usePathname: () => '/systems/sys_-7_17',
  useSearchParams: () => new URLSearchParams(),
}))

const useSystemSpace = vi.fn()
const useMyFleets = vi.fn()
const useRunningMine = vi.fn()
const useStation = vi.fn()
const useMarketBoard = vi.fn()

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
vi.mock('@/hooks/use-actions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-actions')
  return { ...actual, useRunningMine: () => useRunningMine(), useCancelAction: () => mutations.cancelAction }
})
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
vi.mock('@/components/corporation-provider', () => ({
  useCorporationOptional: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1250 }),
  useCorporation: () => ({ id: 'corp-1', name: 'SDET Corp', credits: 1250 }),
  useCorporationSessionOptional: () => ({
    corporation: { id: 'corp-1', name: 'SDET Corp', credits: 1250 },
    isError: false,
  }),
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
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// Spy `buildSceneModel` with a passthrough (impl contract §10 item 4): both
// the loop and the view import the same module id, so both are spied.
const sceneSpyCalls = vi.hoisted(() => [] as { input: unknown; result: unknown }[])
vi.mock('./space-scene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./space-scene')>()
  const spy = vi.fn((input: Parameters<typeof actual.buildSceneModel>[0]) => {
    const result = actual.buildSceneModel(input)
    sceneSpyCalls.push({ input, result })
    return result
  })
  return { ...actual, buildSceneModel: spy }
})

import { SystemSpaceView } from './SystemSpaceView'
import { REDUCED_MOTION_QUERY } from '@/hooks/use-reduced-motion'

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
      resources: [],
      orbitElements: { parentId: 'feat-star', radius: 24, periodMs: 18_591, phase: 373_097, inclination: 500_434, node: 205_958 },
    },
  ],
  laneGates: [],
  contacts: [
    { position: { X: 200, Y: 4, Z: -60 }, velocity: { X: 2.5, Y: 0, Z: -1 }, emitting: true, scanning: false },
  ],
}

/** A burning fleet with a REAL curve — `SystemSpaceView.test.tsx`'s own
 * `burningFleet()` has `Curve: []`, so its mark would never move (impl
 * contract §10 item 9). */
function burningFleet(over: Record<string, unknown> = {}) {
  return {
    id: 'fleet_1',
    corporationId: 'corp-1',
    systemId: SYSTEM_ID,
    own: true,
    worldTime: T0,
    scale: 1,
    position: { X: 18, Y: -3, Z: -15 },
    attachedTo: undefined,
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 0, Y: 0, Z: 0 },
        Target: { BodyId: 'feat-body-0', Point: null },
        Intercept: { X: 18, Y: -3, Z: -15 },
        Curve: [
          { X: 0, Y: 0, Z: 0 },
          { X: 3, Y: 0, Z: 0 },
          { X: 7, Y: 0, Z: 1 },
          { X: 11, Y: 0, Z: 2 },
          { X: 15, Y: -1, Z: 3 },
          { X: 18, Y: -3, Z: -15 },
        ],
        Length: 30,
        DepartMs: T0 - 1_000,
        ArriveMs: T0 + 120_000,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
    roster: {
      ships: [{ class: 'hauler' }],
      cargo: { fuel: 12 },
      cargoCapacity: 40,
      freeHold: 25,
      miningRate: 0.001,
      fuelPricePerTon: 5,
    },
    ...over,
  }
}

function setReads(
  interior: Partial<{ data: unknown; isLoading: boolean; isError: boolean; error: unknown }> = {},
  fleets: Partial<{ data: unknown; isLoading: boolean; isError: boolean }> = {},
) {
  useSystemSpace.mockReturnValue({ data: INTERIOR, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...interior })
  useMyFleets.mockReturnValue({ data: [burningFleet()], isLoading: false, isError: false, refetch: vi.fn(), ...fleets })
}

beforeEach(() => {
  vi.clearAllMocks()
  sceneSpyCalls.length = 0
  useRunningMine.mockReturnValue({ data: null })
  useStation.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 404 }, refetch: vi.fn() })
  useMarketBoard.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })
  setReads()
})

function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <SystemSpaceView systemId={SYSTEM_ID} />
    </QueryClientProvider>,
  )
}

function renderProfiled(onRender: React.ProfilerOnRenderCallback) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <Profiler id="view" onRender={onRender}>
        <SystemSpaceView systemId={SYSTEM_ID} />
      </Profiler>
    </QueryClientProvider>,
  )
}

/** Settles the dynamic SpaceWorld import, the Suspense reveal, the
 * availability/first-frame callbacks, and the first coarse tick at t=1000
 * (impl contract §10 item 2). */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
}

describe('SystemSpaceView + the transform loop — task 2.1', () => {
  // Scenario: Frames pass without the view rendering
  it('Scenario: Frames pass without the view rendering', async () => {
    vi.useFakeTimers()
    try {
      const onRender = vi.fn()
      renderProfiled(onRender)
      await settle()
      // The dynamic renderer import finishes independently of fake world time.
      await vi.waitFor(() => expect(screen.queryByTestId('camera-recenter')).not.toBeNull())
      // Fleet following keeps the ship centered; use the overview to test screen motion.
      fireEvent.click(screen.getByTestId('camera-recenter'))
      await settle()
      onRender.mockClear()

      const before = screen.getByTestId('fleet-mark-fleet_1').style.transform
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          vi.advanceTimersToNextFrame()
        })
      }
      const after = screen.getByTestId('fleet-mark-fleet_1').style.transform

      expect(onRender, 'the view must not render because a frame passed').not.toHaveBeenCalled()
      expect(after, "the burning fleet's hit target must have moved between the first and last frame").not.toBe(
        before,
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView + the transform loop — task 2.2', () => {
  // Scenario: A counting figure advances without a per-frame render
  it('Scenario: A counting figure advances without a per-frame render', async () => {
    vi.useFakeTimers()
    try {
      const onRender = vi.fn()
      renderProfiled(onRender)
      await settle()
      onRender.mockClear()

      const R0 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))
      // Driven as 125 discrete 16ms advances, each its OWN `act()` — a
      // single `advanceTimersByTimeAsync(2000)` call lets React's automatic
      // batching coalesce every state update queued before the next real
      // yield into one commit, which would hide a genuine per-frame render
      // defect behind a false-passing render count (an artifact of the fake
      // timer harness, not evidence the view does not re-render).
      for (let i = 0; i < 125; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(16)
        })
      }
      const R1 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))

      expect(R0 - R1, 'the elapsed world-ms span at scale 1').toBe(2_000)
      expect(onRender.mock.calls.length, 'no more than 3 renders in 2 seconds').toBeLessThanOrEqual(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView + the transform loop — task 2.3', () => {
  // Scenario: The animating view raises no update-depth diagnostic
  //
  // K8 (orchestrator ruling on F9): attempted against the pre-fix tree via a
  // standalone scratch probe before this suite was authored — 0/500 rAF
  // frames produced the diagnostic under jsdom + act + fake timers, in both
  // a per-frame `act()` and one batched `act()` around every frame. Recorded
  // honestly in the coverage table as NOT-OBSERVED-RED, per task 2.3's own
  // text ("a 2.3 that is green before group 3 is not evidence") and F9 (the
  // counter may not trip the way it does in a real browser). The assertion
  // below is not weakened for that — it is the target behaviour either way,
  // and the tier-4 journey's `[journey-console]` capture is this scenario's
  // real evidence (design.md Decision 5's own admission for navigation
  // applies here too).
  it('Scenario: The animating view raises no update-depth diagnostic', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderProfiled(vi.fn())
      await settle()
      errorSpy.mockClear()
      await act(async () => {
        for (let i = 0; i < 120; i++) vi.advanceTimersToNextFrame()
      })
      const hits = errorSpy.mock.calls.filter((c) => /Maximum update depth|nested update/i.test(String(c[0])))
      expect(hits).toEqual([])
    } finally {
      vi.useRealTimers()
      errorSpy.mockRestore()
    }
  })
})

describe('SystemSpaceView + the transform loop — task 3.3 (SDET-added: data-world-time is the coarse value)', () => {
  it('data-world-time on the sr-only space-world-clock span updates once per second, not once per frame', async () => {
    vi.useFakeTimers()
    try {
      render()
      await settle()
      const before = screen.getByTestId('space-world-clock').getAttribute('data-world-time')

      for (let i = 0; i < 10; i++) {
        await act(async () => {
          vi.advanceTimersToNextFrame()
        })
      }
      const afterFrames = screen.getByTestId('space-world-clock').getAttribute('data-world-time')
      expect(afterFrames, 'ten animation frames alone must not move the coarse stamp').toBe(before)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      const afterTick = screen.getByTestId('space-world-clock').getAttribute('data-world-time')
      expect(Number(afterTick)).toBeGreaterThan(Number(before))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView + the transform loop — task 3.6 (second half)', () => {
  it('a frame loop building at clock.now() before the first served reading renders without error', async () => {
    setReads({ data: undefined, isLoading: true }, { data: undefined, isLoading: true })
    vi.useFakeTimers()
    try {
      expect(() => render()).not.toThrow()
      expect(screen.getByTestId('space-loading')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersToNextFrame()
      })
      // Still no throw, and the clock reads 0 (design.md Decision 1) rather
      // than projecting against an uninitialized anchor.
      expect(screen.getByTestId('space-world-clock')).toHaveAttribute('data-world-time', '0')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SystemSpaceView + reduced motion — task 2.5 (OQ1, folded in)', () => {
  function installMatchMediaSpy(initial: boolean) {
    const listeners = new Set<(e: { matches: boolean; media: string }) => void>()
    const mql = {
      matches: initial,
      media: REDUCED_MOTION_QUERY,
      onchange: null,
      addEventListener: (_t: string, l: (e: { matches: boolean; media: string }) => void) => listeners.add(l),
      removeEventListener: (_t: string, l: (e: { matches: boolean; media: string }) => void) => listeners.delete(l),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      if (query === REDUCED_MOTION_QUERY) return mql as unknown as MediaQueryList
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList
    })
    return { fire: (next: boolean) => { mql.matches = next; for (const l of Array.from(listeners)) l({ matches: next, media: REDUCED_MOTION_QUERY }) } }
  }

  // Scenario: Reduced motion freezes decorative animation while positions
  // keep advancing (system-space-view/spec.md:1323-1337, already fully
  // specified — no delta). The mid-session toggle is required: a mount-only
  // read would satisfy the letter, not the "WHILE".
  it('Scenario: Reduced motion freezes decorative animation while positions keep advancing', async () => {
    const media = installMatchMediaSpy(false)
    vi.useFakeTimers()
    try {
      render()
      await settle()

      // Flip the preference MID-SESSION, not at mount.
      act(() => media.fire(true))

      sceneSpyCalls.length = 0
      await act(async () => {
        for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
      })

      expect(sceneSpyCalls.length, 'the loop must have built at least one frame in this window').toBeGreaterThan(0)
      for (const { input } of sceneSpyCalls) {
        expect((input as { reducedMotion: boolean }).reducedMotion).toBe(true)
      }

      const decoratives = new Set(
        sceneSpyCalls.map(({ result }) => (result as { decorativeTimeMs: number }).decorativeTimeMs),
      )
      expect(decoratives.size, 'decorativeTimeMs must be frozen at one constant value while reduced motion holds').toBe(1)

      const firstFleet = (sceneSpyCalls[0]!.result as { marks: { id: string; position: unknown }[] }).marks.find(
        (m) => m.id === 'fleet_1',
      )
      const lastFleet = (sceneSpyCalls.at(-1)!.result as { marks: { id: string; position: unknown }[] }).marks.find(
        (m) => m.id === 'fleet_1',
      )
      expect(lastFleet?.position, 'the fleet mark must keep advancing under world time').not.toEqual(
        firstFleet?.position,
      )

      // F2/K2: contacts are UNAFFECTED by the preference, not "kept
      // advancing" (they are frozen at their served position either way) —
      // equal to the same build with reducedMotion: false.
      const { buildSceneModel } = await import('./space-scene')
      const lastInput = sceneSpyCalls.at(-1)!.input as Parameters<typeof buildSceneModel>[0]
      const withMotion = buildSceneModel({ ...lastInput, reducedMotion: false })
      const withoutMotion = buildSceneModel({ ...lastInput, reducedMotion: true })
      const contactWith = withMotion.marks.find((m) => m.kind === 'contact')
      const contactWithout = withoutMotion.marks.find((m) => m.kind === 'contact')
      expect(contactWithout?.position).toEqual(contactWith?.position)
    } finally {
      vi.useRealTimers()
    }
  })
})
