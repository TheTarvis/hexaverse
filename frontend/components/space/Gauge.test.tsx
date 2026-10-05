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

// ===========================================================================
// RED-PHASE SUITE — openspec change `add-burn-cost-overlay`, tasks 1.1-1.6.
// The gauge's optional `cost` input: a part-height, start-anchored extent
// (`data-gauge-cost-extent`), an unaffordable mark (`data-gauge-cost-mark`) and
// a root attribute (`data-gauge-cost-state`). `cost` is passed through an
// untyped spread so this file stays `tsc`-clean before the prop exists; every
// test is assertion-red under vitest (impl contract §3.1).
// ===========================================================================

import type { ReactElement } from 'react'

function gaugeEl(over: Record<string, unknown> = {}): ReactElement {
  return <Gauge capacity={200} segments={[{ kind: 'fuel', tons: 80 }]} data-testid="g" {...over} />
}

function band(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-gauge-cost-extent]')
}

function mark(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-gauge-cost-mark]')
}

// `fillElements` selects every descendant with an inline width, which with a
// cost includes the band; the new tests exclude it.
function fillOnly(root: HTMLElement): HTMLElement[] {
  return fillElements(root).filter((el) => !el.hasAttribute('data-gauge-cost-extent'))
}

function need(el: HTMLElement | null, what: string): HTMLElement {
  expect(el, `${what} must be drawn`).not.toBeNull()
  return el as HTMLElement
}

function classTokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

// A colour class: <prefix:>*<utility>-<family>-<step>[/opacity] or the keyword
// colours. Layout utilities (`inset-y-0.5`, `w-1`, bare `border`) never match.
const COLOUR_TOKEN =
  /^((?:[\w-]+:)*)(bg|border|text|ring|outline|fill|stroke|from|via|to|divide|shadow|decoration|accent|caret)-(?:([a-z]+)-(\d{2,3})|white|black|transparent|current)(\/\S+)?$/

function colourTokens(el: Element): string[] {
  return classTokens(el).filter((t) => COLOUR_TOKEN.test(t))
}

function bgShade(el: Element, scheme: 'light' | 'dark'): string | undefined {
  const re = scheme === 'dark' ? /^dark:bg-([a-z]+-\d{2,3})$/ : /^bg-([a-z]+-\d{2,3})$/
  for (const t of classTokens(el)) {
    const m = re.exec(t)
    if (m) return m[1]
  }
  return undefined
}

const costOf = (tons: number, affordable: boolean) => ({ cost: { tons, affordable } })

describe('Gauge cost overlay — geometry (task 1.1)', () => {
  it('Scenario: A supplied quote draws one extent on the gauge\'s own scale (task 1.1)', () => {
    const { rerender } = render(gaugeEl(costOf(30, true)))
    const root = screen.getByTestId('g')
    const b = need(band(root), 'the extent')
    expect(b.style.left).toBe('0%')
    expect(Number.parseFloat(b.style.width)).toBeCloseTo(15, 5)
    // The marker attribute is written as an explicit empty string, never "true".
    expect(b.getAttribute('data-gauge-cost-extent')).toBe('')
    const fills = fillOnly(root)
    expect(fills).toHaveLength(1)
    expect(Number.parseFloat(fills[0].style.width)).toBeCloseTo(40, 5)
    expect(root).toHaveAttribute('data-gauge-state', 'filled')

    rerender(gaugeEl(costOf(100, true)))
    const b2 = need(band(screen.getByTestId('g')), 'the extent at 100 t')
    expect(Number.parseFloat(b2.style.width)).toBeCloseTo(50, 5)
    expect(b2.style.left).toBe('0%')
    expect(Number.parseFloat(fillOnly(screen.getByTestId('g'))[0].style.width)).toBeCloseTo(40, 5)
  })

  it('Scenario: The extent covers only part of the rail\'s height (task 1.1)', () => {
    const { rerender } = render(gaugeEl(costOf(30, true)))
    for (const tons of [30, 100]) {
      rerender(gaugeEl(costOf(tons, true)))
      const root = screen.getByTestId('g')
      const b = need(band(root), `the extent at ${tons} t`)
      const tokens = classTokens(b)
      expect(tokens).toContain('inset-y-0.5')
      expect(tokens).not.toContain('inset-y-0')
      expect(b.style.top).toBe('')
      expect(b.style.bottom).toBe('')
      expect(b.style.height).toBe('')
      const fills = fillOnly(root)
      expect(fills.length).toBeGreaterThan(0)
      for (const fill of fills) expect(classTokens(fill)).toContain('inset-y-0')
    }
  })
})

describe('Gauge cost overlay — rail limit and zero (task 1.2)', () => {
  it.each([true, false])(
    'Scenario: A cost above the capacity is limited to the rail (task 1.2) — flag %s',
    (affordable) => {
      const { rerender } = render(gaugeEl(costOf(250, affordable)))
      const over = screen.getByTestId('g')
      const stateOver = over.getAttribute('data-gauge-cost-state')
      expect(stateOver).toBe(affordable ? 'affordable' : 'unaffordable')
      expect(Number.parseFloat(need(band(over), 'the extent at 250 t').style.width)).toBeCloseTo(100, 5)
      const htmlOver = over.outerHTML

      rerender(gaugeEl(costOf(200, affordable)))
      const exact = screen.getByTestId('g')
      expect(exact.getAttribute('data-gauge-cost-state')).toBe(affordable ? 'affordable' : 'unaffordable')
      expect(Number.parseFloat(need(band(exact), 'the extent at 200 t').style.width)).toBeCloseTo(100, 5)
      // Nothing is drawn for the clamped cost that the exact cost does not draw.
      expect(htmlOver).toBe(exact.outerHTML)
    },
  )

  it.each([true, false])(
    'Scenario: A zero cost is a drawn overlay of zero length (task 1.2) — flag %s',
    (affordable) => {
      render(gaugeEl(costOf(0, affordable)))
      const root = screen.getByTestId('g')
      expect(root).toHaveAttribute('data-gauge-cost-state', affordable ? 'affordable' : 'unaffordable')
      const b = need(band(root), 'the zero-length extent')
      // Never `toBe(0)` on a parsed pull-back: at cost 0 it may parse to -0.
      expect(Number.parseFloat(b.style.width)).toBeCloseTo(0, 5)
    },
  )
})

describe('Gauge cost overlay — degenerate cost (task 1.3)', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['-5', -5],
  ])('Scenario: A cost that is not a finite non-negative number draws no overlay (task 1.3) — %s', (_label, tons) => {
    const baseline = render(gaugeEl())
    const baselineHtml = screen.getByTestId('g').outerHTML
    baseline.unmount()

    // Opening control: a valid cost draws the overlay on this very tree.
    const { rerender } = render(gaugeEl(costOf(30, true)))
    need(band(screen.getByTestId('g')), 'the control extent')

    rerender(gaugeEl(costOf(tons, true)))
    const root = screen.getByTestId('g')
    expect(band(root)).toBeNull()
    expect(mark(root)).toBeNull()
    expect(root).not.toHaveAttribute('data-gauge-cost-state')
    const fills = fillOnly(root)
    expect(fills).toHaveLength(1)
    expect(Number.parseFloat(fills[0].style.width)).toBeCloseTo(40, 5)
    expect(root).toHaveAttribute('data-gauge-state', 'filled')
    expect(root.outerHTML).toBe(baselineHtml)
  })
})

describe('Gauge cost overlay — state and palette (task 1.4)', () => {
  it('Scenario: An affordable quote\'s extent carries the affordable state (task 1.4)', () => {
    render(gaugeEl(costOf(30, true)))
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-cost-state', 'affordable')
    const b = need(band(root), 'the affordable extent')
    expect(colourTokens(b).sort()).toEqual(['bg-zinc-600', 'dark:bg-zinc-500'])
    expect(mark(root)).toBeNull()
  })

  it('Scenario: An unaffordable quote\'s extent carries the unaffordable state in amber (task 1.4)', () => {
    render(gaugeEl(costOf(30, false)))
    const root = screen.getByTestId('g')
    expect(root).toHaveAttribute('data-gauge-cost-state', 'unaffordable')
    const b = need(band(root), 'the unaffordable extent')
    expect(colourTokens(b).sort()).toEqual(['bg-amber-800', 'dark:bg-amber-600'])
  })

  it('Scenario: The extent\'s and the mark\'s colour classes stay in the amber and zinc families (task 1.4)', () => {
    const { rerender } = render(gaugeEl(costOf(30, true)))
    for (const affordable of [true, false]) {
      rerender(gaugeEl(costOf(30, affordable)))
      const root = screen.getByTestId('g')
      const b = need(band(root), 'the extent')
      const m = affordable ? null : need(mark(root), 'the mark')
      for (const el of [b, ...(m ? [m] : [])]) {
        const colours = colourTokens(el)
        expect(colours.length).toBeGreaterThan(0)
        for (const t of colours) {
          // No opacity suffix on the extent or the mark.
          expect(t, `opacity suffix on ${t}`).not.toContain('/')
          if (!t.startsWith('dark:')) {
            const utility = COLOUR_TOKEN.exec(t)![2]
            expect(
              colours.some((o) => o.startsWith('dark:') && COLOUR_TOKEN.exec(o)![2] === utility),
              `${t} has no dark: token of the same utility`,
            ).toBe(true)
          }
        }
      }
      // Over the root and every descendant: every utility-family-step token is
      // amber or zinc. (The rail's `white/[0.12]` has no step and is skipped.)
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        for (const t of classTokens(el)) {
          const m2 = COLOUR_TOKEN.exec(t)
          if (m2 && m2[3] !== undefined) expect(['amber', 'zinc'], `family of ${t}`).toContain(m2[3])
        }
      }
    }
  })

  it('Scenario: The unaffordable mark has a visible size and its own paint — the paint half (task 1.4)', () => {
    render(gaugeEl(costOf(30, false)))
    const root = screen.getByTestId('g')
    const b = need(band(root), 'the unaffordable extent')
    const m = need(mark(root), 'the mark')
    expect(classTokens(m)).toEqual(expect.arrayContaining([
      'bg-amber-500',
      'dark:bg-amber-400',
      'border-zinc-900',
      'dark:border-zinc-950',
    ]))
    // The binding paint criterion (RULING 20): per colour scheme, the mark
    // body's background shade is not the unaffordable extent's.
    for (const scheme of ['light', 'dark'] as const) {
      const markShade = bgShade(m, scheme)
      const bandShade = bgShade(b, scheme)
      expect(markShade, `mark ${scheme} background`).toBeDefined()
      expect(bandShade, `extent ${scheme} background`).toBeDefined()
      expect(markShade, `${scheme}: mark shares the extent's shade`).not.toBe(bandShade)
    }
  })
})

describe('Gauge cost overlay — no-data gauge (task 1.5)', () => {
  it.each([
    ['capacity undefined', { capacity: undefined }],
    ['capacity 0', { capacity: 0 }],
    ['segments undefined', { segments: undefined }],
  ])('Scenario: A gauge with no data draws no overlay (task 1.5) — %s', (_label, degenerate) => {
    const { rerender } = render(gaugeEl(costOf(30, false)))
    need(band(screen.getByTestId('g')), 'the control extent')

    rerender(gaugeEl({ ...costOf(30, false), ...degenerate }))
    const root = screen.getByTestId('g')
    expect(band(root)).toBeNull()
    expect(mark(root)).toBeNull()
    expect(root).not.toHaveAttribute('data-gauge-cost-state')
    expect(root).toHaveAttribute('data-gauge-state', 'no-data')
  })
})

describe('Gauge cost overlay — decorative and still (task 1.6)', () => {
  it('Scenario: The extent exposes no figure and no control; the overlay is hidden from assistive technology and does not animate (task 1.6)', () => {
    const phases: Array<[string, Record<string, unknown>]> = [
      ['no cost', {}],
      ['cost 30, unaffordable', costOf(30, false)],
      ['cost 60, unaffordable', costOf(60, false)],
      // SDET-added: the affordable extent is held to the same no-animation rule.
      ['cost 30, affordable', costOf(30, true)],
      ['no cost again', {}],
    ]
    const { rerender } = render(gaugeEl(phases[0][1]))
    for (const [name, over] of phases) {
      rerender(gaugeEl(over))
      const root = screen.getByTestId('g')
      const drawn = 'cost' in over
      const b = band(root)
      const m = mark(root)
      if (drawn) {
        need(b, `the extent (${name})`)
        if (over.cost && (over.cost as { affordable: boolean }).affordable) {
          expect(m, `no mark on an affordable quote (${name})`).toBeNull()
        } else {
          need(m, `the mark (${name})`)
        }
        expect(root.textContent).toBe('')
        for (const sel of ['[data-raw]', '[data-unit]', '[tabindex]', '[role]', '[aria-valuenow]', '[aria-valuetext]', '[aria-label]']) {
          expect(root.querySelectorAll(sel), `${sel} (${name})`).toHaveLength(0)
        }
        expect(b!.getAttributeNames().sort()).toEqual(['class', 'data-gauge-cost-extent', 'style'])
        if (m) {
          expect(m.getAttributeNames().sort()).toEqual(['class', 'data-gauge-cost-mark', 'style'])
          expect(m.closest('[aria-hidden="true"]')).toBe(root)
        }
        expect(b!.closest('[aria-hidden="true"]')).toBe(root)
      } else {
        // Withdrawn: no extent, no mark.
        expect(b, `extent withdrawn (${name})`).toBeNull()
        expect(m, `mark withdrawn (${name})`).toBeNull()
      }
      for (const el of [root, ...(b ? [b] : []), ...(m ? [m] : [])]) {
        expect(el.style.transition, `transition (${name})`).toBe('')
        expect(el.style.animation, `animation (${name})`).toBe('')
        for (const t of classTokens(el)) {
          expect(t, `animated class ${t} (${name})`).not.toMatch(/^(\w+:)*(transition|animate|duration|ease|delay)(-|$)/)
        }
      }
    }
  })
})
