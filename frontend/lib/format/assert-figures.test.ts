import { describe, it, expect } from 'vitest'
import { assertFiguresMatchModule, assertNoFigures } from './assert-figures'
import type { FigureUnit } from './figures'

// RED-PHASE SUITE — openspec change `add-figure-formatting`. This is the
// coverage for the enforcement helper ITSELF, on the `anti-mirror-guard.
// test.ts` anti-vacuity precedent (contract §5.3): every planted case
// asserts the helper THROWS on a bypass and names why, plus the mirror
// "must pass" cases so the helper is not merely "always throws" — a checker
// that fails everything is exactly as useless as one that fails nothing.
//
// This is compile-red today: `assert-figures.ts` imports `formatByUnit`
// from `./figures`, which does not exist until task 1.1-1.10 lands (contract
// §7 Phase B — 9.5 depends on step 3). That is the correct, ordered kind of
// red for this phase.

function figureEl(raw: number, unit: FigureUnit, text: string): HTMLElement {
  const el = document.createElement('span')
  el.setAttribute('data-raw', String(raw))
  el.setAttribute('data-unit', unit)
  el.setAttribute('data-testid', `probe-${unit}`)
  el.textContent = text
  return el
}

function containerOf(...els: HTMLElement[]): HTMLElement {
  const c = document.createElement('div')
  for (const el of els) c.appendChild(el)
  return c
}

describe('assert-figures — planted bypass cases (contract §5.3)', () => {
  // 1. The range prefix bypass (round-3 MAJOR 2).
  it('Scenario: throws on the range prefix bypass — 833 is a fragment of 833.25, not a complete token', () => {
    const c = containerOf(figureEl(833.25, 'range', '833.25'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  // 2. The tonnage fragment bypass.
  it('Scenario: throws on the tonnage fragment bypass — a raw wire float printed unrounded', () => {
    const c = containerOf(figureEl(47.23519999999999, 'tons', '47.23519999999999 t'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  // 3. proposal.md's headline defect: String(remaining) bypass.
  it('Scenario: throws on the String(remaining) bypass — proposal.md\'s headline defect', () => {
    const c = containerOf(figureEl(21646048727, 'world-ms-span-in', '21646048727'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  // 4. A duration element claiming the wrong R3 direction form for its own
  //    token (RULING 23's decidability).
  it('Scenario: throws on a duration rendering the wrong direction form for its own data-unit token', () => {
    // data-unit says "in" (a future deadline); the text renders "left".
    const c = containerOf(figureEl(160000, 'world-ms-span-in', '2m 40s left'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  // 5. A world-ms-instant on a scale-less mount rendering the generic
  //    absent form `—` — RULING 26 says a stamp's T+ portion always
  //    renders, with only its suffix going absent (×—). This MUST fail.
  it('Scenario: throws when a world-ms-instant on a scale-less mount renders the bare absent form instead of its T+ portion with an absent suffix', () => {
    const c = containerOf(figureEl(0, 'world-ms-instant', '—'))
    expect(() => assertFiguresMatchModule(c, { scale: undefined })).toThrow()
  })

  // 6. A tons element on a scale-less mount rendering its tonnage
  //    normally — the other half of RULING 26. This MUST pass.
  it('Scenario: passes a tons element on a scale-less mount rendering normally (tons needs no scale)', () => {
    const c = containerOf(figureEl(47.23519999999999, 'tons', '47.2 t'))
    expect(() => assertFiguresMatchModule(c, { scale: undefined })).not.toThrow()
  })

  // 7. Prose digits (a select option's host id) are irrelevant to clause 2.
  it('Scenario: passes an option-style element whose prose carries its own unrelated digits', () => {
    const c = containerOf(figureEl(5000, 'world-ms-span-bare', 'body · feat-belt-1 · 0m 5s'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).not.toThrow()
  })

  // 8. Clause 1's matched token is exempt from clause 2.
  it('Scenario: passes ₡ 28 whose only numeric token is the module\'s own matched output', () => {
    const c = containerOf(figureEl(28, 'credits', '₡ 28'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).not.toThrow()
  })

  // 9. Anti-vacuity: an empty container throws for assertFiguresMatchModule
  //    (a container with no figures at all proves nothing) and passes for
  //    assertNoFigures (the render this legitimately describes).
  it('Scenario: an empty container — assertFiguresMatchModule throws, assertNoFigures passes', () => {
    const empty = document.createElement('div')
    expect(() => assertFiguresMatchModule(empty, { scale: 1 })).toThrow()
    expect(() => assertNoFigures(empty)).not.toThrow()
  })
})

describe('assert-figures — SDET-added: the checks that keep the helper itself from being vacuous', () => {
  it('SDET-added: throws on an invented data-unit spelling outside the closed union', () => {
    const el = document.createElement('span')
    el.setAttribute('data-raw', '5')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el.setAttribute('data-unit', 'tons-per-hour' as any)
    el.textContent = '5 t/h'
    const c = containerOf(el)
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  it('SDET-added: throws on a non-finite data-raw, which R11 forbids pairing with the attribute at all', () => {
    const el = document.createElement('span')
    el.setAttribute('data-raw', 'NaN')
    el.setAttribute('data-unit', 'tons')
    el.textContent = '— t'
    const c = containerOf(el)
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).toThrow()
  })

  it('SDET-added: assertNoFigures throws (not silently passes) when the container DOES carry a figure', () => {
    const c = containerOf(figureEl(28, 'credits', '₡ 28'))
    expect(() => assertNoFigures(c)).toThrow()
  })

  it('SDET-added: a genuinely compliant duration in each of the four direction forms passes, proving the helper is not "always throws"', () => {
    const c = containerOf(
      figureEl(252000, 'world-ms-span-in', 'in 4m 12s'),
      figureEl(160000, 'world-ms-span-left', '2m 40s left'),
      figureEl(-12000000, 'world-ms-span-ago', '3h 20m ago'),
      figureEl(252000, 'world-ms-span-bare', '4m 12s'),
    )
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).not.toThrow()
  })

  it('SDET-added: a negative credit balance with its sign in both data-raw and text passes', () => {
    const c = containerOf(figureEl(-50, 'credits', '₡ -50'))
    expect(() => assertFiguresMatchModule(c, { scale: 1 })).not.toThrow()
  })
})
