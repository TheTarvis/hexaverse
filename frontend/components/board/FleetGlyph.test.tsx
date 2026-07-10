import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FleetGlyph } from './FleetGlyph'
import type { Fleet } from '@/lib/types/fleet'

function renderInSvg(ui: ReactNode) {
  return render(<svg>{ui}</svg>)
}

const fleet = (over: Partial<Fleet>): Fleet => ({
  id: 'fl1',
  corporationId: 'corp-user1',
  systemId: 's',
  state: { mode: 'coast' },
  position: { q: 0, r: 0 },
  own: true,
  worldTime: 0,
  ...over,
})

describe('FleetGlyph', () => {
  it('draws an own fleet with a hull and reports clicks', () => {
    const onSelect = vi.fn()
    renderInSvg(<FleetGlyph fleet={fleet({})} point={{ x: 5, y: 5 }} onSelect={onSelect} />)
    const g = screen.getByTestId('fleet-glyph-fl1')
    expect(g).toHaveAttribute('data-own', 'true')
    expect(g.querySelector('path')).toBeTruthy() // hull
    fireEvent.click(g)
    expect(onSelect).toHaveBeenCalledWith('fl1')
  })

  it('draws a foreign fleet as a bare snapshot marker (no hull)', () => {
    renderInSvg(<FleetGlyph fleet={fleet({ id: 'fx', own: false })} point={{ x: 0, y: 0 }} />)
    const g = screen.getByTestId('fleet-glyph-fx')
    expect(g).toHaveAttribute('data-own', 'false')
    expect(g.querySelector('path')).toBeNull()
    expect(g.querySelector('rect')).toBeTruthy()
  })
})
