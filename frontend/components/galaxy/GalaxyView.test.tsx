import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { GalaxyView } from './GalaxyView'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useMyFleets, useRoutePreview, useFleetTravel } from '@/hooks/use-fleets'
import type { Galaxy } from '@/lib/types/galaxy'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'

// A spy the mocked graph hands back through onReady, so we can assert the
// ⌖ recenter control drives the graph controller.
const { recenterSpy } = vi.hoisted(() => ({ recenterSpy: vi.fn() }))

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GalaxyGraph: ({ galaxy, onSelect, onReady }: any) => {
      React.useEffect(() => {
        onReady?.({ recenter: recenterSpy })
      }, [onReady])
      return (
        <div data-testid="mock-graph">
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
    position: { q: 1, r: 0 },
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
      departGate: { q: 16, r: -2 },
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

  it('shows a transit banner for a travelling fleet', () => {
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
          entryGate: { q: 16, r: -2 },
        },
      },
    }
    mockUseMyFleets.mockReturnValue({ data: [traveling] } as unknown as ReturnType<typeof useMyFleets>)

    renderView()
    const banner = screen.getByTestId('transit-banner')
    expect(banner).toHaveTextContent('Borealis')
    expect(banner).toHaveTextContent(/arrives/i)
  })
})
