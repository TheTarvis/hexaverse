import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ScanPing } from './ScanPing'
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

// A body one hex from the core, in the antenna's line of sight.
const nearBody: BoardFeature = {
  id: 'f-rock',
  type: 'rocky',
  footprint: [{ ring: 1, slot: 0 }],
  band: 'astronomical',
  live: false,
}

function pingAt(worldTime: number, features: BoardFeature[] = []) {
  return renderInSvg(
    <ScanPing schedule={S}
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

describe('ScanPing', () => {
  it('draws ONE pulse ring — no second flash ring competing with it (#0006 Decision #26)', () => {
    const { container } = pingAt(15_000)
    const g = container.querySelector('[data-testid="scan-ping"]')!
    expect(g.querySelector('[data-testid="scan-ping-pulse"]')).toBeTruthy()
    expect(g.querySelector('[data-testid="scan-ping-flash"]')).toBeNull()
    expect(g.querySelector('[data-testid="scan-echo-region"]')).toBeNull()
  })

  it('grows the pulse ring with worldTime from its pinned origin — ScanDuration is the rim round-trip', () => {
    const pulse = (worldTime: number) => {
      const { container, unmount } = pingAt(worldTime)
      const el = container.querySelector('[data-testid="scan-ping-pulse"]')!
      const attrs = {
        r: Number(el.getAttribute('r')),
        cx: Number(el.getAttribute('cx')),
        cy: Number(el.getAttribute('cy')),
      }
      unmount()
      return attrs
    }
    expect(pulse(0).r).toBe(0)
    expect(pulse(15_000).r).toBeGreaterThan(0)
    expect(pulse(30_000).r).toBeCloseTo(pulse(15_000).r * 2, 1)
    // The centre never moves: it is the emission pixel, all window long.
    const emission = cellToPoint({ ring: 2, slot: 0 }, S)
    for (const t of [0, 15_000, 30_000]) {
      expect(pulse(t).cx).toBeCloseTo(emission.x, 1)
      expect(pulse(t).cy).toBeCloseTo(emission.y, 1)
    }
  })

  it('blips a body the instant its echo arrives — the returns are staggered by distance', () => {
    // The body sits 1 hex out; its echo lands at 1/3 of the window (rim 3).
    // Before: a quiet board. Just after: a blip.
    const before = pingAt(5_000, [nearBody])
    expect(
      before.container.querySelectorAll('[data-testid="scan-echo-returns"] > g'),
    ).toHaveLength(0)
    before.unmount()

    const after = pingAt(10_500, [nearBody])
    expect(
      after.container.querySelectorAll('[data-testid="scan-echo-returns"] > g'),
    ).toHaveLength(1)
  })

  it('never blips a body in shadow — echoes don’t come back from behind a planet', () => {
    // The star at the core sits between the antenna at (-2,0) and (2,0).
    const hidden: BoardFeature = {
      id: 'f-hidden',
      type: 'rocky',
      footprint: [{ ring: 2, slot: 0 }],
      band: 'astronomical',
      live: false,
    }
    const { container } = pingAt(30_000, [star, hidden])
    const returns = container.querySelectorAll('[data-testid="scan-echo-returns"] > g')
    // The star itself returns (first body on the line); the hidden one never does.
    expect(returns).toHaveLength(1)
  })
})
