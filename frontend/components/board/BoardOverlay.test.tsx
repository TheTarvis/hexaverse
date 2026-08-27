import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { boardExtent, fitViewBox, RADIAL_UNIT } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { BoardOverlay } from './BoardOverlay'


const RADIUS = 3
const VIEWBOX = fitViewBox(RADIUS)
const EXTENT = boardExtent(RADIUS)
const STYLE = { transform: 'none', transformOrigin: '50% 50%' }

const star: BoardFeature = {
  id: 'f-star',
  type: 'star',
  fixed: true,
  footprint: [{ ring: 0, slot: 0 }],
  band: 'visible',
  live: true,
}

const planet: BoardFeature = {
  id: 'p-1',
  type: 'rocky',
  orbit: { ring: 2, angle0: 0, period: 2 ** 60, dir: 1 },
  footprint: [{ ring: 2, slot: 0 }],
  band: 'visible',
  live: true,
  resources: [{ kind: 'metals', richness: 1 }],
}

const charted: BoardFeature = {
  id: 'p-2',
  type: 'ice',
  orbit: { ring: 3, angle0: 3, period: 2 ** 60, dir: 1 },
  footprint: [{ ring: 3, slot: 0 }],
  band: 'astronomical',
  live: false,
}

const moon: BoardFeature = {
  id: 'p-1-moon',
  type: 'moon',
  parentId: 'p-1',
  footprint: [{ ring: 2, slot: 0 }],
  band: 'visible',
  live: true,
}

function ownFleet(state: Fleet['state'], id = 'own-1'): Fleet {
  return {
    id,
    corporationId: 'c',
    systemId: 's',
    state,
    position: { ring: 2, slot: 0 },
    own: true,
    worldTime: 0,
  }
}

const coasting = () => ownFleet({ mode: 'coast', coast: { ring: 2, angle0: 3, period: 2 ** 60, dir: 1 } })

function overlay(props: Partial<React.ComponentProps<typeof BoardOverlay>> = {}) {
  return (
    <BoardOverlay
      viewBox={VIEWBOX}
      extent={EXTENT}
      overlayStyle={STYLE}
      radius={RADIUS}
      worldTime={0}
      features={[star, planet, charted, moon]}
      fleets={[]}
      {...props}
    />
  )
}

describe('BoardOverlay — hit shapes and attributes', () => {
  it('carries the full testid inventory with data attributes', () => {
    render(overlay({ fleets: [coasting()], gates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }))
    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('board-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-p-1')).toHaveAttribute('data-band', 'visible')
    expect(screen.getByTestId('feature-glyph-p-1')).toHaveAttribute('data-mineable', 'true')
    expect(screen.getByTestId('feature-glyph-p-2')).toHaveAttribute('data-band', 'astronomical')
    expect(screen.getByTestId('feature-glyph-p-2')).not.toHaveAttribute('data-mineable')
    expect(screen.getByTestId('fleet-glyph-own-1')).toHaveAttribute('data-own', 'true')
    expect(screen.getByTestId('gate-glyph-sys-9')).toBeInTheDocument()
  })

  it('gives an outline-only astronomical feature the same hit-target size as a filled one', () => {
    render(overlay())
    const hitOf = (id: string) =>
      screen.getByTestId(`feature-glyph-${id}`).querySelector('circle[fill="transparent"]')!.getAttribute('r')
    expect(hitOf('p-2')).toBe(hitOf('p-1'))
  })

  it('shrinks a docked fleet’s hit target so clicks fall through to the host body', () => {
    const docked = ownFleet({ mode: 'docked', docked: { parentId: 'p-1' } }, 'docked-1')
    render(overlay({ fleets: [docked, coasting()] }))
    const r = (id: string) =>
      Number(screen.getByTestId(`fleet-glyph-${id}`).querySelector('circle[fill="transparent"]')!.getAttribute('r'))
    expect(r('docked-1')).toBeCloseTo(RADIAL_UNIT * 0.18, 5)
    expect(r('own-1')).toBeCloseTo(RADIAL_UNIT * 0.5, 5)
  })

  it('orders hit shapes for topmost-wins: gates < features < fleets, moon after parent', () => {
    render(overlay({ fleets: [coasting()], gates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }))
    const svg = screen.getByTestId('board-overlay')
    const order = ['lane-gates', 'feature-glyphs', 'fleet-glyphs'].map((tid) =>
      Array.prototype.indexOf.call(svg.children, svg.querySelector(`[data-testid="${tid}"]`)),
    )
    expect(order[0]).toBeLessThan(order[1]!)
    expect(order[1]).toBeLessThan(order[2]!)
    // Within features: the moon's hit shape follows its parent's in the DOM,
    // so an overlapping click resolves to the moon (the child drawn on top).
    const featureGroup = screen.getByTestId('feature-glyphs')
    const ids = Array.from(featureGroup.querySelectorAll('[data-testid^="feature-glyph-"]')).map((n) =>
      n.getAttribute('data-testid'),
    )
    expect(ids.indexOf('feature-glyph-p-1-moon')).toBeGreaterThan(ids.indexOf('feature-glyph-p-1'))
  })

  it('marks the selected bare hex and the hovered tile', () => {
    render(overlay({ selectedCell: { ring: 1, slot: 1 }, hoverCell: { ring: 1, slot: 0 } }))
    expect(screen.getByTestId('selected-cell')).toBeInTheDocument()
    expect(screen.getByTestId('hover-cell')).toBeInTheDocument()
  })

  it('draws the selection ring on the selected entity', () => {
    render(overlay({ selectedId: 'p-1' }))
    expect(screen.getByTestId('feature-glyph-p-1').querySelector('[data-testid="selection-ring"]')).not.toBeNull()
  })
})

// Task 7.9 — the burn-paths and scan-bubble coverage retargeted from the
// deleted BoardScene.test at the relocated overlay layers (tasks 5.1a/5.1b).
describe('BoardOverlay — burn paths and sensor bubble', () => {
  it('draws the committed leg-0 path per own burning fleet', () => {
    const burner = ownFleet({
      mode: 'burn',
      burn: {
        path: [
          { ring: 3, slot: 0 },
          { ring: 2, slot: 0 },
          { ring: 1, slot: 0 },
        ],
        startTime: 0,
        arriveTime: 120_000,
        target: { cell: { ring: 1, slot: 0 } },
      },
    })
    render(overlay({ fleets: [burner] }))
    expect(screen.getByTestId('burn-paths').querySelectorAll('polyline')).toHaveLength(1)
  })

  it('drops an ARRIVED burn’s path (stateAt folds it away — no stale amber line)', () => {
    const burner = ownFleet({
      mode: 'burn',
      burn: {
        path: [
          { ring: 3, slot: 0 },
          { ring: 2, slot: 0 },
        ],
        startTime: 0,
        arriveTime: 10_000,
        target: { cell: { ring: 2, slot: 0 } },
      },
    })
    render(overlay({ fleets: [burner], worldTime: 60_000 }))
    expect(screen.getByTestId('burn-paths').querySelectorAll('polyline')).toHaveLength(0)
  })

  // Spec: 0008/S5
  it('draws a departing fleet on its board leg, path and all, then drops it at the gate', () => {
    const departing = ownFleet({
      mode: 'laneTransit',
      laneTransit: {
        boardLeg: {
          path: [
            { ring: 2, slot: 0 },
            { ring: 3, slot: 0 },
          ],
          startTime: 0,
          gateEta: 10_000,
        },
        route: ['s', 'sys-9'],
        legEtas: [10_000, 60_000],
        departTime: 0,
        arriveTime: 60_000,
        entryGate: { ring: 3, slot: 0 },
      },
    })
    // Mid-leg: still on this board, with its run out to the gate drawn.
    const { rerender } = render(overlay({ fleets: [departing], worldTime: 5_000 }))
    expect(screen.getByTestId('fleet-glyph-own-1')).toBeInTheDocument()
    expect(screen.getByTestId('burn-paths').querySelectorAll('polyline')).toHaveLength(1)
    // Past the gate ETA it's out on the lane — the galaxy view's picture, not
    // this board's. It must not fall back to the star's (0,0) cell.
    rerender(overlay({ fleets: [departing], worldTime: 20_000 }))
    expect(screen.queryByTestId('fleet-glyph-own-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('burn-paths').querySelectorAll('polyline')).toHaveLength(0)
    expect(screen.getByTestId('scan-bubble').querySelectorAll('path')).toHaveLength(0)
  })

  it('renders the ambient sensor bubble around own units only', () => {
    const { rerender } = render(overlay({ fleets: [coasting()] }))
    expect(screen.getByTestId('scan-bubble').querySelectorAll('path').length).toBeGreaterThan(0)
    rerender(overlay({ fleets: [{ ...coasting(), own: false, id: 'foreign-1' }] }))
    expect(screen.getByTestId('scan-bubble').querySelectorAll('path')).toHaveLength(0)
  })
})

// `### Requirement: Board Glyph Selection Is Keyboard-Operable`
describe('BoardOverlay — keyboard operability', () => {
  const gates = [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }]

  it('tabs features first, then fleets, then lane gates, each in stable id order', () => {
    render(overlay({ fleets: [coasting()], gates }))
    const tab = (tid: string) => Number(screen.getByTestId(tid).getAttribute('tabindex'))
    // Features in id order: p-1 < p-1-moon < p-2 (f-star sorts first).
    expect(tab('feature-glyph-f-star')).toBeLessThan(tab('feature-glyph-p-1'))
    expect(tab('feature-glyph-p-1')).toBeLessThan(tab('feature-glyph-p-1-moon'))
    expect(tab('feature-glyph-p-1-moon')).toBeLessThan(tab('feature-glyph-p-2'))
    // Groups: every feature < every fleet < every gate.
    expect(tab('feature-glyph-p-2')).toBeLessThan(tab('fleet-glyph-own-1'))
    expect(tab('fleet-glyph-own-1')).toBeLessThan(tab('gate-glyph-sys-9'))
  })

  it('activates the focused hit target with Enter and Space, identically to a click', () => {
    const onSelectFeature = vi.fn()
    const onSelectFleet = vi.fn()
    render(overlay({ fleets: [coasting()], onSelectFeature, onSelectFleet }))
    const target = screen.getByTestId('feature-glyph-p-1')
    fireEvent.keyDown(target, { key: 'Enter' })
    expect(onSelectFeature).toHaveBeenCalledWith('p-1')
    fireEvent.keyDown(screen.getByTestId('fleet-glyph-own-1'), { key: ' ' })
    expect(onSelectFleet).toHaveBeenCalledWith('own-1')
  })

  it('shows a visible focus indicator on the focused glyph', () => {
    render(overlay())
    const target = screen.getByTestId('feature-glyph-p-1')
    expect(target.querySelector('[data-testid="glyph-focus-ring"]')).toBeNull()
    fireEvent.focus(target)
    expect(target.querySelector('[data-testid="glyph-focus-ring"]')).not.toBeNull()
    fireEvent.blur(target)
    expect(target.querySelector('[data-testid="glyph-focus-ring"]')).toBeNull()
  })

  it('keeps hit shapes keyed by entity id so world-time re-renders do not remount focus', () => {
    const { rerender } = render(overlay())
    const before = screen.getByTestId('feature-glyph-p-1')
    fireEvent.focus(before)
    rerender(overlay({ worldTime: 16 }))
    rerender(overlay({ worldTime: 32 }))
    // Same DOM node across frames — focus cannot have been dropped to <body>.
    expect(screen.getByTestId('feature-glyph-p-1')).toBe(before)
    expect(before.querySelector('[data-testid="glyph-focus-ring"]')).not.toBeNull()
  })
})

// `### Requirement: Foreign Fleets Render as Contact Marks Only` — the fleet
// read absent from the next render leaves no stale hit shape.
describe('BoardOverlay — fleet removal on read', () => {
  it('removes a fleet absent from the latest read, hit target included', () => {
    const { rerender } = render(overlay({ fleets: [coasting()] }))
    expect(screen.getByTestId('fleet-glyph-own-1')).toBeInTheDocument()
    rerender(overlay({ fleets: [] }))
    expect(screen.queryByTestId('fleet-glyph-own-1')).not.toBeInTheDocument()
  })
})
