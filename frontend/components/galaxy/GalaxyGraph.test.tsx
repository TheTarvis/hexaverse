import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'

// Capture the props GalaxyGraph hands the three.js renderer, without touching
// WebGL (jsdom has none). next/dynamic is resolved so the mocked renderer mounts.
const { propsSpy } = vi.hoisted(() => ({ propsSpy: vi.fn() }))

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

vi.mock('react-force-graph-3d', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    propsSpy(props)
    return <div data-testid="fg3d" />
  },
}))

import { GalaxyGraph } from './GalaxyGraph'

const nodeA: GalaxyNode = {
  id: 'a', name: 'Axion', region: 'star_rich', tier: 'explored',
  skeleton: { starClass: 'G', bodies: [] }, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0,
}
const nodeB: GalaxyNode = {
  id: 'b', name: 'Borealis', region: 'barrier', tier: 'starVisible',
  skeleton: { starClass: 'M', bodies: [] }, x: 1, y: 1, z: 1, fx: 1, fy: 1, fz: 1,
}
const galaxy: Galaxy = {
  id: 'g', seed: 1, bounds: { x: [0, 1], y: [0, 1], z: [0, 1] }, worldTime: 0,
  nodes: [nodeA, nodeB],
  links: [{ id: 'l', source: 'a', target: 'b', bridge: false }],
}

describe('GalaxyGraph', () => {
  beforeEach(() => {
    propsSpy.mockClear()
    // The renderer only mounts once the container reports a size, and the
    // component observes resizes — stub both for jsdom.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })
  })
  afterEach(() => {
    // @ts-expect-error restore
    delete HTMLElement.prototype.clientWidth
    // @ts-expect-error restore
    delete HTMLElement.prototype.clientHeight
  })

  it('drives the 3D renderer with the real node/link graph data', async () => {
    render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={() => {}} />)
    await vi.waitFor(() => expect(propsSpy).toHaveBeenCalled())
    const props = propsSpy.mock.calls.at(-1)![0]
    expect(props.graphData.nodes).toHaveLength(2)
    expect(props.graphData.links).toHaveLength(1)
  })

  it('renders lanes at full strength regardless of subspace tier (#0006 free star map)', async () => {
    render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={() => {}} />)
    await vi.waitFor(() => expect(propsSpy).toHaveBeenCalled())
    const linkColor = propsSpy.mock.calls.at(-1)![0].linkColor as (l: unknown) => string

    // A barrier seam lane and an ordinary lane both render at full opacity, even
    // though one endpoint is only star-visible (uncharted).
    expect(linkColor({ source: nodeA, target: nodeB })).toBe('rgba(244,114,182,0.5)')
    expect(linkColor({ source: nodeA, target: nodeA })).toBe('rgba(150,185,230,0.42)')
  })
})
