import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SelectionPreview } from './SelectionPreview'
import { planToCell } from './move-preview'
import { productionSchedule } from '@/lib/board'

const S = productionSchedule()

function renderInSvg(ui: React.ReactNode) {
  return render(<svg>{ui}</svg>)
}

describe('SelectionPreview', () => {
  it('draws a route polyline and a meet marker for a plan', () => {
    const plan = planToCell({ ring: 0, slot: 0 }, { ring: 3, slot: 0 }, 0, S)
    renderInSvg(<SelectionPreview schedule={S} plan={plan} />)
    const g = screen.getByTestId('selection-preview')
    expect(g.querySelector('polyline')).toBeTruthy()
    expect(g.querySelector('circle')).toBeTruthy()
  })

  it('renders nothing without a plan', () => {
    renderInSvg(<SelectionPreview schedule={S} plan={null} />)
    expect(screen.queryByTestId('selection-preview')).not.toBeInTheDocument()
  })
})
