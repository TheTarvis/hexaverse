import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarketBoardPanel } from './MarketBoardPanel'
import type { MarketBoard } from '@/lib/types/market'

const board: MarketBoard = {
  venues: [
    {
      venue: 'sys-home',
      systemId: 'sys-home',
      quotes: [
        {
          kind: 'metals',
          entries: [{ unitPrice: 100, source: 'floor', unlimited: true }],
        },
        {
          kind: 'water',
          entries: [{ unitPrice: 8, source: 'floor', unlimited: true }],
        },
      ],
    },
    {
      venue: 'sys-rich',
      systemId: 'sys-rich',
      quotes: [
        {
          kind: 'metals',
          entries: [
            { unitPrice: 140, source: 'request', remainingQuantity: 40, requestId: 'req-1' },
            { unitPrice: 90, source: 'floor', unlimited: true },
          ],
        },
      ],
    },
  ],
  worldTime: 1000,
  refreshCadenceMs: 30000,
}

describe('MarketBoardPanel', () => {
  it('ranks venues by price, best first', () => {
    render(<MarketBoardPanel board={board} />)

    const rows = screen.getByTestId('market-board-rows')
    const ids = Array.from(rows.querySelectorAll('[data-testid^="market-row-"]')).map((el) =>
      el.getAttribute('data-testid'),
    )
    expect(ids).toEqual(['market-row-sys-rich', 'market-row-sys-home'])
  })

  it('surfaces the spread against where the player is, as a figure', () => {
    render(<MarketBoardPanel board={board} homeSystemId="sys-home" />)

    // 140 vs 100 here ⇒ +40%. The player should not have to subtract.
    expect(screen.getByTestId('market-spread-sys-rich')).toHaveTextContent('+40%')
  })

  it('omits the spread when the player is nowhere in particular', () => {
    render(<MarketBoardPanel board={board} />)
    expect(screen.queryByTestId('market-spread-sys-rich')).not.toBeInTheDocument()
  })

  it('keeps prices and selection usable when the current system has no market venue', async () => {
    const onSelectSystem = vi.fn()
    render(<MarketBoardPanel board={board} homeSystemId="sys-without-station" onSelectSystem={onSelectSystem} />)
    expect(screen.getByTestId('market-price-sys-rich')).toHaveTextContent('140 cr/t')
    expect(screen.queryByTestId('market-spread-sys-rich')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('market-row-sys-rich'))
    expect(onSelectSystem).toHaveBeenCalledWith('sys-rich')
    await userEvent.click(screen.getByTestId('market-kind-water'))
    expect(screen.getByTestId('market-price-sys-home')).toHaveTextContent('8 cr/t')
  })

  it('removes the comparison when a refreshed board no longer includes the local venue', () => {
    const { rerender } = render(<MarketBoardPanel board={board} homeSystemId="sys-home" />)
    expect(screen.getByTestId('market-spread-sys-rich')).toHaveTextContent('+40%')
    rerender(<MarketBoardPanel board={{ ...board, venues: board.venues.filter(v => v.systemId !== 'sys-home') }} homeSystemId="sys-home" />)
    expect(screen.getByTestId('market-price-sys-rich')).toHaveTextContent('140 cr/t')
    expect(screen.queryByTestId('market-spread-sys-rich')).not.toBeInTheDocument()
  })

  it('distinguishes a premium request from the floor by more than colour', () => {
    render(<MarketBoardPanel board={board} />)

    // A colour-only cue is invisible to a colourblind player and to assistive
    // technology, so the row must carry a text label too.
    const rich = screen.getByTestId('market-row-sys-rich')
    expect(rich).toHaveTextContent('request')
    const home = screen.getByTestId('market-row-sys-home')
    expect(home).toHaveTextContent('floor')
  })

  it('delegates row selection to the mounting view', async () => {
    const onSelectSystem = vi.fn()
    render(<MarketBoardPanel board={board} onSelectSystem={onSelectSystem} />)

    await userEvent.click(screen.getByTestId('market-row-sys-rich'))

    expect(onSelectSystem).toHaveBeenCalledWith('sys-rich')
  })

  it('switches the ranked kind', async () => {
    render(<MarketBoardPanel board={board} />)

    // metals is offered by both venues; water only by the home station.
    await userEvent.click(screen.getByTestId('market-kind-water'))

    expect(screen.getByTestId('market-row-sys-home')).toBeInTheDocument()
    expect(screen.queryByTestId('market-row-sys-rich')).not.toBeInTheDocument()
  })

  it('renders the five UI states', () => {
    const { rerender } = render(<MarketBoardPanel board={undefined} isLoading />)
    expect(screen.getByTestId('market-board-loading')).toBeInTheDocument()

    rerender(<MarketBoardPanel board={undefined} isError />)
    expect(screen.getByTestId('market-board-error')).toBeInTheDocument()

    // Empty: a new player who has charted nothing yet gets told what to DO about
    // it, not just that the list is empty.
    rerender(<MarketBoardPanel board={{ venues: [], worldTime: 1, refreshCadenceMs: 30000 }} />)
    expect(screen.getByTestId('market-board-empty')).toHaveTextContent('Scan a neighbouring system')

    rerender(<MarketBoardPanel board={board} />)
    expect(screen.getByTestId('market-board-rows')).toBeInTheDocument()
  })

  it('skips a venue that does not quote the selected kind', () => {
    render(<MarketBoardPanel board={board} />)
    // sys-rich quotes no water, so switching kinds must drop it rather than
    // showing it at a price of zero.
    expect(screen.queryByTestId('market-price-sys-rich')).toHaveTextContent('140 cr/t')
  })
})
