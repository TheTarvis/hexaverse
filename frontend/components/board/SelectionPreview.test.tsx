import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SelectionPreview } from './SelectionPreview'
import { planToHex } from './move-preview'

function renderInSvg(ui: React.ReactNode) {
  return render(<svg>{ui}</svg>)
}

describe('SelectionPreview', () => {
  it('draws a route polyline and a meet marker for a plan', () => {
    const plan = planToHex({ q: 0, r: 0 }, { q: 3, r: 0 }, 0)
    renderInSvg(<SelectionPreview plan={plan} />)
    const g = screen.getByTestId('selection-preview')
    expect(g.querySelector('polyline')).toBeTruthy()
    expect(g.querySelector('circle')).toBeTruthy()
  })

  it('renders nothing without a plan', () => {
    renderInSvg(<SelectionPreview plan={null} />)
    expect(screen.queryByTestId('selection-preview')).not.toBeInTheDocument()
  })
})
