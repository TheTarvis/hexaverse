import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HexBoard } from './HexBoard'

describe('HexBoard', () => {
  it('renders an svg viewport hosting the lattice and any child layers', () => {
    render(
      <HexBoard radius={2}>
        <g data-testid="scene-layer" />
      </HexBoard>,
    )
    expect(screen.getByTestId('hex-board')).toHaveAttribute('viewBox')
    expect(screen.getByTestId('hex-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('scene-layer')).toBeInTheDocument()
  })

  it('forwards tile clicks and highlights the controlled selection', () => {
    const onSelectHex = vi.fn()
    render(<HexBoard radius={1} selectedHex={{ q: 0, r: 0 }} onSelectHex={onSelectHex} />)
    expect(screen.getByTestId('hex-tile-0,0')).toHaveAttribute('stroke', '#ffffff')
    fireEvent.click(screen.getByTestId('hex-tile-1,0'))
    expect(onSelectHex).toHaveBeenCalledWith({ q: 1, r: 0 })
  })

  it('deselects on a background click but not on a tile click', () => {
    const onSelectEmpty = vi.fn()
    render(<HexBoard radius={1} onSelectEmpty={onSelectEmpty} />)

    fireEvent.click(screen.getByTestId('hex-board'))
    expect(onSelectEmpty).toHaveBeenCalledTimes(1)

    // A tile stops propagation, so it never reaches click-empty-to-deselect.
    onSelectEmpty.mockClear()
    fireEvent.click(screen.getByTestId('hex-tile-0,0'))
    expect(onSelectEmpty).not.toHaveBeenCalled()
  })
})
