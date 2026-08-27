import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { GalaxyView } from './GalaxyView'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useMyFleets, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import type { Galaxy } from '@/lib/types/galaxy'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
import { stubUnsupported } from '@/components/render-guard/test-canvas'

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
    graphBehavior: { throwOnRender: false },
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
// controller via onReady so recenter is exercised.
vi.mock('@/components/galaxy/GalaxyGraph', async () => {
  const React = await import('react')
  return {
    GalaxyGraph: ({
      galaxy,
      onSelect,
      onReady,
      fleetSystemIds,
      transitFleets,
      onSelectFleet,
      homeSystemId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }: any) => {
      graphPropsSpy({ fleetSystemIds, transitFleets, homeSystemId })
      // SDET-added: a real (mock) canvas exposed via the controller's
      // `canvas()` accessor — GalaxyView wires
      // `setGuardCanvas(controller.canvas?.() ?? null)` from this, so a test
      // can dispatch a genuine `webglcontextlost`/`webglcontextrestored` on
      // the SAME element the production guard attaches its listeners to,
      // without touching the real FG3D mount path (reserved for Playwright).
      const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
      React.useEffect(() => {
        onReady?.({
          recenter: recenterSpy,
          focusSystem: focusSpy,
          focusPoint: focusPointSpy,
          canvas: () => canvasRef.current,
        })
      }, [onReady])
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
          {/* Stands in for clicking a fleet's lane marker (raycast in the real
              graph, a button here). */}
          {(transitFleets ?? []).map((f: Fleet) => (
            <button
              key={f.id}
              data-testid={`click-lane-marker-${f.id}`}
              onClick={() => onSelectFleet?.(f.id)}
            >
              marker
            </button>
          ))}
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
vi.mock('react-force-graph-3d', () => ({ default: () => null }))

vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))

// Fleet hooks + the world clock are mocked so the view renders synchronously
// without a live backend; travel tests drive them per-case.
vi.mock('@/hooks/use-fleets', () => ({
  useMyFleets: vi.fn(),
  useRoutePreview: vi.fn(),
  useFleetTravel: vi.fn(),
}))
vi.mock('@/hooks/use-world-time', () => ({ useWorldTime: () => 0 }))

// The floating account chip reads auth context; default to logged-out (no chip).
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: null, account: null, signOut: vi.fn() }),
}))

const mockUseGalaxy = vi.mocked(useGalaxy)
const mockUseMyFleets = vi.mocked(useMyFleets)
const mockUseRoutePreview = vi.mocked(useRoutePreview)
const mockUseFleetTravel = vi.mocked(useFleetTravel)

// GalaxyView calls useQueryClient (for the arrival self-schedule); wrap in a
// provider. The fleet DATA comes from the mocked hooks above, not real queries.
function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<GalaxyView />, { wrapper })
}

function coastFleet(id: string, systemId: string): Fleet {
  return {
    id,
    corporationId: 'corp',
    systemId,
    state: { mode: 'coast', coast: { ring: 1, angle0: 0, period: 1, dir: 1 } },
    position: { ring: 1, slot: 0 },
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
  links: [{ id: 'lane-0', source: 'sys-0', target: 'sys-1' }],
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
    // Default: no fleets, no route, an inert travel mutation.
    mockUseMyFleets.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMyFleets>)
    mockUseRoutePreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRoutePreview>)
    mockUseFleetTravel.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useFleetTravel>)
  })

  it('renders the intel panel with system/lane/region stats', async () => {
    mockGalaxyState()
    renderView()

    const panel = screen.getByTestId('intel-panel')
    expect(panel).toBeInTheDocument()
    // 2 systems, 1 lane.
    expect(panel).toHaveTextContent('2')
    expect(panel).toHaveTextContent('1')
    // Region breakdown labels (only regions present).
    expect(panel).toHaveTextContent('Star-rich')
    expect(panel).toHaveTextContent('Dead zone')
  })

  it('shows the inspector empty state until a node is selected', () => {
    mockGalaxyState()
    renderView()

    expect(screen.getByTestId('inspector')).toHaveTextContent(/select a system/i)
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
    expect(screen.queryByTestId('enter-system-button')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByTestId('select-sys-0'))
    fireEvent.click(screen.getByTestId('enter-system-button'))
    expect(pushSpy).toHaveBeenCalledWith('/systems/sys-0')
  })

  it('hides "Enter system" on the logged-out start area', async () => {
    mockGalaxyState({ isStartArea: true })
    renderView()

    fireEvent.click(await screen.findByTestId('select-sys-0'))
    expect(screen.getByTestId('inspector-name')).toHaveTextContent('Axion')
    expect(screen.queryByTestId('enter-system-button')).not.toBeInTheDocument()
  })

  it('marks the fleet’s system on the graph and targets it as home', async () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({
      data: [coastFleet('fleet_1', 'sys-0')],
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

  it('drives the graph controller from the ⌖ recenter control', async () => {
    mockGalaxyState()
    renderView()

    // Ensure onReady has run (graph mounted).
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('galaxy-recenter'))

    await waitFor(() => expect(recenterSpy).toHaveBeenCalled())
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

  it('previews a route and commits a trip from the inspector', async () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({
      data: [coastFleet('fleet_1', 'sys-0')],
    } as unknown as ReturnType<typeof useMyFleets>)
    const preview: RoutePreview = {
      route: ['sys-0', 'sys-1'],
      legEtas: [60_000, 660_000],
      totalEta: 660_000,
      departGate: { ring: 16, slot: 2 },
      worldTime: 0,
    }
    mockUseRoutePreview.mockReturnValue({
      data: preview,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRoutePreview>)
    const mutate = vi.fn()
    mockUseFleetTravel.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useFleetTravel>)

    renderView()
    // Select the OTHER system (not the fleet's) → route preview + Travel button.
    fireEvent.click(await screen.findByTestId('select-sys-1'))
    expect(screen.getByTestId('route-preview')).toHaveTextContent('Borealis')
    fireEvent.click(screen.getByTestId('travel-button'))
    expect(mutate).toHaveBeenCalledWith(
      { fleetId: 'fleet_1', systemId: 'sys-1' },
      expect.anything(),
    )
  })

  it('says so when the destination has no charted route', async () => {
    mockGalaxyState()
    mockUseMyFleets.mockReturnValue({
      data: [coastFleet('fleet_1', 'sys-0')],
    } as unknown as ReturnType<typeof useMyFleets>)
    mockUseRoutePreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useRoutePreview>)

    renderView()
    fireEvent.click(await screen.findByTestId('select-sys-1'))
    expect(screen.getByTestId('no-route')).toBeInTheDocument()
    expect(screen.queryByTestId('travel-button')).not.toBeInTheDocument()
  })

  it('shows a travelling fleet in the roster, with its route and a live ETA', () => {
    mockGalaxyState()
    const traveling: Fleet = {
      ...coastFleet('fleet_1', 'sys-0'),
      state: {
        mode: 'laneTransit',
        laneTransit: {
          route: ['sys-0', 'sys-1'],
          legEtas: [60_000, 660_000],
          departTime: 0,
          arriveTime: 660_000,
          entryGate: { ring: 16, slot: 2 },
        },
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    const row = screen.getByTestId('fleet-row-fleet_1')
    expect(row).toHaveTextContent('Axion → Borealis')
    expect(row).toHaveTextContent('In transit')
    expect(screen.getByTestId('fleet-row-eta-fleet_1')).toHaveTextContent('11m')
  })

  // Spec: 0008/S8
  it('opens a card for the fleet whose lane marker is clicked, and closes it again', async () => {
    mockGalaxyState()
    const traveling: Fleet = {
      ...coastFleet('fleet_1', 'sys-0'),
      state: {
        mode: 'laneTransit',
        laneTransit: {
          route: ['sys-0', 'sys-1'],
          legEtas: [60_000, 660_000],
          departTime: 0,
          arriveTime: 660_000,
          entryGate: { ring: 16, slot: 2 },
        },
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    // Nothing selected: the inspector's empty state, no fleet card.
    expect(screen.queryByTestId('fleet-card')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByTestId('click-lane-marker-fleet_1'))

    const card = screen.getByTestId('fleet-card')
    expect(card).toHaveTextContent('Axion → Borealis')
    expect(card).toHaveTextContent('In transit')
    expect(screen.getByTestId('fleet-card-eta')).toHaveTextContent('11m')
    // It names the lane chain ahead of the hull.
    expect(card).toHaveTextContent('Borealis')

    fireEvent.click(screen.getByTestId('fleet-card-close'))
    expect(screen.queryByTestId('fleet-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('inspector')).toBeInTheDocument()
  })

  // Spec: 0008/S8
  it('a roster row for a fleet on a lane glides the camera to it and opens its card', async () => {
    mockGalaxyState()
    const traveling: Fleet = {
      ...coastFleet('fleet_1', 'sys-0'),
      state: {
        mode: 'laneTransit',
        laneTransit: {
          route: ['sys-0', 'sys-1'],
          legEtas: [0, 660_000],
          departTime: 0,
          arriveTime: 660_000,
          entryGate: { ring: 16, slot: 2 },
        },
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('fleet-row-fleet_1'))

    // The camera goes to the hull's point on the lane — not to a star, because it
    // isn't at one.
    expect(focusPointSpy).toHaveBeenCalled()
    expect(focusSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('fleet-card')).toBeInTheDocument()
  })

  // Spec: 0008/S7
  it('hands a travelling fleet to the transit layer instead of pinning it to the star it left', async () => {
    mockGalaxyState()
    const traveling: Fleet = {
      ...coastFleet('fleet_1', 'sys-0'),
      state: {
        mode: 'laneTransit',
        laneTransit: {
          route: ['sys-0', 'sys-1'],
          legEtas: [60_000, 660_000],
          departTime: 0,
          arriveTime: 660_000,
          entryGate: { ring: 16, slot: 2 },
        },
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    await screen.findByTestId('mock-graph')

    const props = graphPropsSpy.mock.calls.at(-1)![0]
    // It's drawn crawling its lane…
    expect(props.transitFleets.map((f: Fleet) => f.id)).toEqual(['fleet_1'])
    // …and NOT as a presence pip on sys-0, which it has already left.
    expect(props.fleetSystemIds).not.toContain('sys-0')
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

    it('shows a named unsupported state when the rendering context cannot be created, with no uncaught error, and never mounts the graph (Scenario: Context creation failure shows a named unsupported state)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      expect(() => renderView()).not.toThrow()

      expect(await screen.findByTestId('renderer-unsupported')).toHaveTextContent(
        /browser|graphics hardware|webgl|gpu/i,
      )
      expect(screen.queryByTestId('mock-graph')).not.toBeInTheDocument()
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
        data: [coastFleet('fleet_1', 'sys-0')],
      } as unknown as ReturnType<typeof useMyFleets>)
      renderView()
      await screen.findByTestId('renderer-unsupported')

      expect(screen.getByTestId('intel-panel')).toBeInTheDocument()
      expect(screen.getByTestId('fleet-row-fleet_1')).toBeInTheDocument()
    })

    it('roster selection still reaches a system, its inspector, and travel while the canvas is unsupported (Scenario: Roster selection still reaches a system, its inspector, and travel)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState()
      // QA fixture-gap fix: a SINGLE-fleet fixture makes `previewDest`
      // permanently null — the acting fleet's roster row always selects its
      // OWN system, so `selectedId === activeFleet.systemId` (isHere) on
      // every click, and `travel-button` can never render. Two own fleets,
      // at DIFFERENT systems, fix this: fleet_1 (first in the array, so the
      // idle `activeFleet` GalaxyView commands travel for) stays at sys-0;
      // fleet_2 sits at sys-1. Clicking fleet_2's row selects sys-1 — a
      // system the acting fleet is NOT already at — so `previewDest` is
      // genuinely non-null and TravelSection renders its live route +
      // `travel-button`, not just the "Your fleet is here" note a
      // same-system fixture would always hit.
      mockUseMyFleets.mockReturnValue({
        data: [coastFleet('fleet_1', 'sys-0'), coastFleet('fleet_2', 'sys-1')],
      } as unknown as ReturnType<typeof useMyFleets>)
      const preview: RoutePreview = {
        route: ['sys-0', 'sys-1'],
        legEtas: [60_000, 660_000],
        totalEta: 660_000,
        departGate: { ring: 16, slot: 2 },
        worldTime: 0,
      }
      mockUseRoutePreview.mockReturnValue({
        data: preview,
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useRoutePreview>)

      renderView()
      await screen.findByTestId('renderer-unsupported')

      // handleShowFleet: a roster row for a fleet NOT at the acting fleet's
      // own system selects that system directly — no graph selection
      // involved — reaching it, its inspector, and a genuinely live
      // travel-button, all through the fleet-roster path alone.
      fireEvent.click(screen.getByTestId('fleet-row-fleet_2'))

      expect(screen.getByTestId('inspector-name')).toHaveTextContent('Borealis')
      expect(screen.getByTestId('route-preview')).toBeInTheDocument()
      expect(screen.getByTestId('travel-button')).toBeInTheDocument()
    })

    it('surrounding affordances remain usable for a logged-out visitor: counts, region breakdown, and sign-in prompt shown; the roster is not mounted (Scenario: Surrounding galaxy affordances remain usable for a logged-out visitor)', async () => {
      restoreCanvas = stubUnsupported()
      mockGalaxyState({ isStartArea: true })
      renderView()
      await screen.findByTestId('renderer-unsupported')

      const panel = screen.getByTestId('intel-panel')
      expect(panel).toHaveTextContent('2') // systems
      expect(panel).toHaveTextContent('1') // lanes
      expect(panel).toHaveTextContent('Star-rich')
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

      expect(screen.getByTestId('galaxy-recenter')).toBeDisabled()
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
      expect(screen.getByTestId('intel-panel')).toBeInTheDocument()
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
