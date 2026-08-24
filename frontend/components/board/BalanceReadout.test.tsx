import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BalanceReadout } from './BalanceReadout'

describe('BalanceReadout', () => {
  it('shows the balance', () => {
    render(<BalanceReadout credits={2400} />)
    expect(screen.getByTestId('balance-value')).toHaveTextContent('2400')
  })

  it('renders a placeholder before the balance loads', () => {
    render(<BalanceReadout credits={undefined} />)
    expect(screen.getByTestId('balance-value')).toHaveTextContent('—')
  })

  it('shows the delta from a settled sale', () => {
    render(<BalanceReadout credits={2400} lastDelta={1400} />)
    expect(screen.getByTestId('balance-delta')).toHaveTextContent('+1400')
  })

  it('announces a settled sale to assistive technology', () => {
    render(<BalanceReadout credits={2400} lastDelta={1400} />)
    // A balance change conveyed only by the number changing is invisible to a
    // screen reader.
    const live = screen.getByTestId('balance-live-region')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Sold for 1400 credits')
    expect(live).toHaveTextContent('Balance 2400 credits')
  })

  it('announces a failed sale through the same region', () => {
    render(<BalanceReadout credits={1000} failure="Dock at the station before selling." />)
    expect(screen.getByTestId('balance-live-region')).toHaveTextContent(
      'Dock at the station before selling.',
    )
  })

  it('prefers the failure announcement over a stale delta', () => {
    render(<BalanceReadout credits={1000} lastDelta={500} failure="That sale could not be completed." />)
    const live = screen.getByTestId('balance-live-region')
    expect(live).toHaveTextContent('could not be completed')
    expect(live).not.toHaveTextContent('Sold for')
  })

  it('re-announces a repeated identical failure', () => {
    // Two failures in a row with the same message must still be announced twice;
    // a plain live region would go silent on identical text.
    const { rerender } = render(<BalanceReadout credits={1000} failure="Same problem." />)
    const first = screen.getByTestId('balance-live-region').textContent

    rerender(<BalanceReadout credits={1000} failure={null} />)
    rerender(<BalanceReadout credits={1000} failure="Same problem." />)
    const second = screen.getByTestId('balance-live-region').textContent

    expect(second).not.toBe(first)
    expect(second).toContain('Same problem.')
  })

  it('stays quiet with nothing to announce', () => {
    render(<BalanceReadout credits={1000} />)
    expect(screen.getByTestId('balance-live-region')).toHaveTextContent('')
  })
})
