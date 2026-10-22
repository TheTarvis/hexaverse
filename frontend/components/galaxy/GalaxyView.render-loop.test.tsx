import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Profiler } from 'react'

// RED-PHASE SUITE — `galaxy-view`'s ADDED *Animation Never Re-Renders the
// Galaxy View, and Never Starves a Navigation* (tasks 3.4a, 3.4b, 3.4c,
// 3.4d). Mocks copied from `GalaxyView.test.tsx`, WITHOUT a clock mock (the
// new module has no rAF to stub — F10) and WITH the fleet-list envelope's
// `scale`/`worldTime` surfaced directly on `useMyFleets`'s mocked result
// (impl contract §4).

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushSpy }) }))

vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (loader: () => Promise<any>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function DynamicMock(props: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [Comp, setComp] = React.useState<any>(null)
        React.useEffect(() => {
          let active = true
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Promise.resolve(loader()).then((c: any) => {
            if (active) setComp(() => c?.default ?? c)
          })
          return () => {
            active = false
          }
        }, [])
        return Comp ? <Comp {...props} /> : null
      },
  }
})

vi.mock('@/components/galaxy/GalaxyGraph', async () => {
  const React = await import('react')
  return {
    GalaxyGraph: ({
      galaxy,
      onSelect,
      onReady,
      onController,
      onRendererState,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }: any) => {
      const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
      React.useEffect(() => {
        const controller = { recenter: vi.fn(), focusSystem: vi.fn(), focusPoint: vi.fn(), canvas: () => canvasRef.current, pause: vi.fn(), resume: vi.fn(), retry: vi.fn() }
        onController?.(controller)
        onRendererState?.({ phase: 'ready', backend: 'webgpu', retrying: false })
        onReady?.(controller)
      }, [onReady, onController, onRendererState])
      return (
        <div data-testid="mock-graph">
          <canvas ref={canvasRef} data-testid="mock-graph-canvas" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {galaxy.nodes.map((n: any) => (
            <button key={n.id} data-testid={`select-${n.id}`} onClick={() => onSelect(n)}>
              {n.name}
            </button>
          ))}
        </div>
      )
    },
  }
})


vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))
vi.mock('@/hooks/use-fleets', () => ({
  useMyFleets: vi.fn(),
  useCutDrive: vi.fn(),
  useStop: vi.fn(),
  useJump: vi.fn(),
}))
vi.mock('@/hooks/use-scan', () => ({ useSettledScan: () => ({ data: null, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-actions', () => ({ useCancelAction: vi.fn(), useRunningMine: () => ({ data: null, isError: false, refetch: vi.fn() }), useRunningScan: () => ({ data: null, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-market', () => ({ useMarketBoard: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: null, account: null, signOut: vi.fn() }),
}))

import { GalaxyView } from './GalaxyView'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCutDrive, useJump, useMyFleets, useStop } from '@/hooks/use-fleets'
import { useCancelAction } from '@/hooks/use-actions'
import { useMarketBoard } from '@/hooks/use-market'
import type { Galaxy } from '@/lib/types/galaxy'
import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_PARKED } from '@/lib/types/fleet'

const mockUseGalaxy = vi.mocked(useGalaxy)
const mockUseMyFleets = vi.mocked(useMyFleets)
const mockUseCutDrive = vi.mocked(useCutDrive)
const mockUseStop = vi.mocked(useStop)
const mockUseJump = vi.mocked(useJump)
const mockUseCancelAction = vi.mocked(useCancelAction)
const mockUseMarketBoard = vi.mocked(useMarketBoard)

const T0 = 21_175_110_953

const galaxy: Galaxy = {
  id: 'gal_test',
  seed: 1,
  bounds: { x: [-100, 100], y: [-100, 100], z: [-30, 30] },
  worldTime: T0,
  nodes: [
    {
      id: 'sys-0',
      name: 'Axion',
      region: 'star_rich',
      tier: 'explored',
      skeleton: { starClass: 'G', bodies: [] },
      x: 1,
      y: 2,
      z: 3,
      fx: 1,
      fy: 2,
      fz: 3,
    },
  ],
  links: [],
}

function parkedFleet(over: Record<string, unknown> = {}): Fleet {
  return {
    id: 'fleet_1',
    corporationId: 'corp',
    systemId: 'sys-0',
    state: {
      Mode: SHIP_MODE_PARKED,
      Burn: null,
      Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
      Drift: null,
    },
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: T0,
    ...over,
  } as Fleet
}

function burningFleet(scale: number, arriveMs: number): Fleet {
  return parkedFleet({
    scale,
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: {
        Origin: { X: 0, Y: 0, Z: 0 },
        Target: { BodyId: 'p-1', Point: null },
        Intercept: { X: 1, Y: 0, Z: 0 },
        Curve: {},
        Length: 10,
        DepartMs: T0 - 1_000,
        ArriveMs: arriveMs,
        Accel: 1,
        InsertionPhase: 0,
      },
    },
  })
}

function mockGalaxyState(overrides: Partial<ReturnType<typeof useGalaxy>> = {}) {
  mockUseGalaxy.mockReturnValue({
    data: galaxy,
    isLoading: false,
    isError: false,
    error: null,
    isStartArea: false,
    ...overrides,
  } as ReturnType<typeof useGalaxy>)
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <GalaxyView />
    </QueryClientProvider>,
  )
}

function renderProfiled(onRender: React.ProfilerOnRenderCallback) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Profiler id="galaxy" onRender={onRender}>
        <GalaxyView />
      </Profiler>
    </QueryClientProvider>,
  )
}

// Exclude the decorative layer's initial lazy-module reveal from steady-state
// animation assertions; its lifecycle is covered by HudCardShell tests.
beforeAll(async () => { await import('@/components/hud/HudFrameLighting') })

beforeEach(() => {
  vi.clearAllMocks()
  mockGalaxyState()
  mockUseMyFleets.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMyFleets>)
  mockUseCutDrive.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useCutDrive>)
  mockUseStop.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useStop>)
  mockUseJump.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useJump>)
  mockUseCancelAction.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useCancelAction>)
  mockUseMarketBoard.mockReturnValue({ data: undefined, isLoading: false, isError: false } as unknown as ReturnType<typeof useMarketBoard>)
})

describe('GalaxyView + the coarse clock — task 3.4a', () => {
  // Scenario: Frames pass without the galaxy view rendering
  it('Scenario: Frames pass without the galaxy view rendering', async () => {
    vi.useFakeTimers()
    try {
      mockUseMyFleets.mockReturnValue({
        data: [burningFleet(1, T0 + 60_000)],
        scale: 1,
        worldTime: T0,
      } as unknown as ReturnType<typeof useMyFleets>)
      const onRender = vi.fn()
      renderProfiled(onRender)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      onRender.mockClear()
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          vi.advanceTimersToNextFrame()
        })
      }
      expect(onRender, 'the galaxy view must not render because a frame passed').not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: A drill-in issued while the view animates arrives — call-site
  // regression guard only (design.md Decision 5): a mocked router never
  // enters React's scheduler and cannot be starved.
  it('Scenario: A drill-in issued while the view animates arrives (call-site guard)', async () => {
    mockGalaxyState()
    renderView()
    fireEvent.click(await screen.findByTestId('select-sys-0'))
    fireEvent.click(screen.getByRole('button', { name: /^Enter selected system/ }))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  // Scenario: A roster burn redirect from the galaxy view commits while the
  // graph animates — same call-site guard.
  it('Scenario: A roster burn redirect from the galaxy view commits while the graph animates (call-site guard)', () => {
    mockUseMyFleets.mockReturnValue({ data: [parkedFleet()], scale: 1, worldTime: T0 } as unknown as ReturnType<typeof useMyFleets>)
    renderView()
    fireEvent.click(screen.getByTestId('fleet-cmd-burn-fleet_1'))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  // A roster row SELECTION for a fleet in another system issues no
  // router.push, only setSelectedId + focusSystem (GalaxyView.tsx:248-253).
  it('a roster row selection issues no router.push', async () => {
    mockUseMyFleets.mockReturnValue({ data: [parkedFleet()], scale: 1, worldTime: T0 } as unknown as ReturnType<typeof useMyFleets>)
    renderView()
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('fleet-row-fleet_1'))
    expect(pushSpy).not.toHaveBeenCalled()
  })
})

describe('GalaxyView + the coarse clock — task 3.4b', () => {
  // Scenario: A roster countdown advances without a per-frame render
  it('Scenario: A roster countdown advances without a per-frame render', async () => {
    vi.useFakeTimers()
    try {
      mockUseMyFleets.mockReturnValue({
        data: [burningFleet(1, T0 + 60_000)],
        scale: 1,
        worldTime: T0,
      } as unknown as ReturnType<typeof useMyFleets>)
      const onRender = vi.fn()
      renderProfiled(onRender)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
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

      expect(R0 - R1).toBe(2_000)
      expect(onRender.mock.calls.length).toBeLessThanOrEqual(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GalaxyView + the coarse clock — task 3.4c', () => {
  // Scenario: The projected clock runs at the served scale
  it('Scenario: The projected clock runs at the served scale', async () => {
    const scale = 60
    vi.useFakeTimers()
    try {
      mockUseMyFleets.mockReturnValue({
        data: [burningFleet(scale, T0 + 100_000_000)],
        scale,
        worldTime: T0,
      } as unknown as ReturnType<typeof useMyFleets>)
      renderView()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      const R0 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      const R1 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))
      expect(R0 - R1, 'projected at the served scale, not at an assumed 1').toBe(3_000 * scale)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GalaxyView + the coarse clock — task 3.4d', () => {
  // Scenario: The projected clock holds when no scale has been served
  it('Scenario: The projected clock holds when no scale has been served', async () => {
    vi.useFakeTimers()
    try {
      // A `useMyFleets` mock with NO `scale` anywhere (impl contract §10
      // item 9) — the own-fleets read has not yet landed with a scale.
      mockUseMyFleets.mockReturnValue({
        data: [burningFleet(undefined as unknown as number, T0 + 60_000)],
      } as unknown as ReturnType<typeof useMyFleets>)
      renderView()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      const R0 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      const R1 = Number(screen.getByTestId('fleet-row-eta-fleet_1').getAttribute('data-raw'))
      expect(R0 - R1, 'the projected world time must HOLD, never advance at an assumed scale').toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
