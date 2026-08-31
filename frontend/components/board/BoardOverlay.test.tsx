import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { boardExtent, fitViewBox } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
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

function overlay(props: Partial<React.ComponentProps<typeof BoardOverlay>> = {}) {
  return (
    <BoardOverlay
      viewBox={VIEWBOX}
      extent={EXTENT}
      overlayStyle={STYLE}
      radius={RADIUS}
      worldTime={0}
      features={[star, planet, charted, moon]}
      {...props}
    />
  )
}

describe('BoardOverlay — hit shapes and attributes', () => {
  it('carries the full testid inventory with data attributes', () => {
    render(overlay({ gates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }))
    expect(screen.getByTestId('board-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('board-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('feature-glyph-p-1')).toHaveAttribute('data-band', 'visible')
    expect(screen.getByTestId('feature-glyph-p-1')).toHaveAttribute('data-mineable', 'true')
    expect(screen.getByTestId('feature-glyph-p-2')).toHaveAttribute('data-band', 'astronomical')
    expect(screen.getByTestId('feature-glyph-p-2')).not.toHaveAttribute('data-mineable')
    expect(screen.getByTestId('gate-glyph-sys-9')).toBeInTheDocument()
  })

  it('gives an outline-only astronomical feature the same hit-target size as a filled one', () => {
    render(overlay())
    const hitOf = (id: string) =>
      screen.getByTestId(`feature-glyph-${id}`).querySelector('circle[fill="transparent"]')!.getAttribute('r')
    expect(hitOf('p-2')).toBe(hitOf('p-1'))
  })

  it('orders hit shapes for topmost-wins: gates below features, moon after parent', () => {
    render(overlay({ gates: [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }] }))
    const svg = screen.getByTestId('board-overlay')
    const order = ['lane-gates', 'feature-glyphs'].map((tid) =>
      Array.prototype.indexOf.call(svg.children, svg.querySelector(`[data-testid="${tid}"]`)),
    )
    expect(order[0]).toBeLessThan(order[1]!)
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

// `BoardOverlay — burn paths and sensor bubble` (task 7.9's relocated
// coverage) and `BoardOverlay — fleet removal on read` (`### Requirement:
// Foreign Fleets Render as Contact Marks Only`) DELETED, with reason:
// migrate-fleet-to-continuous-burns design.md Decision 12 — the board draws
// no fleet layer after this change (a fleet has no board cell any more,
// only a continuous-space position); the fleet-glyph group, the committed
// burn-path polylines, and the ambient sensor bubble have no successor in
// `BoardOverlay.tsx` (see the module's own header comment and tasks.md
// 8.1/8.3/8.7). `board-view` REMOVED "Foreign Fleets Render as Contact
// Marks Only" and the fleet-position and running-scan requirements these
// tests exercised, with no successor (openspec/changes/migrate-fleet-to-
// continuous-burns/specs/board-view/spec.md). No test replaces these —
// there is no scenario left to cover.

// `### Requirement: Board Glyph Selection Is Keyboard-Operable`
describe('BoardOverlay — keyboard operability', () => {
  const gates = [{ destSystemId: 'sys-9', cell: { ring: 3, slot: 0 } }]

  it('tabs features first, then lane gates, each in stable id order', () => {
    render(overlay({ gates }))
    const tab = (tid: string) => Number(screen.getByTestId(tid).getAttribute('tabindex'))
    // Features in id order: p-1 < p-1-moon < p-2 (f-star sorts first).
    expect(tab('feature-glyph-f-star')).toBeLessThan(tab('feature-glyph-p-1'))
    expect(tab('feature-glyph-p-1')).toBeLessThan(tab('feature-glyph-p-1-moon'))
    expect(tab('feature-glyph-p-1-moon')).toBeLessThan(tab('feature-glyph-p-2'))
    // Groups: every feature < every gate.
    expect(tab('feature-glyph-p-2')).toBeLessThan(tab('gate-glyph-sys-9'))
  })

  it('activates the focused hit target with Enter and Space, identically to a click', () => {
    const onSelectFeature = vi.fn()
    const onSelectGate = vi.fn()
    render(overlay({ gates, onSelectFeature, onSelectGate }))
    const target = screen.getByTestId('feature-glyph-p-1')
    fireEvent.keyDown(target, { key: 'Enter' })
    expect(onSelectFeature).toHaveBeenCalledWith('p-1')
    fireEvent.keyDown(screen.getByTestId('gate-glyph-sys-9'), { key: ' ' })
    expect(onSelectGate).toHaveBeenCalledWith('sys-9')
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
