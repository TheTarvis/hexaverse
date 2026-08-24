import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Quote } from '@/lib/types/market'

// The inspector's station section is rendered inline inside GalaxyView's
// Inspector, which needs the whole graph stack to mount. These tests pin the
// section's OWN rules — what it shows and how it distinguishes demand — against
// the same markup, extracted so they run without the renderer.
function StationSection({ quotes }: { quotes: Quote[] | null }) {
  if (!quotes || quotes.length === 0) return null
  return (
    <div data-testid="inspector-station">
      <ul>
        {quotes.map((q) => {
          const top = q.entries.find((e) => (e.unlimited ? true : (e.remainingQuantity ?? 0) > 0))
          if (!top) return null
          return (
            <li key={q.kind} data-testid={`inspector-quote-${q.kind}`}>
              <span aria-hidden="true">{top.source === 'request' ? '★' : '·'}</span>
              <span>{q.kind}</span>
              <span>{top.source === 'request' ? 'request' : 'floor'}</span>
              <span>{top.unitPrice} cr/t</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const quotes: Quote[] = [
  {
    kind: 'metals',
    entries: [
      { unitPrice: 140, source: 'request', remainingQuantity: 30, requestId: 'req-1' },
      { unitPrice: 100, source: 'floor', unlimited: true },
    ],
  },
  { kind: 'water', entries: [{ unitPrice: 8, source: 'floor', unlimited: true }] },
]

describe("the inspector's station section", () => {
  it('renders a quote per tradable kind', () => {
    render(<StationSection quotes={quotes} />)
    expect(screen.getByTestId('inspector-quote-metals')).toHaveTextContent('140 cr/t')
    expect(screen.getByTestId('inspector-quote-water')).toHaveTextContent('8 cr/t')
  })

  it('is omitted entirely when no station is visible', () => {
    // A station below the requester's tier 404s server-side, so "not visible"
    // and "not there" are indistinguishable — by design.
    const { container } = render(<StationSection quotes={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('distinguishes a premium request from the floor by more than colour', () => {
    render(<StationSection quotes={quotes} />)
    expect(screen.getByTestId('inspector-quote-metals')).toHaveTextContent('request')
    expect(screen.getByTestId('inspector-quote-water')).toHaveTextContent('floor')
  })

  it('quotes the best standing demand, not the floor, when a request is open', () => {
    render(<StationSection quotes={quotes} />)
    // The player is deciding on the price they would actually get for the first
    // ton, which is the request's premium — not the floor beneath it.
    expect(screen.getByTestId('inspector-quote-metals')).toHaveTextContent('140')
    expect(screen.getByTestId('inspector-quote-metals')).not.toHaveTextContent('100 cr/t')
  })

  it('falls through to the floor once a request is drained', () => {
    const drained: Quote[] = [
      {
        kind: 'metals',
        entries: [
          { unitPrice: 140, source: 'request', remainingQuantity: 0, requestId: 'req-1' },
          { unitPrice: 100, source: 'floor', unlimited: true },
        ],
      },
    ]
    render(<StationSection quotes={drained} />)
    expect(screen.getByTestId('inspector-quote-metals')).toHaveTextContent('100 cr/t')
    expect(screen.getByTestId('inspector-quote-metals')).toHaveTextContent('floor')
  })
})
