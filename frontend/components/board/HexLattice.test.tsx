import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { HexLattice } from './HexLattice'

// SVG children must live inside an <svg>; wrap so jsdom builds them as SVG nodes.
function renderInSvg(ui: ReactNode) {
  return render(<svg>{ui}</svg>)
}

describe('HexLattice', () => {
  it('draws one polygon per tile within the radius', () => {
    renderInSvg(<HexLattice radius={1} />)
    const lattice = screen.getByTestId('hex-lattice')
    expect(lattice).toBeInTheDocument()
    // radius 1 → centred hexagonal number = 7
    expect(lattice.querySelectorAll('polygon')).toHaveLength(7)
    expect(screen.getByTestId('hex-tile-0,0')).toBeInTheDocument()
  })

  it('reports the clicked hex', () => {
    const onSelectHex = vi.fn()
    renderInSvg(<HexLattice radius={1} onSelectHex={onSelectHex} />)
    fireEvent.click(screen.getByTestId('hex-tile-1,0'))
    expect(onSelectHex).toHaveBeenCalledWith({ q: 1, r: 0 })
  })

  it('outlines the selected hex in white', () => {
    renderInSvg(<HexLattice radius={1} selectedHex={{ q: 0, r: 0 }} />)
    expect(screen.getByTestId('hex-tile-0,0')).toHaveAttribute('stroke', '#ffffff')
    // a non-selected tile keeps its band-tinted stroke
    expect(screen.getByTestId('hex-tile-1,0')).not.toHaveAttribute('stroke', '#ffffff')
  })
})
