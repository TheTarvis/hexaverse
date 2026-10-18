// RED-phase suite for GalaxyView against the migrate-fleet-to-continuous-
// burns contract (design.md Decision 12; tasks.md 8.6, 8.7, 8.12).
//
// Cause for rewriting this whole file wholesale: `galaxy-view` REMOVED
// "Select-Preview-Commit Travel Gesture" (no route-preview/travel-button
// surface survives — a lane crossing is a single-hop `jump` commanded from
// the roster panel, attached to a gate, design.md Decision 10) and "Transit
// Fleet Selection and Card" (no `transitFleets`/lane-marker-click/fleet-card
// surface survives — a jump is atomic and single-hop, with no crawling
// mid-lane state to draw or click, design.md Decision 4/10). Both are
// "Superseded by nothing" per the delta — no successor test replaces them.
// `GalaxyGraph`'s props dropped `transitFleets`/`onSelectFleet` accordingly
// (component/galaxy/GalaxyGraph.tsx). `hooks/use-fleets.ts` dropped
// `useRoutePreview`/`useFleetTravel` entirely; `lib/types/fleet.ts` carries
// the mixed-case `space.ShipState` wire shape plus camelCase
// `attachedTo`/`jump`.
//
// What survives here (design.md Decision 12's roster-panel-as-command-
// surface precedent): burn/cut-drive/stop are composed and committed from
// this container via the mounted roster panel — burn has no target-naming
// surface at the galaxy tier, so it sends the player to the system board
// instead of guessing (`handleBurn`). `galaxy-view` MODIFIED "Own-Fleet
// Presence and Recenter Target" (components/galaxy/presence.ts) and ADDED
// "Bridge Lane Rendering Is Visually Distinct" (components/galaxy/
// bridge-lane-style.test.tsx) are pure-function/component-level concerns
// already pinned in their own test files — this file only re-verifies the
// CONTAINER wires their inputs through (the `fleetSystemIds`/`homeSystemId`
// props reaching `<GalaxyGraph>`), not their derivation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { GalaxyView } from './GalaxyView'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCutDrive, useJump, useMyFleets, useStop } from '@/hooks/use-fleets'
import { useCancelAction } from '@/hooks/use-actions'
import { useMarketBoard } from '@/hooks/use-market'
import { toast } from '@/lib/toast'
import type { Galaxy } from '@/lib/types/galaxy'
import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_PARKED } from '@/lib/types/fleet'
type TestRendererPhase = 'pending' | 'ready' | 'unavailable' | 'interrupted' | 'disposed'

function stubUnsupported() {
  graphBehavior.phase = 'unavailable'
  return () => { graphBehavior.phase = 'ready' }
}

// Spies the mocked graph hands back through onReady (recenter/focusSystem) so we
// can assert the controls drive the controller; graphPropsSpy captures the fleet
// marker / home props; pushSpy stands in for the router (drill-in navigation).
const { recenterSpy, focusSpy, focusPointSpy, graphPropsSpy, pushSpy, graphBehavior } = vi.hoisted(
  () => ({
    recenterSpy: vi.fn(),
    focusSpy: vi.fn(),
    focusPointSpy: vi.fn(),
    graphPropsSpy: vi.fn(),
    pushSpy: vi.fn(),
    // add-renderer-availability-states: a mutable switch the '@/components/galaxy/GalaxyGraph'
    // mock reads on every render — lets a single test make the mock throw
    // synchronously (simulating a creation failure that survived the
    // pre-flight probe, e.g. FG3D's own internal construction throw) without
    // needing a second mock module. Reset to false in beforeEach.
    graphBehavior: { throwOnRender: false, phase: 'ready' as TestRendererPhase },
  }),
)

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushSpy }) }))

// next/dynamic: resolve the loader and render the (mocked) GalaxyGraph. Keeps
// three.js off the test path entirely — jsdom has no WebGL.
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

// Stub the three.js renderer. Renders a select button per node and reports a
// controller via onReady so recenter is exercised. No `transitFleets`/
// `onSelectFleet` — the board draws no fleet-crawl layer any more
// (design.md Decision 12; galaxy-view REMOVED "Transit Fleet Selection and
// Card").
vi.mock('@/components/galaxy/GalaxyGraph', async () => {
  const React = await import('react')
  return {
    GalaxyGraph: ({
      galaxy,
      onSelect,
      onReady,
      onController,
      onRendererState,
      fleetSystemIds,
      homeSystemId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }: any) => {
      graphPropsSpy({ fleetSystemIds, homeSystemId })
      // Container tests receive owner snapshots; actual candidate wiring is
      // exercised independently by GalaxyGraph.test.tsx.
      const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
      const callbacks = React.useRef({ onReady, onController, onRendererState })
      callbacks.current = { onReady, onController, onRendererState }
      React.useEffect(() => {
        const controller = {
          recenter: recenterSpy, focusSystem: focusSpy, focusPoint: focusPointSpy,
          canvas: () => canvasRef.current, pause: vi.fn(), resume: vi.fn(),
          retry: () => callbacks.current.onRendererState?.({ phase: 'ready', backend: 'webgpu', retrying: false }),
        }
        callbacks.current.onController?.(controller)
        callbacks.current.onRendererState?.({ phase: graphBehavior.phase, backend: 'webgpu', retrying: false })
        if (graphBehavior.phase === 'ready') callbacks.current.onReady?.(controller)
        const canvas = canvasRef.current
        const lost = () => callbacks.current.onRendererState?.({ phase: 'interrupted', backend: 'webgl2', retrying: false })
        const restored = () => callbacks.current.onRendererState?.({ phase: 'ready', backend: 'webgl2', retrying: false })
        canvas?.addEventListener('webglcontextlost', lost)
        canvas?.addEventListener('webglcontextrestored', restored)
        return () => {
          canvas?.removeEventListener('webglcontextlost', lost)
          canvas?.removeEventListener('webglcontextrestored', restored)
        }
      }, [])
      // add-renderer-availability-states: simulates a construction throw
      // that survives the pre-flight probe (three/FG3D's own internal
      // throw) — the boundary GalaxyView wraps this component in must
      // convert it to the unsupported state.
      if (graphBehavior.throwOnRender) {
        throw new Error('fg3d construction boom')
      }
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

// Defensive: never let the real WebGL renderer load even if something imports it.


vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))

// Fleet/roster hooks + the world clock are mocked so the view renders
// synchronously without a live backend. `useCancelAction` is mocked because
// the mounted `<FleetRoster>` calls it directly (not through this view).
vi.mock('@/hooks/use-fleets', () => ({
  useMyFleets: vi.fn(),
  useCutDrive: vi.fn(),
  useStop: vi.fn(),
  useJump: vi.fn(),
}))
vi.mock('@/hooks/use-actions', () => ({ useCancelAction: vi.fn() }))
vi.mock('@/hooks/use-market', () => ({ useMarketBoard: vi.fn() }))
// fix-world-time-render-loop, task 3.4/K7: the old per-frame world-time hook
// this line used to mock is deleted (task 3.5); the new `@/lib/client-clock`
// module has no rAF to stub, so there is nothing to mock here any more (the
// mock line is removed, not repointed).
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The floating account chip reads auth context; default to logged-out (no chip).
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: null, account: null, signOut: vi.fn() }),
}))

const mockUseGalaxy = vi.mocked(useGalaxy)
const mockUseMyFleets = vi.mocked(useMyFleets)
const mockUseCutDrive = vi.mocked(useCutDrive)
const mockUseStop = vi.mocked(useStop)
const mockUseJump = vi.mocked(useJump)
const mockUseCancelAction = vi.mocked(useCancelAction)
const mockUseMarketBoard = vi.mocked(useMarketBoard)

const cutDriveMutate = vi.fn()
const stopMutate = vi.fn()
const jumpMutate = vi.fn()

// GalaxyView calls useQueryClient (for the arrival self-schedule); wrap in a
// provider. The fleet DATA comes from the mocked hooks above, not real queries.
function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<GalaxyView />, { wrapper })
}

function parkState() {
  return {
    Mode: SHIP_MODE_PARKED,
    Burn: null,
    Park: {
      Kind: 2,
      BodyId: '',
      Radius: 0,
      PeriodMs: 0,
      Phase: 0,
      EpochMs: 0,
      Offset: { X: 0, Y: 0, Z: 0 },
      Point: { X: 0, Y: 0, Z: 0 },
    },
    Drift: null,
  }
}

function parkedFleet(id: string, systemId: string): Fleet {
  return {
    id,
    corporationId: 'corp',
    systemId,
    state: parkState(),
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: 0,
  }
}

const galaxy: Galaxy = {
  id: 'gal_test',
  seed: 1,
  bounds: { x: [-100, 100], y: [-100, 100], z: [-30, 30] },
  worldTime: 0,
  nodes: [
    {
      id: 'sys-0',
      name: 'Axion',
      region: 'star_rich',
      tier: 'explored',
      skeleton: {
        starClass: 'G',
        bodies: [
          { type: 'rocky', ring: 3 },
          { type: 'gas_giant', ring: 9 },
        ],
      },
      x: 1,
      y: 2,
      z: 3,
      fx: 1,
      fy: 2,
      fz: 3,
    },
    {
      id: 'sys-1',
      name: 'Borealis',
      region: 'dead',
      tier: 'explored',
      skeleton: { starClass: 'M', bodies: [] },
      x: -4,
      y: 5,
      z: -6,
      fx: -4,
      fy: 5,
      fz: -6,
    },
  ],
  links: [{ id: 'lane-0', source: 'sys-0', target: 'sys-1', bridge: false }],
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

describe('GalaxyView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    graphBehavior.throwOnRender = false
  graphBehavior.phase = 'ready'
    // Default: no fleets, inert command mutations.
    mockUseMyFleets.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMyFleets>)
    mockUseCutDrive.mockReturnValue({ mutate: cutDriveMutate, isPending: false } as unknown as ReturnType<typeof useCutDrive>)
    mockUseStop.mockReturnValue({ mutate: stopMutate, isPending: false } as unknown as ReturnType<typeof useStop>)
    mockUseJump.mockReturnValue({ mutate: jumpMutate, isPending: false } as unknown as ReturnType<typeof useJump>)
    mockUseCancelAction.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useCancelAction>)
    mockUseMarketBoard.mockReturnValue({ data: undefined, isLoading: false, isError: false } as unknown as ReturnType<typeof useMarketBoard>)
  })

  it('retains Galaxy search and inspection through hide/reopen without navigating', () => {
    mockGalaxyState()
    renderView()
    const search = screen.getByRole('searchbox', { name: 'Find a galaxy system' })
    fireEvent.change(search, { target: { value: 'Axion' } })
    fireEvent.click(screen.getByTestId('galaxy-object-sys-0'))
    expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')
    expect(pushSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
    expect(search).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Objects (hidden)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to galaxy systems' }))
    expect(search).toHaveValue('Axion')
    expect(screen.queryByTestId('galaxy-object-sys-1')).not.toBeInTheDocument()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('removes Console and its statistics without relocating the overview', () => {
    mockGalaxyState(); renderView()
    expect(screen.queryByRole('button', { name: 'Console' })).toBeNull()
    expect(screen.queryByTestId('intel-panel')).toBeNull()
    expect(screen.getByRole('region', { name: 'Objects panel' })).toBeInTheDocument()
  })

  it('shows the inspector empty state until a node is selected', async () => {
    mockGalaxyState()
    renderView()

    await waitFor(() => expect(screen.getByTestId('inspector')).toHaveTextContent(/select a system/i))
    expect(screen.queryByTestId('inspector-name')).not.toBeInTheDocument()
  })

  it('populates the inspector when a node is selected', async () => {
    mockGalaxyState()
    renderView()

    // Wait for the dynamically-loaded (mocked) graph to mount.
    fireEvent.click(await screen.findByTestId('select-sys-0'))

    expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')
    expect(screen.getByTestId('inspector-region')).toHaveTextContent('Star-rich')
    // Skeleton is always drawn: star class + bodies.
    const inspector = screen.getByTestId('inspector')
    expect(inspector).toHaveTextContent('Class G')
    expect(inspector).toHaveTextContent(/rocky/i)
    expect(inspector).toHaveTextContent(/gas giant/i)
    // Connections = its lane count (1).
    expect(inspector).toHaveTextContent('1')
  })

  it('offers "Enter system" on a selected node and drills into its board', async () => {
    mockGalaxyState()
    renderView()

    // No selection → no Enter affordance.
    expect(screen.queryByRole('button', { name: /^Enter selected system/ })).not.toBeInTheDocument()

    fireEvent.click(await screen.findByTestId('select-sys-0'))
    fireEvent.click(screen.getByRole('button', { name: /^Enter selected system/ }))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  it('hides "Enter system" on the logged-out start area', async () => {
    mockGalaxyState({ isStartArea: true })
    renderView()

    fireEvent.click(await screen.findByTestId('select-sys-0'))
    expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')
    expect(screen.queryByRole('button', { name: /^Enter selected system/ })).not.toBeInTheDocument()
  })

  it('marks the fleet’s system on the graph and targets it as home', async () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({
      data: [parkedFleet('fleet_1', 'sys-0')],
    } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    await screen.findByTestId('mock-graph')

    const props = graphPropsSpy.mock.calls.at(-1)![0]
    expect(props.fleetSystemIds).toContain('sys-0')
    expect(props.homeSystemId).toBe('sys-0')
  })

  it('selects and glides to home on the wake-up handoff, then clears it', async () => {
    sessionStorage.setItem('wakeFocus', 'sys-1')
    mockGalaxyState()
    renderView()

    // The view selects the stashed home (inspector populates) and glides to it.
    await waitFor(() => expect(screen.getByTestId('inspector-name')).toHaveTextContent('Borealis'))
    expect(focusSpy).toHaveBeenCalledWith('sys-1')
    // Consumed once — the handoff is cleared so a reload doesn't re-snap.
    expect(sessionStorage.getItem('wakeFocus')).toBeNull()
  })

  it('does not retain the removed Console recenter button (Home belongs to shared camera controls)', () => {
    mockGalaxyState(); renderView()
    expect(screen.queryByTestId('galaxy-recenter')).toBeNull()
  })

  it('shows the sign-in prompt only when viewing the frozen start area', () => {
    mockGalaxyState({ isStartArea: true })
    const { rerender } = renderView()
    expect(screen.getByTestId('signin-prompt')).toBeInTheDocument()

    mockGalaxyState({ isStartArea: false })
    rerender(<GalaxyView />)
    expect(screen.queryByTestId('signin-prompt')).not.toBeInTheDocument()
  })

  it('renders a loading state while the galaxy is fetching', () => {
    mockGalaxyState({ data: undefined, isLoading: true })
    renderView()
    expect(screen.queryByTestId('intel-panel')).not.toBeInTheDocument()
    expect(screen.getByText(/charting the galaxy/i)).toBeInTheDocument()
  })

  it('renders an error state when the galaxy read fails', () => {
    mockGalaxyState({ data: undefined, isError: true, error: new Error('boom') })
    renderView()
    expect(screen.getByText(/couldn’t load the galaxy/i)).toBeInTheDocument()
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })

  it('shows a travelling fleet in the roster, with its route and a live ETA', () => {
    mockGalaxyState()
    const traveling: Fleet = {
      ...parkedFleet('fleet_1', 'sys-0'),
      // SDET repair (add-figure-formatting build adjudications, dispute 1):
      // this scenario's own name is "a live ETA" — that path only exercises
      // once a scale has been served. The absent-scale path has its own
      // dedicated coverage in FleetRoster.test.tsx ("A countdown renders
      // absent until a scale is served, never at an assumed scale of 1").
      scale: 1,
      jump: { laneId: 'lane-0', destSystemId: 'sys-1', departMs: 0, arriveMs: 660_000 },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    const row = screen.getByTestId('fleet-row-fleet_1')
    expect(row).toHaveTextContent('Axion → Borealis')
    expect(row).toHaveTextContent('In transit')
    // MIGRATION (task 6.3, openspec change `add-figure-formatting`):
    // fleet-row-eta-{id} is now a world-ms-span-left figure. The raw span is
    // asserted with a small tolerance (not an exact "660000") because
    // useWorldTime projects forward from mount, so a handful of wall-ms may
    // elapse before this assertion runs — the same tolerance the pre-
    // migration "11m" substring match already relied on.
    const countdown = screen.getByTestId('fleet-row-eta-fleet_1')
    expect(countdown).toHaveAttribute('data-unit', 'world-ms-span-left')
    const raw = Number(countdown.getAttribute('data-raw'))
    expect(raw).toBeGreaterThan(659_000)
    expect(raw).toBeLessThanOrEqual(660_000)
    expect(countdown).toHaveTextContent(/^11m \d{1,2}s left$/)
  })

  it('keeps a transit fleet selected in the galaxy vitals and offers destination navigation', async () => {
    mockGalaxyState()
    const traveling = { ...parkedFleet('fleet_transit', 'sys-0'), scale: 1, jump: { laneId: 'lane-0', destSystemId: 'sys-1', departMs: 0, arriveMs: 660_000 } }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()
    expect(screen.getByTestId('fleet-location-panel')).toHaveTextContent('Axion → Borealis')
    expect(screen.getByTestId('fleet-row-fleet_transit')).toHaveAttribute('aria-pressed', 'true')
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('focus-selected-fleet'))
    expect(focusSpy).toHaveBeenCalledWith('sys-1')
    expect(screen.queryByTestId('open-fleet-system')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Enter selected system/ }))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-1')
  })

  it('focuses a local fleet system, then enters only through the shared navigation action', async () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({ data: [parkedFleet('fleet_focus', 'sys-0')] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('focus-selected-fleet'))
    expect(focusSpy).toHaveBeenCalledWith('sys-0')
    expect(pushSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Enter selected system/ }))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  // burn has no target-naming surface at the galaxy tier (design.md Decision
  // 12: "Targets are named by body id from the interior read" — which only
  // exists once a system board is open) — the roster's Burn command sends
  // the player there instead of guessing.
  it('sends the player to the system board when Burn is invoked from the galaxy tier, with no target to guess', () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({
      data: [parkedFleet('fleet_1', 'sys-0')],
    } as unknown as ReturnType<typeof useMyFleets>)
    renderView()

    fireEvent.click(screen.getByTestId('fleet-cmd-burn-fleet_1'))

    // SDET, 2026-09-03 — tasks.md 10.9 ("retire the 'board' wording"). This
    // used to pin the sentence verbatim: 'Open the system board to choose a
    // target'. The board view is deleted by this change, so a toast that
    // still calls the destination a "board" sends the player looking for a
    // surface that no longer exists.
    //
    // The assertion is deliberately shape-not-sentence: the exact wording is
    // a product-copy decision, not this SDET's to legislate. What IS pinned
    // is what the requirement actually claims — the copy names the space
    // view a player is being sent to, and no longer names the retired board.
    // Both halves are load-bearing: dropping the word "board" while saying
    // nothing useful would satisfy a bare negative check.
    const copy = vi.mocked(toast.error).mock.calls.at(-1)?.[0] ?? ''
    expect(copy, 'the burn refusal must tell the player where to go').toBeTruthy()
    expect(
      copy,
      `player-facing copy still calls the destination a "board": ${JSON.stringify(copy)} ` +
        '(tasks.md 10.9 — the board view is deleted by this change)',
    ).not.toMatch(/board/i)
    expect(
      copy,
      `the refusal must name the surface that can take a target: ${JSON.stringify(copy)}`,
    ).toMatch(/system view|space view|system’s view|system's view/i)
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  it('cuts the drive and toasts on success, composed the same way as the board view', () => {
    mockGalaxyState()
    const burning: Fleet = {
      ...parkedFleet('fleet_1', 'sys-0'),
      state: {
        Mode: 0,
        Burn: {
          Origin: { X: 0, Y: 0, Z: 0 },
          Target: { BodyId: 'p-1', Point: null },
          Intercept: { X: 1, Y: 0, Z: 0 },
          Curve: {},
          Length: 10,
          DepartMs: 0,
          ArriveMs: 90_000,
          Accel: 1,
          InsertionPhase: 0,
        },
        Park: null,
        Drift: null,
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [burning] } as unknown as ReturnType<typeof useMyFleets>)
    cutDriveMutate.mockImplementation((_id, opts) => (opts as { onSuccess?: () => void })?.onSuccess?.())
    renderView()

    fireEvent.click(screen.getByTestId('fleet-cmd-cut-drive-fleet_1'))
    expect(cutDriveMutate).toHaveBeenCalledWith('fleet_1', expect.anything())
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Drive cut')
  })

  // --- a stop refused for the star clearance on the roster (fix-burn-order-
  // geometry-refusals task 3.3; docked-fleet-actions "A Served Burn Solve
  // Refusal Reads as Player-Facing Copy on Commit and on Every Stop Surface").
  // The reasons and lines are typed out verbatim from the delta and
  // design.md Decision 6.
  describe('roster Stop refused for the star clearance', () => {
    const ORIGIN_REASON = 'fleet: burn origin is at or inside the star-clearance radius'
    const DESTINATION_REASON = 'fleet: burn destination is at or inside the star-clearance radius'
    const ORIGIN_LINE = 'This fleet is too close to the star to take a course from here right now.'
    const DESTINATION_LINE = 'That destination is too close to the star to fly to.'

    function burningFleet(): Fleet {
      return {
        ...parkedFleet('fleet_1', 'sys-0'),
        state: {
          Mode: 0,
          Burn: {
            Origin: { X: 0, Y: 0, Z: 0 },
            Target: { BodyId: 'p-1', Point: null },
            Intercept: { X: 1, Y: 0, Z: 0 },
            Curve: {},
            Length: 10,
            DepartMs: 0,
            ArriveMs: 90_000,
            Accel: 1,
            InsertionPhase: 0,
          },
          Park: null,
          Drift: null,
        },
      }
    }

    function refuseStopWith(raw: string, error: Error = Object.assign(new Error('x'), { data: { error: raw } })) {
      mockGalaxyState()
      mockUseMyFleets.mockReturnValue({ data: [burningFleet()] } as unknown as ReturnType<typeof useMyFleets>)
      // The same error shape apiClient rejects with: the reason is in `data.error`.
      stopMutate.mockImplementation((_id, opts) =>
        (opts as { onError?: (e: unknown) => void })?.onError?.(error),
      )
      renderView()
      fireEvent.click(screen.getByTestId('fleet-cmd-stop-fleet_1'))
      expect(stopMutate).toHaveBeenCalledWith('fleet_1', expect.anything())
    }

    // Scenario: A stop refused on the galaxy roster does not toast the raw reason
    it('Scenario: A stop refused on the galaxy roster does not toast the raw reason (destination)', () => {
      refuseStopWith(DESTINATION_REASON)
      expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
      const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
      expect(shown, 'the destination line, verbatim').toBe(DESTINATION_LINE)
      expect(shown).not.toContain('fleet:')
      expect(shown).not.toContain(DESTINATION_REASON)
    })

    // Scenario: A stop refused for the clearance shows the same line a burn refused for it shows (roster half)
    it('Scenario: A stop refused for the clearance shows the same line a burn refused for it shows (roster, origin)', () => {
      refuseStopWith(ORIGIN_REASON)
      expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
      const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
      expect(shown, 'the origin line, verbatim').toBe(ORIGIN_LINE)
      expect(shown).not.toContain('fleet:')
      expect(shown).not.toContain(ORIGIN_REASON)
    })

    it('SDET-added: a reasonless stop failure shows the one generic line, never an apiClient transport summary', () => {
      // A bodyless response: apiClient synthesizes only a transport message.
      refuseStopWith('', new Error('API Error: 500 Internal Server Error'))
      const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
      expect(shown).not.toContain('API Error')
      expect(shown).not.toMatch(/\b5\d\d\b/)
      expect(shown).not.toBe(ORIGIN_LINE)
      expect(shown).not.toBe(DESTINATION_LINE)
    })
  })

  // --- jump gating (replace-observation-with-sightings tasks.md 4.10,
  // fleet-roster ADDED "The Roster Row Is the Fleet Command Surface, Jump
  // Gated by Attachment Alone") -----------------------------------------
  //
  // GalaxyView.tsx hardcodes `isChartedGate = () => false`, withholding jump
  // by asserting a falsehood — the backend gap the single-system view used to
  // document, and the reason SystemSpaceView now renders no command surface
  // of its own rather than repeating the stub. A single-system view has the
  // interior read's own `laneGates` array to hand; the data this predicate
  // needs at the GALAXY tier is `galaxy.links` — already
  // fetched here (see "marks the fleet's system on the graph" above, and the
  // per-system lane-count derivation a few lines up in the component) — a
  // link's `source`/`target` are exactly the two systems the fleet's own
  // `attachedTo` gate id ("gate-"+destSystemId) could name. No new data
  // source is required; this is a wiring gap, not a materially harder one,
  // once `galaxy.links` is consulted.
  it('offers jump on a roster row for a fleet attached to a lane-gate body, with no charted-lane precondition', () => {
    mockGalaxyState()
    const atGate: Fleet = { ...parkedFleet('fleet_1', 'sys-0'), attachedTo: 'gate-sys-1' }
    mockUseMyFleets.mockReturnValue({ data: [atGate] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()

    expect(screen.getByTestId('fleet-cmd-jump-fleet_1')).toBeInTheDocument()
  })

  it('withholds jump on a roster row for a fleet attached to an ordinary (non-gate) body', () => {
    mockGalaxyState()
    const atBody: Fleet = { ...parkedFleet('fleet_1', 'sys-0'), attachedTo: 'body-somewhere' }
    mockUseMyFleets.mockReturnValue({ data: [atBody] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()

    expect(screen.queryByTestId('fleet-cmd-jump-fleet_1')).not.toBeInTheDocument()
  })

  // --- Jump Commit at the galaxy tier (replace-observation-with-sightings
  // tasks.md 4.13; galaxy-view ADDED "A Galaxy Link's Id Is Its Lane's
  // Stable Id" / "Jump Commit") ------------------------------------------
  //
  // THE TWO DEFECTS THIS SECTION CLOSES, both in GalaxyView.tsx as shipped:
  //
  //   1. `isGateBody` cross-references `galaxy?.links` (charted-filtered,
  //      per galaxy-generation "Lanes are filtered to the corp's charted
  //      set") to decide whether an attached body is a lane gate at all —
  //      so a FRESH corp whose gate attachment the server has only just
  //      charted (via: gate, task 2.4) still reads an empty `links[]` on
  //      this separately-cadenced `GET /v1/galaxy` read, and the jump
  //      command is never offered. The existing "offers jump…" test above
  //      does not catch this: its default `galaxy` fixture already carries
  //      a `sys-0`↔`sys-1` link, so the charted-filtered lookup accidentally
  //      succeeds. These tests use `links: []` explicitly, per tasks.md
  //      4.13's own instruction, to prove the offer no longer depends on it.
  //
  //   2. `handleJump` is a hard-coded refusal — `toast.error('This gate
  //      cannot be jumped from yet — no lane id on this read')` — for every
  //      gate, because there is no `laneId` on the galaxy-view's own read to
  //      name. Per fleet-movement "Fleet Read Serves the Attached Gate's
  //      Lane Id", the fix resolves it off the FLEET DTO's own `laneId`
  //      field instead (never `galaxy.links[]`, charted-filtered and not
  //      resolvable this way at all per the requirement's own text).
  //
  // `atGate` below carries `laneId` directly (cast through `unknown` — the
  // `Fleet` type does not carry this field yet; adding it is production
  // code, task 4.13's own job, not this suite's).

  it('offers the jump command for a gate absent from the fetched galaxy graph (galaxy-view "Jump Commit" — "The jump command is offered for a gate absent from the graph")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    const atGate: Fleet = {
      ...parkedFleet('fleet_1', 'sys-0'),
      attachedTo: 'gate-sys-9',
    }
    mockUseMyFleets.mockReturnValue({ data: [atGate] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()

    expect(screen.getByTestId('fleet-cmd-jump-fleet_1')).toBeInTheDocument()
  })

  it('submits a jump order naming the attached gate’s fleet-DTO laneId, even with an empty fetched galaxy graph (galaxy-view "Jump Commit" — "A gate absent from the fetched galaxy graph still commits")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    const atGate = {
      ...parkedFleet('fleet_1', 'sys-0'),
      attachedTo: 'gate-sys-9',
      laneId: 'lane-sys0-sys9',
    } as unknown as Fleet
    mockUseMyFleets.mockReturnValue({ data: [atGate] } as unknown as ReturnType<typeof useMyFleets>)
    renderView()

    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))

    expect(jumpMutate).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: 'fleet_1', laneId: 'lane-sys0-sys9' }),
      expect.anything(),
    )
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
  })

  it('submits only one galaxy jump when activated twice in the same task', () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({ data: [{
      ...parkedFleet('fleet_1', 'sys-0'), attachedTo: 'gate-sys-9', laneId: 'lane-sys0-sys9',
    }] } as unknown as ReturnType<typeof useMyFleets>)
    jumpMutate.mockImplementation(() => undefined)
    renderView()

    const button = screen.getByTestId('fleet-cmd-jump-fleet_1')
    button.click()
    button.click()

    expect(jumpMutate).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'error'] as const)('allows another galaxy jump after the previous request settles with %s', (outcome) => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({ data: [{
      ...parkedFleet('fleet_1', 'sys-0'), attachedTo: 'gate-sys-9', laneId: 'lane-sys0-sys9',
    }] } as unknown as ReturnType<typeof useMyFleets>)
    jumpMutate.mockImplementation(() => undefined)
    renderView()
    const button = screen.getByTestId('fleet-cmd-jump-fleet_1')
    fireEvent.click(button)
    const callbacks = jumpMutate.mock.calls[0]![1] as {
      onSuccess: () => void
      onError: (error: Error) => void
      onSettled: () => void
    }
    if (outcome === 'success') callbacks.onSuccess()
    else callbacks.onError(new Error('Temporary failure'))
    callbacks.onSettled()
    fireEvent.click(button)

    expect(jumpMutate).toHaveBeenCalledTimes(2)
  })

  // --- Rejection copy mapping (replace-observation-with-sightings tasks.md
  // 4.16; galaxy-view "Jump Commit" — "A failed jump commit toasts the
  // reason" / "A failure with no distinguishable reason still toasts
  // safely") ----------------------------------------------------------------
  //
  // THE DEFECT THIS SECTION CLOSES: `handleJump` (GalaxyView.tsx) does
  // `toast.error(e.message || 'Jump failed')` — the same raw-Go-sentinel
  // leak `SystemBoardView.test.tsx`'s sibling section closes for the board
  // view. Same rationale for not pinning exact copy text: these assert the
  // OBSERVABLE contract (raw string never shown; two distinguishable
  // reasons map to two DIFFERENT copies; an unmapped/reasonless failure
  // falls back to one stable, non-technical, distinct generic message) —
  // not a specific wording choice.

  const NOT_ATTACHED_REASON = "fleet: jump requires attachment to the lane's own gate body"
  const IN_TRANSIT_REASON = 'fleet is in lane transit' // fleet/handler.go's own ErrFleetInTransit serialization
  const REASONLESS_5XX = 'API Error: 500 Internal Server Error' // apiClient's bodyless-response fallback

  function atGateFixture(reason: string) {
    const atGate = {
      ...parkedFleet('fleet_1', 'sys-0'),
      attachedTo: 'gate-sys-9',
      laneId: 'lane-sys0-sys9',
    } as unknown as Fleet
    mockUseMyFleets.mockReturnValue({ data: [atGate] } as unknown as ReturnType<typeof useMyFleets>)
    jumpMutate.mockImplementation((_vars, opts) =>
      (opts as { onError?: (e: Error) => void })?.onError?.(new Error(reason)),
    )
  }

  it('maps a distinguishable jump rejection reason to player-facing copy, never the raw server string, row unchanged (galaxy-view "Jump Commit")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture(NOT_ATTACHED_REASON)
    renderView()

    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))

    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
    const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
    expect(shown).not.toBe(NOT_ATTACHED_REASON)
    expect(shown.toLowerCase()).not.toContain('fleet:')
    expect(screen.getByTestId('fleet-row-fleet_1')).toBeInTheDocument()
  })

  it('maps a SECOND distinguishable reason to DIFFERENT copy than the first — a real per-reason mapping, not one blanket rewrite (galaxy-view "Jump Commit")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture(NOT_ATTACHED_REASON)
    const { unmount } = renderView()
    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const notAttachedCopy = vi.mocked(toast.error).mock.calls.at(-1)![0] as string
    unmount()

    vi.mocked(toast.error).mockClear()
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture(IN_TRANSIT_REASON)
    renderView()
    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const inTransitCopy = vi.mocked(toast.error).mock.calls.at(-1)![0] as string

    expect(inTransitCopy).not.toBe(IN_TRANSIT_REASON)
    expect(inTransitCopy).not.toBe(notAttachedCopy)
  })

  it('shows one stable, non-technical generic toast for a reasonless failure (e.g. a 5xx), row unchanged (galaxy-view "Jump Commit")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture(REASONLESS_5XX)
    renderView()

    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))

    const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
    expect(shown).not.toBe(REASONLESS_5XX)
    expect(shown).not.toContain('API Error')
    expect(shown).not.toMatch(/\b5\d\d\b/)
    expect(shown.toLowerCase()).not.toContain('fleet:')
    expect(screen.getByTestId('fleet-row-fleet_1')).toBeInTheDocument()
  })

  it('shows the SAME generic toast for two different unmapped reasons — one stable fallback bucket, not per-message noise (galaxy-view "Jump Commit")', () => {
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture(REASONLESS_5XX)
    const { unmount } = renderView()
    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const first = vi.mocked(toast.error).mock.calls.at(-1)![0] as string
    unmount()

    vi.mocked(toast.error).mockClear()
    mockGalaxyState({ data: { ...galaxy, links: [] } })
    atGateFixture('API Error: 502 Bad Gateway')
    renderView()
    fireEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const second = vi.mocked(toast.error).mock.calls.at(-1)![0] as string

    expect(second).toBe(first)
  })

  // --- renderer availability (add-renderer-availability-states) --------------
  //
  // The mocked '@/components/galaxy/GalaxyGraph' above stands in for the
  // whole renderer, per design.md's testability note — the REAL FG3D mount
  // path is only exercised by the Playwright suite. These tests drive the
  // guard through the REAL `getContext` global (default-available; overridden
  // via `stubUnsupported()`), never through the mock's own behaviour — the
  // mock renders `mock-graph` unconditionally, so it's the guard's `live`
  // gate, not the mock, that decides whether it appears.
  describe('renderer availability', () => {
    let restoreCanvas: (() => void) | null = null
    afterEach(() => {
      restoreCanvas?.()
      restoreCanvas = null
    })

    it('shows a named unsupported state when the rendering context cannot be created, with no uncaught error, without a capability preflight (Scenario: Context creation failure shows a named unsupported state)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      expect(() => renderView()).not.toThrow()

      expect(await screen.findByTestId('renderer-unsupported')).toHaveTextContent(
        /browser|graphics hardware|webgl|gpu/i,
      )
      expect(screen.getByRole('region', { name: 'Objects panel' })).toBeInTheDocument()
    })

    it('is independent of the galaxy data read: the galaxy read succeeds, but the unsupported state still shows because rendering cannot be created (Scenario: The unsupported state is independent of the galaxy data read)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      renderView()
      expect(await screen.findByTestId('renderer-unsupported')).toBeInTheDocument()
    })

    it('a failed galaxy data read takes precedence: no unsupported state renders when the galaxy read has already failed (Scenario: A failed data read takes precedence over the unsupported state)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState({ data: undefined, isError: true, error: new Error('boom') })
      renderView()
      expect(screen.getByText(/couldn’t load the galaxy/i)).toBeInTheDocument()
      expect(screen.queryByTestId('renderer-unsupported')).not.toBeInTheDocument()
    })

    it('the galaxy view container remains present while the canvas region shows the unsupported state (Scenario: The galaxy view container remains present)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      renderView()
      await screen.findByTestId('renderer-unsupported')
      expect(screen.getByTestId('galaxy-view')).toBeInTheDocument()
    })

    it('the intel panel and fleet roster remain mounted and interactive for an authenticated requester with an own fleet (Scenario: Surrounding galaxy affordances remain usable)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      mockUseMyFleets.mockReturnValue({
        data: [parkedFleet('fleet_1', 'sys-0')],
      } as unknown as ReturnType<typeof useMyFleets>)
      renderView()
      await screen.findByTestId('renderer-unsupported')

      expect(screen.getByRole('region', { name: 'Objects panel' })).toBeInTheDocument()
      expect(screen.getByTestId('fleet-row-fleet_1')).toBeInTheDocument()
    })

    it('roster selection still reaches a system and its inspector while the canvas is unsupported (Scenario: Roster selection still reaches a system, its inspector, and travel)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      // Two own fleets, at DIFFERENT systems: fleet_1 stays at sys-0;
      // fleet_2 sits at sys-1. Clicking fleet_2's row selects sys-1 through
      // the roster path alone (`handleShowFleet`), with no graph selection
      // involved. There is no travel-button on this surface any more
      // (galaxy-view REMOVED "Select-Preview-Commit Travel Gesture" — the
      // successor gesture is a roster-panel jump from a docked, charted
      // gate); this pins that the SYSTEM-reaching half of the removed
      // scenario survives via Enter System, unaffected by canvas
      // availability.
      mockUseMyFleets.mockReturnValue({
        data: [parkedFleet('fleet_1', 'sys-0'), parkedFleet('fleet_2', 'sys-1')],
      } as unknown as ReturnType<typeof useMyFleets>)

      renderView()
      await screen.findByTestId('renderer-unsupported')

      fireEvent.click(screen.getByTestId('fleet-row-fleet_2'))

      expect(screen.getByTestId('inspector-name')).toHaveTextContent('Borealis')
      expect(screen.getByRole('button', { name: /^Enter selected system/ })).toBeInTheDocument()
    })

    it('surrounding affordances remain usable for a logged-out visitor: counts, region breakdown, and sign-in prompt shown; the roster is not mounted (Scenario: Surrounding galaxy affordances remain usable for a logged-out visitor)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState({ isStartArea: true })
      renderView()
      await screen.findByTestId('renderer-unsupported')

      expect(screen.getByTestId('signin-prompt')).toBeInTheDocument()
      expect(screen.queryByTestId('fleet-row-fleet_1')).not.toBeInTheDocument()
    })

    it('does not instruct the player to select a system on the graph when none is selected and there is no own fleet in the roster (Scenario: Choosing a system on the graph is unreachable without the canvas)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      mockUseMyFleets.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMyFleets>)
      renderView()
      await screen.findByTestId('renderer-unsupported')

      const inspector = screen.getByTestId('inspector')
      expect(inspector).not.toHaveTextContent(/select a system to inspect/i)
      expect(inspector).toHaveTextContent(/roster|fleet|available/i)
    })

    it('disables the recenter control while the canvas is unsupported (Scenario: A canvas-only control is disabled while the canvas is unavailable)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      renderView()
      await screen.findByTestId('renderer-unsupported')

      expect(screen.queryByTestId('galaxy-recenter')).toBeNull()
    })

    it('an in-flight system selection survives a transition into the unsupported state, by construction — `selectedId` lives in GalaxyView\'s own state, a sibling of `<GalaxyGraph>`, never inside it (Scenario: In-flight selection survives a context loss)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGalaxyState()
      const { rerender } = renderView()
      // Select a system while the graph is live.
      fireEvent.click(await screen.findByTestId('select-sys-0'))
      expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')

      // Drive the canvas region into the unsupported state via a fresh
      // render pass (a stand-in for a runtime loss reaching the guard) —
      // `selectedId` is GalaxyView's own `useState`, untouched by this.
      graphBehavior.throwOnRender = true
      rerender(<GalaxyView />)

      await screen.findByTestId('renderer-unsupported')
      // The selection is unchanged — never re-derived from, or reset by,
      // the canvas region's own status.
      expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')
      consoleErrorSpy.mockRestore()
    })

    // SDET-added (QA MAJOR, real-browser e2e finding): a runtime context
    // loss must NOT unmount <GalaxyGraph> (and detach its canvas) — only
    // 'unsupported' may tear the canvas region down. Composing
    // `guard.status === 'live' ? <Boundary><GalaxyGraph/></Boundary> :
    // <Notice/>` unmounts on ANY non-'live' status, including
    // 'interrupted' — and once a canvas is detached from the document, the
    // browser never fires `webglcontextrestored` for that context again,
    // making "A restored context resumes without navigation" and "...its
    // first frame reflects live state" permanently unreachable on the
    // shipped surface. `BoardCanvas.test.tsx` carries the board-side
    // twin of this pin.
    it('SDET-added: the canvas region (and its <canvas>) remain mounted while the guard is INTERRUPTED — only "unsupported" may tear it down (Scenario: A restored context resumes without navigation / A restored context\'s first frame reflects live state, not a stale one)', async () => {
      mockGalaxyState()
      renderView()

      const canvas = await screen.findByTestId('mock-graph-canvas')
      expect(canvas).toBeInTheDocument()

      // A genuine runtime context loss, dispatched on the exact element the
      // production guard's listeners are attached to (via
      // `controller.canvas?.()`). `onReady` (an inline prop) re-fires the
      // mock's effect across GalaxyView's own settling re-renders, so the
      // guard's listener-attachment effect can land a tick after the canvas
      // itself first appears — poll the dispatch (harmless to repeat: a
      // second 'contextLost' while already interrupted is an explicit no-op
      // transition) rather than assume a fixed settle time.
      await waitFor(() => {
        fireEvent(canvas, new Event('webglcontextlost'))
        expect(screen.getByTestId('renderer-interrupted')).toBeInTheDocument()
      })

      // The canvas region — and this same canvas element — must still be
      // mounted: a real restore, dispatched later on this same context,
      // must have somewhere live to land.
      expect(screen.getByTestId('mock-graph')).toBeInTheDocument()
      expect(screen.getByTestId('mock-graph-canvas')).toBe(canvas)
      expect(document.body.contains(canvas)).toBe(true)
      fireEvent(canvas, new Event('webglcontextrestored'))
      await waitFor(() => expect(screen.queryByTestId('renderer-interrupted')).not.toBeInTheDocument())
    })

    it('converts an unexpected render-phase throw (surviving the probe) to the unsupported state via the boundary — intel panel, inspector, and the container remain (Scenario: An unexpected rendering error is contained to the canvas region)', async () => {
      // React logs a caught boundary error to console.error in dev
      // regardless of our own handling — suppressed here only (not in
      // vitest.setup.ts's filter), per the architect's watch-out.
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      graphBehavior.throwOnRender = true
      mockGalaxyState()
      expect(() => renderView()).not.toThrow()

      expect(await screen.findByTestId('renderer-unsupported')).toBeInTheDocument()
      expect(screen.getByTestId('galaxy-view')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Objects panel' })).toBeInTheDocument()
      expect(screen.getByTestId('inspector')).toBeInTheDocument()
      // SDET-added (security audit MINOR-2): the caught error's raw message
      // never reaches the DOM — CanvasRegionBoundary discards it
      // (`fallback` is a plain ReactNode, not a render-prop over the error)
      // and RendererStateNotice only ever displays the fixed, enum-derived
      // cause copy. Regression pin, not new behaviour (Scenario: The
      // displayed cause is a user-actionable category, not raw diagnostic
      // text).
      expect(screen.queryByText(/fg3d construction boom/)).not.toBeInTheDocument()
      consoleErrorSpy.mockRestore()
    })
  })
})
