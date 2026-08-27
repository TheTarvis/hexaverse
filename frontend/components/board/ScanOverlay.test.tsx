import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ScanOverlay } from './ScanOverlay'
import type { ScanPlan } from './scan-preview'
import { productionSchedule } from '@/lib/board'

const S = productionSchedule()

const plan: ScanPlan = {
  origin: { ring: 2, slot: 0 },
  shadowed: [
    { ring: 1, slot: 0 },
    { ring: 2, slot: 0 },
  ],
}

// SVG leaves render inside an <svg> root.
function renderInSvg(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>)
}

describe('ScanOverlay', () => {
  it('marks the sweep origin and hatches the shadowed cells', () => {
    const { container } = renderInSvg(<ScanOverlay schedule={S} plan={plan} variant="aim" />)
    const g = container.querySelector('[data-testid="scan-overlay-aim"]')!
    expect(g).toBeTruthy()
    // The sensor-origin rings…
    expect(g.querySelectorAll('circle')).toHaveLength(2)
    // …and one dashed wedge path per shadowed cell.
    const polys = g.querySelectorAll('path')
    expect(polys).toHaveLength(2)
    for (const p of polys) {
      expect(p.getAttribute('stroke-dasharray')).toBeTruthy()
    }
  })

  it('uses the active testid for a running scan', () => {
    const { container } = renderInSvg(<ScanOverlay schedule={S} plan={plan} variant="active" />)
    expect(container.querySelector('[data-testid="scan-overlay-active"]')).toBeTruthy()
  })

  it('suppresses the origin rings when the animated sweep owns the pivot', () => {
    const { container } = renderInSvg(<ScanOverlay schedule={S} plan={plan} variant="active" hideOrigin />)
    const g = container.querySelector('[data-testid="scan-overlay-active"]')!
    expect(g.querySelectorAll('circle')).toHaveLength(0)
    // The committed shadow hatching still draws.
    expect(g.querySelectorAll('path')).toHaveLength(2)
  })

  it('renders nothing without a plan', () => {
    const { container } = renderInSvg(<ScanOverlay schedule={S} plan={null} variant="aim" />)
    expect(container.querySelector('g')).toBeNull()
  })
})
