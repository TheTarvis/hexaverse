import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GalaxyView } from './GalaxyView'
import { useGalaxy } from '@/hooks/use-galaxy'
import type { Galaxy } from '@/lib/types/galaxy'

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

// The floating account chip reads auth context; default to logged-out (no chip).
vi.mock('@/components/account-provider', () => ({
  useAccountContext: () => ({ user: null, account: null, signOut: vi.fn() }),
}))

const mockUseGalaxy = vi.mocked(useGalaxy)

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
  })

  it('renders the intel panel with system/lane/region stats', async () => {
    mockGalaxyState()
    render(<GalaxyView />)

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
    render(<GalaxyView />)

    expect(screen.getByTestId('inspector')).toHaveTextContent(/select a system/i)
    expect(screen.queryByTestId('inspector-name')).not.toBeInTheDocument()
  })

  it('populates the inspector when a node is selected', async () => {
    mockGalaxyState()
    render(<GalaxyView />)

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
    render(<GalaxyView />)

    // Ensure onReady has run (graph mounted).
    await screen.findByTestId('mock-graph')
    fireEvent.click(screen.getByTestId('galaxy-recenter'))

    await waitFor(() => expect(recenterSpy).toHaveBeenCalled())
  })

  it('shows the sign-in prompt only when viewing the frozen start area', () => {
    mockGalaxyState({ isStartArea: true })
    const { rerender } = render(<GalaxyView />)
    expect(screen.getByTestId('signin-prompt')).toBeInTheDocument()

    mockGalaxyState({ isStartArea: false })
    rerender(<GalaxyView />)
    expect(screen.queryByTestId('signin-prompt')).not.toBeInTheDocument()
  })

  it('renders a loading state while the galaxy is fetching', () => {
    mockGalaxyState({ data: undefined, isLoading: true })
    render(<GalaxyView />)
    expect(screen.queryByTestId('intel-panel')).not.toBeInTheDocument()
    expect(screen.getByText(/charting the galaxy/i)).toBeInTheDocument()
  })

  it('renders an error state when the galaxy read fails', () => {
    mockGalaxyState({ data: undefined, isError: true, error: new Error('boom') })
    render(<GalaxyView />)
    expect(screen.getByText(/couldn’t load the galaxy/i)).toBeInTheDocument()
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })
})
