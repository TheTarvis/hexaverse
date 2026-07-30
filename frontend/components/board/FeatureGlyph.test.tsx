import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FeatureGlyph } from './FeatureGlyph'
import type { BoardFeature } from '@/lib/types/system-board'

function renderInSvg(ui: ReactNode) {
  return render(<svg>{ui}</svg>)
}

const feature = (over: Partial<BoardFeature>): BoardFeature => ({
  id: 'f1',
  type: 'rocky',
  footprint: [{ q: 2, r: 0 }],
  band: 'visible',
  live: true,
  ...over,
})

describe('FeatureGlyph', () => {
  it('renders at the given point and reports clicks', () => {
    const onSelect = vi.fn()
    renderInSvg(<FeatureGlyph feature={feature({})} point={{ x: 10, y: 20 }} onSelect={onSelect} />)
    const g = screen.getByTestId('feature-glyph-f1')
    expect(g).toHaveAttribute('transform', 'translate(10.00, 20.00)')
    fireEvent.click(g)
    expect(onSelect).toHaveBeenCalledWith('f1')
  })

  it('dims a remembered body and ghosts it; a live body is neither', () => {
    const { rerender } = renderInSvg(
      <FeatureGlyph feature={feature({ band: 'remembered' })} point={{ x: 0, y: 0 }} />,
    )
    const remembered = screen.getByTestId('feature-glyph-f1')
    expect(Number(remembered.getAttribute('opacity'))).toBeLessThan(1)
    expect(remembered.querySelector('[stroke-dasharray]')).toBeTruthy()

    rerender(<svg><FeatureGlyph feature={feature({ band: 'visible' })} point={{ x: 0, y: 0 }} /></svg>)
    const live = screen.getByTestId('feature-glyph-f1')
    expect(live.getAttribute('opacity')).toBe('1')
  })

  // add-mine-ui: the slice e2e picks its lode off the rendered board, so a
  // glyph advertises whether its feature carries visible resources.
  it('marks a resource-bearing body data-mineable; a bare one is not', () => {
    const { rerender } = renderInSvg(
      <FeatureGlyph
        feature={feature({ resources: [{ kind: 'metals', richness: 0.5 }] })}
        point={{ x: 0, y: 0 }}
      />,
    )
    expect(screen.getByTestId('feature-glyph-f1')).toHaveAttribute('data-mineable', 'true')

    rerender(<svg><FeatureGlyph feature={feature({})} point={{ x: 0, y: 0 }} /></svg>)
    expect(screen.getByTestId('feature-glyph-f1')).not.toHaveAttribute('data-mineable')
  })
})
