import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HexBoard } from './HexBoard'

describe('HexBoard', () => {
  it('renders an svg viewport hosting the lattice', () => {
    render(<HexBoard radius={2} />)
    expect(screen.getByTestId('hex-board')).toBeInTheDocument()
    expect(screen.getByTestId('hex-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('hex-board')).toHaveAttribute('viewBox')
  })

  it('toggles selection when the same tile is clicked twice', () => {
    render(<HexBoard radius={1} />)
    const tileId = 'hex-tile-0,0'
    fireEvent.click(screen.getByTestId(tileId))
    expect(screen.getByTestId(tileId)).toHaveAttribute('stroke', '#ffffff') // selected
    fireEvent.click(screen.getByTestId(tileId))
    expect(screen.getByTestId(tileId)).not.toHaveAttribute('stroke', '#ffffff') // deselected
  })

  it('moves the selection to a different clicked tile', () => {
    render(<HexBoard radius={1} />)
    fireEvent.click(screen.getByTestId('hex-tile-0,0'))
    fireEvent.click(screen.getByTestId('hex-tile-1,0'))
    expect(screen.getByTestId('hex-tile-1,0')).toHaveAttribute('stroke', '#ffffff')
    expect(screen.getByTestId('hex-tile-0,0')).not.toHaveAttribute('stroke', '#ffffff')
  })
})
