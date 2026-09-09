'use client'

// Figure.tsx — the shared presentation atom for `figure-formatting` (openspec
// change `add-figure-formatting`). Renders exactly one `<span>` carrying
// `data-raw`/`data-unit` (R11) and nothing else: no wrapper, no default
// className, no children prop, no variant/size/tone/emphasis (contract §3,
// design.md's "presentation atom, not a UI primitive" decision). `text` is
// the ONLY way content enters the element — it is always the already-
// formatted output of `@/lib/format`'s own functions, never composed here.
//
// `figureAttrs` is the one platform exception's shared implementation
// (contract §3.1): an `<option>` cannot nest a `<span>`, so
// `components/space/ScanControl.tsx` calls it directly and spreads the
// result onto the `<option>` itself. It is `<Figure>`'s own normalization
// logic, factored out so there is exactly one implementation of "a non-finite
// raw carries no data-raw attribute" (R11) rather than two.

import type { ReactElement } from 'react'
import type { FigureUnit } from '@/lib/format'

export interface FigureProps {
  /** The unformatted value. Non-finite is normalized away — see figureAttrs. */
  raw: number | null | undefined
  unit: FigureUnit
  /** The already-formatted text. The ONLY way text enters this element. */
  text: string
  className?: string
  'data-testid'?: string
  /** RULING 22, optional. The `×N` suffix's accessible explanation. */
  'aria-label'?: string
  title?: string
}

/**
 * Returns the `data-raw`/`data-unit` attribute pair `<Figure>` itself emits.
 * `data-raw` is present iff `Number.isFinite(raw)` — React would otherwise
 * serialize a non-finite `raw` as the literal string `"NaN"`/`"Infinity"`,
 * which R11 forbids. The ONLY other permitted caller of this function is
 * `components/space/ScanControl.tsx`'s `<option>` (enforced by
 * `lib/format/guards.test.ts`).
 */
export function figureAttrs(
  raw: number | null | undefined,
  unit: FigureUnit,
): { 'data-raw'?: string; 'data-unit': FigureUnit } {
  if (raw !== null && raw !== undefined && Number.isFinite(raw)) {
    return { 'data-raw': String(raw), 'data-unit': unit }
  }
  return { 'data-unit': unit }
}

export function Figure(props: FigureProps): ReactElement {
  const { raw, unit, text, className, 'data-testid': dataTestId, 'aria-label': ariaLabel, title } = props
  const attrs = figureAttrs(raw, unit)

  return (
    <span
      {...attrs}
      className={className}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      title={title}
    >
      {text}
    </span>
  )
}
