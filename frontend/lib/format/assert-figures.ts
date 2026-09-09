// assert-figures — the shared runtime enforcement helper for
// `figure-formatting` R12 (contract §5, RULING 17/23/25/26). This is TEST
// INFRASTRUCTURE, not production code: no component ever imports it, and it
// lives beside `guards.test.ts` (not inside it) because, unlike the static
// guard suite, it needs to render and inspect a live DOM tree per test.
//
// It is the change's central invariant: an element carrying `data-raw` and
// `data-unit` is compliant only if its own text content is a computable
// function of those two attributes (plus the scale the test rendered with).
// This closes the `<Figure text={...}>` bypass STRUCTURALLY — it does not
// matter what produced the string (`toFixed`, a local formatter, a
// hand-typed template) because the check never asks what produced it, only
// whether the result matches what the shared module would have produced.
//
// Bound by the same purity fence as `figures.ts` (contract §1.4) except that
// it may import `figures.ts` and the DOM `Element`/`HTMLElement` types: no
// react, no `lib/market`, no `lib/space`, no `Date`/`performance`/
// `Math.random`/`Intl`/`toLocaleString`.

import { formatByUnit, type FigureUnit } from './figures'

const FIGURE_UNITS: ReadonlySet<FigureUnit> = new Set<FigureUnit>([
  'world-ms-span-in',
  'world-ms-span-left',
  'world-ms-span-ago',
  'world-ms-span-bare',
  'world-ms-instant',
  'tons',
  'range',
  'delta-v',
  'credits',
  'tons-per-world-ms',
  'tons-per-world-s',
])

/**
 * A complete numeric token: a maximal run of digits together with any
 * decimal point, thousands separator or magnitude suffix bound to it
 * (contract §5.2's definitions, RULING 25).
 */
const TOKEN_RE = /-?\d[\d,]*(?:\.\d+)?[kM]?/g

function isNumeric(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9'
}
function isBound(c: string | undefined): boolean {
  return c === '.' || c === ','
}
function isMagnitudeSuffix(c: string | undefined): boolean {
  return c === 'k' || c === 'M'
}

interface Token {
  match: string
  start: number
  end: number
}

function completeNumericTokens(text: string): Token[] {
  const out: Token[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index === undefined) continue
    out.push({ match: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/**
 * Finds the first token-anchored occurrence of `expected` in `text`
 * (contract §5.2). Returns -1 when no anchored occurrence exists — including
 * when `expected` never occurs as a plain substring at all.
 */
function tokenAnchoredIndexOf(text: string, expected: string): number {
  if (expected.length === 0) return -1
  let searchFrom = 0
  for (;;) {
    const i = text.indexOf(expected, searchFrom)
    if (i === -1) return -1
    const prev = i > 0 ? text[i - 1] : undefined
    const next = i + expected.length < text.length ? text[i + expected.length] : undefined
    const first = expected[0]
    const last = expected[expected.length - 1]

    const leftMustGuard = isNumeric(first) || first === '-' || isBound(first)
    const leftOk = !leftMustGuard || !(isNumeric(prev) || isBound(prev))

    const rightMustGuard = isNumeric(last) || isBound(last) || isMagnitudeSuffix(last)
    const rightOk = !rightMustGuard || !(isNumeric(next) || isBound(next))

    if (leftOk && rightOk) return i
    searchFrom = i + 1
  }
}

function describeEl(el: Element): string {
  const testId = el.getAttribute('data-testid')
  return testId ? `[data-testid="${testId}"]` : `<${el.tagName.toLowerCase()}>`
}

/**
 * R12's runtime enforcement (contract §5). Queries every element in
 * `container` carrying both `data-raw` and `data-unit`, and asserts — for
 * each — that the shared module's own output for that element's
 * `(data-raw, scale, data-unit)` appears in its text as a complete numeric
 * token (clause 1), and that no OTHER complete numeric token in that
 * element's text equals a full-precision rendering of its own `data-raw`
 * (clause 2). Throws (with the element's testid, unit, raw, expected and
 * text) on the first violation. Throws on an empty result set too — a
 * container with no figures at all proves nothing; use `assertNoFigures` for
 * that case.
 */
export function assertFiguresMatchModule(
  container: HTMLElement,
  opts: { scale: number | undefined },
): void {
  const elements = Array.from(container.querySelectorAll('[data-raw][data-unit]'))
  if (elements.length === 0) {
    throw new Error(
      'assertFiguresMatchModule: no element in this container carries both data-raw and ' +
        'data-unit. If this render legitimately shows no figure at all, use assertNoFigures ' +
        'instead — this assertion is meaningless (vacuously true) against an empty set.',
    )
  }

  for (const el of elements) {
    const rawAttr = el.getAttribute('data-raw')
    const unitAttr = el.getAttribute('data-unit')
    if (rawAttr === null || unitAttr === null) continue // querySelectorAll guarantees both present

    if (!FIGURE_UNITS.has(unitAttr as FigureUnit)) {
      throw new Error(
        `assertFiguresMatchModule: ${describeEl(el)} carries data-unit="${unitAttr}", which is ` +
          'not a member of the closed FigureUnit union.',
      )
    }
    const unit = unitAttr as FigureUnit

    const raw = Number(rawAttr)
    if (!Number.isFinite(raw)) {
      throw new Error(
        `assertFiguresMatchModule: ${describeEl(el)} carries data-raw="${rawAttr}", which is not ` +
          'a finite number. R11 requires data-raw to be present only when the raw value is finite.',
      )
    }

    const text = el.textContent ?? ''
    const expected = formatByUnit(raw, opts.scale, unit)

    const matchIndex = tokenAnchoredIndexOf(text, expected)
    if (matchIndex === -1) {
      throw new Error(
        `assertFiguresMatchModule: clause 1 failed for ${describeEl(el)} ` +
          `data-unit="${unit}" data-raw="${rawAttr}" expected="${expected}" — the module's own ` +
          `output did not appear in the element's text as a complete numeric token. ` +
          `text="${text}"`,
      )
    }
    const matchStart = matchIndex
    const matchEnd = matchIndex + expected.length

    for (const token of completeNumericTokens(text)) {
      const insideMatch = token.start >= matchStart && token.end <= matchEnd
      if (insideMatch) continue
      const stripped = token.match.replace(/,/g, '')
      if (token.match === rawAttr || stripped === rawAttr) {
        throw new Error(
          `assertFiguresMatchModule: clause 2 failed for ${describeEl(el)} ` +
            `data-unit="${unit}" data-raw="${rawAttr}" expected="${expected}" — the element's text ` +
            `contains the complete numeric token "${token.match}", equal to its own full-precision ` +
            `raw value, outside the module's own matched output. text="${text}"`,
        )
      }
    }
  }
}

/**
 * For a render that legitimately shows no figure at all. Throws if the
 * container carries ANY element with a `data-raw`/`data-unit` pair — the
 * anti-vacuity complement to `assertFiguresMatchModule`'s own empty-set
 * guard, so the two functions can never both silently pass the same
 * container for opposite reasons.
 */
export function assertNoFigures(container: HTMLElement): void {
  const elements = container.querySelectorAll('[data-raw][data-unit]')
  if (elements.length > 0) {
    const ids = Array.from(elements)
      .map((el) => describeEl(el))
      .join(', ')
    throw new Error(
      `assertNoFigures: container carries ${elements.length} figure element(s) (${ids}), but this ` +
        'render is expected to show no figure at all.',
    )
  }
}
