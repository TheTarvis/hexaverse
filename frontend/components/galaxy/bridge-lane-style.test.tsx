// RED-phase(-confirmation) suite for galaxy-view ADDED "Bridge Lane
// Rendering Is Visually Distinct" (migrate-fleet-to-continuous-burns,
// tasks.md 8.13).
//
// This requirement supersedes the REMOVED "Bridge Lane Rendering" (its
// route-preview/travel-commit scenario has no successor; design.md Decision
// 12), but keeps the render-distinctness half verbatim. `GalaxyGraph.tsx`
// already implements that half (`linkColor`/`linkWidth` branch on
// `link.bridge`) and nothing in section 8 touches it — so this is expected
// to PASS ON FIRST RUN, a legitimate confirmation (like tasks 8.7/8.11/8.12),
// not a new red. It is still recorded here as pinned, traceable coverage of
// the ADDED requirement's one scenario, since no prior test asserted the
// `bridge: true` styling branch specifically (the existing GalaxyGraph.test
// .tsx only exercises `bridge: false` and the barrier-seam color, not the
// bridge-distinct style itself).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'

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
  id: 'b', name: 'Borealis', region: 'star_rich', tier: 'explored',
  skeleton: { starClass: 'M', bodies: [] }, x: 1, y: 1, z: 1, fx: 1, fy: 1, fz: 1,
}
const galaxy: Galaxy = {
  id: 'g', seed: 1, bounds: { x: [0, 1], y: [0, 1], z: [0, 1] }, worldTime: 0,
  nodes: [nodeA, nodeB],
  links: [{ id: 'l', source: 'a', target: 'b', bridge: true }],
}

describe('GalaxyGraph — galaxy-view ADDED "Bridge Lane Rendering Is Visually Distinct"', () => {
  beforeEach(() => {
    propsSpy.mockClear()
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

  // Scenario: A bridge lane renders distinctly
  it('renders a bridge lane with a color and width distinct from an ordinary lane', async () => {
    render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={() => {}} />)
    await vi.waitFor(() => expect(propsSpy).toHaveBeenCalled())
    const props = propsSpy.mock.calls.at(-1)![0]
    const linkColor = props.linkColor as (l: unknown) => string
    const linkWidth = props.linkWidth as (l: unknown) => number

    const bridge = { source: nodeA, target: nodeB, bridge: true }
    const ordinary = { source: nodeA, target: nodeB, bridge: false }

    expect(linkColor(bridge)).not.toBe(linkColor(ordinary))
    expect(linkWidth(bridge)).not.toBe(linkWidth(ordinary))
  })

  // No route-preview or travel-commit affordance survives on any lane — the
  // graph offers no lane-click handler distinct from node selection at all.
  // (galaxy-view REMOVED "Select-Preview-Commit Travel Gesture"; the removed
  // requirement's own successor names no on-lane interaction.) GalaxyGraph's
  // public props carry no `onSelectLane`/`onLaneClick`-shaped callback.
  it('offers no lane click/preview/commit callback prop, bridge or ordinary', async () => {
    render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={() => {}} />)
    await vi.waitFor(() => expect(propsSpy).toHaveBeenCalled())
    const props = propsSpy.mock.calls.at(-1)![0]
    expect(props.onLinkClick).toBeUndefined()
  })
})
