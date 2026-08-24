import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SellSection } from './SellSection'
import type { Quote } from '@/lib/types/market'
import type { FleetRoster } from '@/lib/types/fleet'

const quotes: Quote[] = [
  {
    kind: 'metals',
    entries: [
      { unitPrice: 140, source: 'request', remainingQuantity: 30, requestId: 'req-1' },
      { unitPrice: 100, source: 'floor', unlimited: true },
    ],
  },
  {
    kind: 'water',
    entries: [{ unitPrice: 8, source: 'floor', unlimited: true }],
  },
]

function roster(cargo: Record<string, number> | null): FleetRoster {
  return {
    ships: [{ class: 'seed' }],
    cargo,
    cargoCapacity: 100,
    freeHold: 100 - Object.values(cargo ?? {}).reduce((a, b) => a + b, 0),
    miningRate: 10,
  } as FleetRoster
}

describe('SellSection', () => {
  it('defaults to the kind with the greatest tonnage aboard', () => {
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 40, water: 5 })} pending={false} onSell={vi.fn()} />,
    )
    expect(screen.getByTestId('sell-kind-metals')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('sell-tons-input')).toHaveValue(40)
  })

  it('offers only kinds the fleet holds AND the station buys', () => {
    render(
      <SellSection
        quotes={quotes}
        roster={roster({ metals: 40, exotic: 10 })}
        pending={false}
        onSell={vi.fn()}
      />,
    )
    expect(screen.getByTestId('sell-kind-metals')).toBeInTheDocument()
    // Held but not bought here — offering it would set the player up for a
    // "not tradable" rejection.
    expect(screen.queryByTestId('sell-kind-exotic')).not.toBeInTheDocument()
    // Bought here but not held.
    expect(screen.queryByTestId('sell-kind-water')).not.toBeInTheDocument()
  })

  it('previews proceeds folded across the demand, split per portion', () => {
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 50 })} pending={false} onSell={vi.fn()} />,
    )
    // 30t at the 140 request + 20t at the 100 floor = 4200 + 2000.
    expect(screen.getByTestId('sell-proceeds')).toHaveTextContent('6200 cr')
    const breakdown = screen.getByTestId('sell-fill-breakdown')
    expect(breakdown).toHaveTextContent('request')
    expect(breakdown).toHaveTextContent('floor')
  })

  it('tracks the tonnage input', async () => {
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 50 })} pending={false} onSell={vi.fn()} />,
    )
    const input = screen.getByTestId('sell-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '10')
    // Entirely inside the premium request: 10 × 140.
    expect(screen.getByTestId('sell-proceeds')).toHaveTextContent('1400 cr')
  })

  it('clamps the tonnage to what is held', async () => {
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 20 })} pending={false} onSell={vi.fn()} />,
    )
    const input = screen.getByTestId('sell-tons-input')
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    expect(input).toHaveValue(20)
  })

  it('commits the kind, tonnage, and the quoted first-ton price as the guard', async () => {
    const onSell = vi.fn()
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 10 })} pending={false} onSell={onSell} />,
    )
    await userEvent.click(screen.getByTestId('sell-button'))
    // The guard is the price the player was SHOWN, so a move between quote and
    // commit is caught rather than silently absorbed.
    expect(onSell).toHaveBeenCalledWith('metals', 10, 140)
  })

  it('disables the control while a sale is in flight', () => {
    render(
      <SellSection quotes={quotes} roster={roster({ metals: 10 })} pending={true} onSell={vi.fn()} />,
    )
    // The double-submit guard: one click, one sale.
    expect(screen.getByTestId('sell-button')).toBeDisabled()
    expect(screen.getByTestId('sell-button')).toHaveTextContent('Selling…')
  })

  it('refuses a dust sale that would earn nothing', async () => {
    const onSell = vi.fn()
    render(
      <SellSection
        quotes={[{ kind: 'water', entries: [{ unitPrice: 2, source: 'floor', unlimited: true }] }]}
        roster={roster({ water: 0.4 })}
        pending={false}
        onSell={onSell}
      />,
    )
    expect(screen.getByTestId('sell-proceeds')).toHaveTextContent('0 cr')
    expect(screen.getByTestId('sell-button')).toBeDisabled()
    expect(screen.getByTestId('sell-dust-warning')).toBeInTheDocument()
  })

  it('explains an empty hold and an unbuyable hold differently', () => {
    const { rerender } = render(
      <SellSection quotes={quotes} roster={roster(null)} pending={false} onSell={vi.fn()} />,
    )
    expect(screen.getByTestId('sell-section-empty')).toHaveTextContent('hold is empty')

    rerender(
      <SellSection quotes={quotes} roster={roster({ exotic: 10 })} pending={false} onSell={vi.fn()} />,
    )
    expect(screen.getByTestId('sell-section-empty')).toHaveTextContent('does not buy anything')
  })

  it('shows both the old and new price after a re-price', () => {
    render(
      <SellSection
        quotes={quotes}
        roster={roster({ metals: 10 })}
        pending={false}
        onSell={vi.fn()}
        repricedFrom={200}
      />,
    )
    // A price-changed rejection after a long haul must not leave a stale,
    // un-committable offer — it re-prices and says what moved.
    const notice = screen.getByTestId('sell-repriced')
    expect(notice).toHaveTextContent('200')
    expect(notice).toHaveTextContent('140')
    // Announced, not conveyed by visual change alone.
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('sell-button')).toBeEnabled()
  })

  it('re-defaults the tonnage when the kind changes', async () => {
    render(
      <SellSection
        quotes={quotes}
        roster={roster({ metals: 40, water: 7 })}
        pending={false}
        onSell={vi.fn()}
      />,
    )
    expect(screen.getByTestId('sell-tons-input')).toHaveValue(40)
    await userEvent.click(screen.getByTestId('sell-kind-water'))
    expect(screen.getByTestId('sell-tons-input')).toHaveValue(7)
  })
})
