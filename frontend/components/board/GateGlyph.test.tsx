import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GateGlyph } from './GateGlyph'

function renderGate(onSelect?: (id: string) => void, selected = false) {
  return render(
    <svg>
      <GateGlyph
        destSystemId="sys-9"
        point={{ x: 40, y: 0 }}
        selected={selected}
        {...(onSelect ? { onSelect } : {})}
      />
    </svg>,
  )
}

describe('GateGlyph', () => {
  it('renders a testid-tagged gate and reports clicks with its destination', () => {
    const onSelect = vi.fn()
    renderGate(onSelect)
    const gate = screen.getByTestId('gate-glyph-sys-9')
    expect(gate).toBeInTheDocument()
    fireEvent.click(gate)
    expect(onSelect).toHaveBeenCalledWith('sys-9')
  })

  it('adds a selection ring circle when selected', () => {
    const circleCount = (root: ParentNode) => root.querySelectorAll('circle').length
    const { container: unselected } = renderGate(undefined, false)
    const { container: selected } = renderGate(undefined, true)
    // Selecting adds exactly the outer selection ring circle.
    expect(circleCount(selected)).toBe(circleCount(unselected) + 1)
  })
})
