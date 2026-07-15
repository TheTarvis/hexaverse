import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ArcScan } from './ArcScan'
import { hexToPixel } from '@/lib/hex/pixel'
import type { BoardFeature } from '@/lib/types/system-board'

// SVG leaves render inside an <svg> root.
function renderInSvg(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>)
}

const star: BoardFeature = {
  id: 'f-star',
  type: 'star',
  fixed: true,
  footprint: [{ q: 0, r: 0 }],
  band: 'visible',
  live: true,
}

function arcAt(worldTime: number, features: BoardFeature[] = []) {
  return renderInSvg(
    <ArcScan
      originHex={{ q: -2, r: 0 }}
      originPixel={hexToPixel(-2, 0)}
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
    expect(g.querySelectorAll('[data-testid="arc-scan-trail"] polygon').length).toBeGreaterThan(0)
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
    const open = arcAt(30_000)
    const openCount = open.container.querySelectorAll(
      '[data-testid="arc-scan-trail"] polygon',
    ).length
    open.unmount()

    const occluded = arcAt(30_000, [star])
    const occludedCount = occluded.container.querySelectorAll(
      '[data-testid="arc-scan-trail"] polygon',
    ).length
    expect(occludedCount).toBeLessThan(openCount)
  })
})
