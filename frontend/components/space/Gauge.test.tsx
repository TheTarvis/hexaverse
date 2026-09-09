import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// RED-PHASE SUITE — openspec change `add-vitals-strip`, capability
// `system-console`: the shared decorative gauge atom backing the fuel cell's
// plain fill and the hold cell's kind-segmented fill (impl contract §5,
// tasks.md 1.3/1.4). `Gauge.tsx` does not exist yet — every test below is
// COMPILE-RED until it does.
//
// THE CONTRACT (impl contract §5.1-§5.4), pinned here:
//
//   export type GaugeState = 'no-data' | 'empty' | 'filled'
//   export interface GaugeSegment { kind: string; tons: number }
//   export interface GaugeProps {
//     capacity: number | undefined
//     segments: GaugeSegment[] | undefined
//     'data-testid': string
//     className?: string
//   }
//   export function Gauge(props: GaugeProps): ReactElement
//
// The gauge is DECORATIVE (§5.2): aria-hidden="true" on the root, no
// data-raw, no data-unit, no aria-valuenow/aria-valuetext, no percentage
// text, no accessible name, no role. Every number a player or a test reads
// is an adjacent <Figure> in the CELL's text, never inside the gauge. State
// is exposed as `data-gauge-state` on the root, one of the three named
// values (§5.3) — NOT inferred from fill geometry, which round 3 of the
// adversary caught being satisfied by exactly the forbidden implementation
// ("differ in a DOM-observable attribute" satisfied by width:0% vs
// width:23%).
//
// Denominator (§5.4): both gauges share ONE tons-to-pixels scale, the
// served `capacity`. Each segment's width is
// `clamp(tons / capacity, 0, 1) * 100` as inline `style={{ width }}`
// geometry only — never a computed colour class.

import { Gauge, type GaugeSegment } from './Gauge'

function fillElements(root: HTMLElement): HTMLElement[] {
  // The gauge's own fill segments: elements carrying an inline `width`
  // style, inside the gauge root, excluding the root itself. This is
  // deliberately loose about markup shape (a `<div>` per segment is the
  // obvious build, but the contract does not pin the tag) and deliberately
  // strict about what a "fill" is: something with computed inline width
  // geometry, since §5.4 requires the geometry to be inline style, never a
  // computed colour class.
  return Array.from(root.querySelectorAll<HTMLElement>('[style]')).filter(
    (el) => el !== root && el.style.width !== '',
  )
}

describe('Gauge — data-gauge-state (contract §5.3): three named values, never inferred from fill geometry', () => {
  it('Scenario: capacity undefined -> no-data, no fill rendered', () => {
    render(<Gauge capacity={undefined} segments={[{ kind: 'fuel', tons: 10 }]} data-testid="g" />)
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-state', 'no-data')
    expect(fillElements(root)).toHaveLength(0)
  })

  it('Scenario: segments undefined -> no-data, even when capacity is served', () => {
    render(<Gauge capacity={200} segments={undefined} data-testid="g" />)
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-state', 'no-data')
    expect(fillElements(root)).toHaveLength(0)
  })

  it('Scenario: segments is [] (served, empty) -> empty, distinct from no-data', () => {
    render(<Gauge capacity={200} segments={[]} data-testid="g" />)
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-state', 'empty')
    expect(root).not.toHaveAttribute('data-gauge-state', 'no-data')
    expect(fillElements(root)).toHaveLength(0)
  })

  it('Scenario: segments served but every one totals zero tons -> empty, not filled', () => {
    render(<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 0 }]} data-testid="g" />)
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-state', 'empty')
  })

  it('Scenario: at least one segment with tons > 0 -> filled', () => {
    render(<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 50 }]} data-testid="g" />)
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-state', 'filled')
    expect(fillElements(root).length).toBeGreaterThan(0)
  })

  it('Scenario: mixed segments (one zero, one positive) still reads filled — the pool as a whole has tonnage', () => {
    render(
      <Gauge
        capacity={200}
        segments={[
          { kind: 'fuel', tons: 0 },
          { kind: 'metals', tons: 12 },
        ]}
        data-testid="g"
      />,
    )
    expect(screen.getByTestId('g')).toHaveAttribute('data-gauge-state', 'filled')
  })

  it('Scenario: capacity <= 0 reads no-data even with served, positive segments', () => {
    render(<Gauge capacity={0} segments={[{ kind: 'fuel', tons: 10 }]} data-testid="g" />)
    expect(screen.getByTestId('g')).toHaveAttribute('data-gauge-state', 'no-data')

    render(<Gauge capacity={-5} segments={[{ kind: 'fuel', tons: 10 }]} data-testid="g2" />)
    expect(screen.getByTestId('g2')).toHaveAttribute('data-gauge-state', 'no-data')
  })

  it('Scenario: a non-finite capacity (NaN, Infinity) reads no-data', () => {
    render(<Gauge capacity={NaN} segments={[{ kind: 'fuel', tons: 10 }]} data-testid="g" />)
    expect(screen.getByTestId('g')).toHaveAttribute('data-gauge-state', 'no-data')

    render(<Gauge capacity={Infinity} segments={[{ kind: 'fuel', tons: 10 }]} data-testid="g2" />)
    expect(screen.getByTestId('g2')).toHaveAttribute('data-gauge-state', 'no-data')
  })

  // Scenario: The gauge's no-data state is DOM-distinguishable from a
  // sub-pixel fill (task 4.4 / the fuel cell's own scenario, exercised here
  // at the atom level since the atom is what actually carries the
  // attribute). 0.05 t against 200 t capacity rounds to a fraction of a CSS
  // pixel at any laptop-scale width — the state attribute must still read
  // `filled`, with the fill geometry ignored.
  it('Scenario: the no-data state is DOM-distinguishable from a sub-pixel fill, by the state attribute alone', () => {
    const { rerender } = render(<Gauge capacity={undefined} segments={undefined} data-testid="g" />)
    expect(screen.getByTestId('g')).toHaveAttribute('data-gauge-state', 'no-data')

    rerender(<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 0.05 }]} data-testid="g" />)
    expect(screen.getByTestId('g')).toHaveAttribute('data-gauge-state', 'filled')
    expect(screen.getByTestId('g')).not.toHaveAttribute('data-gauge-state', 'no-data')
  })
})

describe('Gauge — fill ratio, segment count and order', () => {
  it('Scenario: a single segment fills to tons/capacity, expressed as inline width geometry', () => {
    render(<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 50 }]} data-testid="g" />)
    const fills = fillElements(screen.getByTestId('g'))
    expect(fills).toHaveLength(1)
    // 50/200 = 25%.
    expect(fills[0].style.width).toBe('25%')
  })

  it('Scenario: multiple segments render one fill element per segment, in the given array order, cumulative widths clamped to 100%', () => {
    const segments: GaugeSegment[] = [
      { kind: 'fuel', tons: 40 },
      { kind: 'metals', tons: 30 },
      { kind: 'organics', tons: 10 },
    ]
    render(<Gauge capacity={100} segments={segments} data-testid="g" />)
    const fills = fillElements(screen.getByTestId('g'))
    expect(fills).toHaveLength(3)
    // The gauge renders segments in the order it is GIVEN — sort-by-kind is
    // the caller's job (contract §3.4/§5.4), never the atom's.
    expect(fills.map((f) => f.style.width)).toEqual(['40%', '30%', '10%'])
  })

  it('Scenario: a segment whose tons exceed capacity clamps its own fill to 100%, never overflowing the rail', () => {
    render(<Gauge capacity={100} segments={[{ kind: 'fuel', tons: 250 }]} data-testid="g" />)
    const fills = fillElements(screen.getByTestId('g'))
    expect(fills[0].style.width).toBe('100%')
  })

  it('Scenario: segments summing beyond capacity never let the cumulative fill exceed 100%', () => {
    render(
      <Gauge
        capacity={100}
        segments={[
          { kind: 'fuel', tons: 80 },
          { kind: 'metals', tons: 80 },
        ]}
        data-testid="g"
      />,
    )
    const fills = fillElements(screen.getByTestId('g'))
    const totalPct = fills.reduce((sum, f) => sum + Number.parseFloat(f.style.width), 0)
    expect(totalPct).toBeLessThanOrEqual(100)
  })
})

describe('Gauge — decorative: no figure, no accessible value, no colour-only signal (contract §5.2)', () => {
  it('Scenario: the root carries aria-hidden="true"', () => {
    render(<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 50 }]} data-testid="g" />)
    expect(screen.getByTestId('g')).toHaveAttribute('aria-hidden', 'true')
  })

  it('Scenario: the gauge exposes no accessible value, no percentage text, and no data-raw/data-unit anywhere in its subtree', () => {
    render(
      <Gauge
        capacity={200}
        segments={[
          { kind: 'fuel', tons: 50 },
          { kind: 'metals', tons: 10 },
        ]}
        data-testid="g"
      />,
    )
    const root = screen.getByTestId('g')
    expect(root).not.toHaveAttribute('aria-valuenow')
    expect(root).not.toHaveAttribute('aria-valuetext')
    expect(root).not.toHaveAttribute('role')
    expect(root).not.toHaveAttribute('aria-label')
    expect(root.querySelectorAll('[data-raw]')).toHaveLength(0)
    expect(root.querySelectorAll('[data-unit]')).toHaveLength(0)
    expect(root.textContent ?? '').not.toMatch(/%/)
    expect(root.textContent ?? '').not.toMatch(/\d/)
  })

  it('SDET-added: legibility with colour removed — the gauge itself carries every kind and tonnage as NO text at all; that legibility obligation belongs to the cell\'s own adjacent <Figure> elements, never to the gauge', () => {
    render(
      <Gauge
        capacity={200}
        segments={[
          { kind: 'fuel', tons: 50 },
          { kind: 'metals', tons: 10 },
        ]}
        data-testid="g"
      />,
    )
    expect(screen.getByTestId('g').textContent ?? '').toBe('')
  })
})

describe('Gauge — testid and className plumbing', () => {
  it('Scenario: data-testid is the prop value, verbatim, on the root element', () => {
    render(<Gauge capacity={200} segments={[]} data-testid="fuel-gauge" />)
    expect(screen.getByTestId('fuel-gauge')).toBeInTheDocument()
  })

  it('SDET-added: className is applied to the root so the two mount points (fuel-gauge, hold-gauge) can size it per cell', () => {
    render(<Gauge capacity={200} segments={[]} data-testid="g" className="w-24" />)
    expect(screen.getByTestId('g').className).toMatch(/\bw-24\b/)
  })
})
