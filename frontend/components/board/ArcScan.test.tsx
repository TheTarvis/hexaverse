import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ArcScan } from './ArcScan'
import { cellToPoint } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import { productionSchedule } from '@/lib/board'

const S = productionSchedule()

// SVG leaves render inside an <svg> root.
function renderInSvg(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>)
}

const star: BoardFeature = {
  id: 'f-star',
  type: 'star',
  fixed: true,
  footprint: [{ ring: 0, slot: 0 }],
  band: 'visible',
  live: true,
}

function arcAt(worldTime: number, features: BoardFeature[] = []) {
  return renderInSvg(
    <ArcScan schedule={S}
      originCell={{ ring: 2, slot: 0 }}
      originPixel={cellToPoint({ ring: 2, slot: 0 }, S)}
      features={features}
      rimRing={3}
      committedAt={0}
      eta={30_000}
      worldTime={worldTime}
    />,
  )
}

describe('ArcScan', () => {
  it('draws the beam and the trailing glow cells', () => {
    const { container } = arcAt(0)
    const g = container.querySelector('[data-testid="arc-scan"]')!
    expect(g).toBeTruthy()
    expect(g.querySelector('[data-testid="arc-scan-beam"]')).toBeTruthy()
    expect(g.querySelectorAll('[data-testid="arc-scan-trail"] path').length).toBeGreaterThan(0)
  })

  it('turns with worldTime — the beam head moves between frames', () => {
    const beamX2 = (worldTime: number) => {
      const { container, unmount } = arcAt(worldTime)
      const x2 = container.querySelector('[data-testid="arc-scan-beam"]')!.getAttribute('x2')
      unmount()
      return x2
    }
    expect(beamX2(0)).not.toEqual(beamX2(1_250))
  })

  it('keeps occluded cells dark — a star between antenna and rim shrinks the trail', () => {
    // The beam turns twice over the 30s window, so t=7500 puts the head at
    // 180° — pointing straight across the core, which is the only heading at
    // which the star's shadow is inside the trail window at all.
    const open = arcAt(7_500)
    const openCount = open.container.querySelectorAll(
      '[data-testid="arc-scan-trail"] path',
    ).length
    open.unmount()

    const occluded = arcAt(7_500, [star])
    const occludedCount = occluded.container.querySelectorAll(
      '[data-testid="arc-scan-trail"] path',
    ).length
    expect(occludedCount).toBeLessThan(openCount)
  })
})
