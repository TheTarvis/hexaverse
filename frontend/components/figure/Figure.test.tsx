import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { Figure, figureAttrs } from './Figure'

// RED-PHASE SUITE — openspec change `add-figure-formatting`, capability
// `figure-formatting`: *Every Formatted Figure Carries Its Raw Served Value
// on a Data Attribute* (R11), plus contract §3's exact rendered-output
// contract and §3.1's `figureAttrs` platform exception. Tasks 1.9-1.10.
//
// Written before `Figure.tsx` exists — compile-red until the developer
// creates `frontend/components/figure/Figure.tsx`.

describe('<Figure> — exactly one element, nothing else (contract §3)', () => {
  it('Scenario: renders exactly one <span>, no wrapper, no fragment', () => {
    const { container } = render(<Figure raw={47.2} unit="tons" text="47.2 t" />)
    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
  })

  it('Scenario: the text prop is the only way text enters the element', () => {
    const { container } = render(<Figure raw={47.2} unit="tons" text="47.2 t" />)
    expect(container.textContent).toBe('47.2 t')
  })

  it('Scenario: data-unit is always emitted', () => {
    const { container } = render(<Figure raw={undefined} unit="credits" text="—" />)
    expect(container.firstElementChild).toHaveAttribute('data-unit', 'credits')
  })

  it('Scenario: no default className, font, colour, or spacing class of its own', () => {
    const { container } = render(<Figure raw={1} unit="tons" text="1.0 t" />)
    // No className prop passed -> the class attribute is absent or empty,
    // never a class the component invented on its own.
    const el = container.firstElementChild!
    expect(el.className).toBe('')
  })

  it('Scenario: a passed className is applied verbatim, with no class added or removed', () => {
    const { container } = render(<Figure raw={1} unit="tons" text="1.0 t" className="text-zinc-400 font-mono" />)
    expect(container.firstElementChild).toHaveClass('text-zinc-400', 'font-mono')
    expect(container.firstElementChild?.className).toBe('text-zinc-400 font-mono')
  })

  it('Scenario: a passed data-testid is applied', () => {
    const { getByTestId } = render(<Figure raw={1} unit="tons" text="1.0 t" data-testid="preview-fuel" />)
    expect(getByTestId('preview-fuel')).toBeInTheDocument()
  })
})

describe('<Figure> — data-raw presence follows Number.isFinite(raw) (R11)', () => {
  it('Scenario: a formatted tonnage carries its raw value at full precision', () => {
    const { container } = render(<Figure raw={47.23519999999999} unit="tons" text="47.2 t" />)
    expect(container.firstElementChild).toHaveAttribute('data-raw', '47.23519999999999')
  })

  it('Scenario: the raw value is the wire figure, not the display figure', () => {
    const { container } = render(<Figure raw={99.94} unit="tons" text="99.9 t" />)
    // Number(data-raw) recovers the SERVED value, not the rounded display text.
    expect(Number(container.firstElementChild!.getAttribute('data-raw'))).toBe(99.94)
  })

  it('Scenario: a figure with no numeric value carries no raw attribute — undefined', () => {
    const { container } = render(<Figure raw={undefined} unit="tons" text="—" />)
    expect(container.firstElementChild).not.toHaveAttribute('data-raw')
  })

  it('Scenario: a figure with no numeric value carries no raw attribute — null', () => {
    const { container } = render(<Figure raw={null} unit="tons" text="—" />)
    expect(container.firstElementChild).not.toHaveAttribute('data-raw')
  })

  it('Scenario: a figure with no numeric value carries no raw attribute — NaN is normalized away, never the literal string "NaN"', () => {
    const { container } = render(<Figure raw={NaN} unit="tons" text="—" />)
    const el = container.firstElementChild!
    expect(el).not.toHaveAttribute('data-raw')
    expect(el.getAttribute('data-raw')).not.toBe('NaN')
  })

  it('Scenario: Infinity is normalized away, never the literal string "Infinity"', () => {
    const { container } = render(<Figure raw={Infinity} unit="delta-v" text="—" />)
    const el = container.firstElementChild!
    expect(el).not.toHaveAttribute('data-raw')
    expect(el.getAttribute('data-raw')).not.toBe('Infinity')
  })

  it('Scenario: -Infinity is normalized away too', () => {
    const { container } = render(<Figure raw={-Infinity} unit="delta-v" text="—" />)
    expect(container.firstElementChild).not.toHaveAttribute('data-raw')
  })

  it('Scenario: presence follows the value, never the rendered text — a due figure (spanMs <= 0) still carries data-raw', () => {
    // "now" is due-form text, not absent-form text; the raw span (e.g. -1)
    // is a finite number, so data-raw is present with that raw value.
    const { container } = render(<Figure raw={-1} unit="world-ms-span-in" text="now" />)
    expect(container.firstElementChild).toHaveAttribute('data-raw', '-1')
  })

  it('Scenario: presence follows the value even when the scale is unserved and the rendered text is the absent form', () => {
    // The value IS known (e.g. a duration's raw span); only the scale is
    // not. data-raw must still be present.
    const { container } = render(<Figure raw={252000} unit="world-ms-span-in" text="—" />)
    expect(container.firstElementChild).toHaveAttribute('data-raw', '252000')
  })
})

describe('<Figure> — the accessible label (RULING 22)', () => {
  it('Scenario: title is passed through, for the scale-suffix accessible explanation', () => {
    const { container } = render(
      <Figure
        raw={187980000}
        unit="world-ms-instant"
        text="T+ 2d 04:13 ×60"
        title="The world clock is running at 60 times real time."
      />,
    )
    expect(container.firstElementChild).toHaveAttribute(
      'title',
      'The world clock is running at 60 times real time.',
    )
  })

  it('Scenario: aria-label is accepted and passed through', () => {
    const { container } = render(
      <Figure raw={1} unit="tons" text="1.0 t" aria-label="one point oh tons" />,
    )
    expect(container.firstElementChild).toHaveAttribute('aria-label', 'one point oh tons')
  })

  it('Scenario: with no label prop, neither title nor aria-label is emitted', () => {
    const { container } = render(<Figure raw={1} unit="tons" text="1.0 t" />)
    const el = container.firstElementChild!
    expect(el).not.toHaveAttribute('title')
    expect(el).not.toHaveAttribute('aria-label')
  })
})

describe('<Figure> — the closed prop fence', () => {
  it('Scenario: no children prop exists on the type (compiles green only if passing one is a real type error)', () => {
    // @ts-expect-error — FigureProps declares no `children`; text is the
    // only way content enters this element.
    render(<Figure raw={1} unit="tons" text="1.0 t">unformatted content</Figure>)
    expect(true).toBe(true)
  })

  it('Scenario: no variant/size/tone/emphasis prop exists on the type', () => {
    // @ts-expect-error — variant is not part of FigureProps.
    render(<Figure raw={1} unit="tons" text="1.0 t" variant="large" />)
    expect(true).toBe(true)
  })
})

describe('figureAttrs — the one platform exception (contract §3.1, an <option> cannot nest a <span>)', () => {
  it('Scenario: An element that cannot hold a nested figure carries the pair itself — figureAttrs returns both attributes for a finite raw', () => {
    expect(figureAttrs(5000, 'world-ms-span-bare')).toEqual({
      'data-raw': '5000',
      'data-unit': 'world-ms-span-bare',
    })
  })

  it('Scenario: figureAttrs omits data-raw for a non-finite or absent raw, exactly like <Figure>', () => {
    expect(figureAttrs(undefined, 'world-ms-span-bare')).toEqual({ 'data-unit': 'world-ms-span-bare' })
    expect(figureAttrs(NaN, 'world-ms-span-bare')).toEqual({ 'data-unit': 'world-ms-span-bare' })
    expect(figureAttrs(Infinity, 'world-ms-span-bare')).toEqual({ 'data-unit': 'world-ms-span-bare' })
  })

  it('Scenario: figureAttrs serializes at full precision, identically to <Figure>\'s own data-raw', () => {
    expect(figureAttrs(47.23519999999999, 'tons')['data-raw']).toBe('47.23519999999999')
  })
})
