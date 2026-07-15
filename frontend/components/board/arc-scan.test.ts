import { describe, it, expect } from 'vitest'
import { hexKey } from '@/lib/hex'
import { angularLagDeg, sweepHeadingDeg, sweepTrail, ARC_TUNING } from './arc-scan'

// A window at the tuned 30s ScanDuration.
const COMMITTED = 1_000
const DURATION = 30_000
const ETA = COMMITTED + DURATION
const REV = DURATION / ARC_TUNING.revolutionsPerScan

describe('sweepHeadingDeg', () => {
  it('starts at 0 the instant the window opens and turns a full circle per revolution', () => {
    expect(sweepHeadingDeg(COMMITTED, ETA, COMMITTED)).toBe(0)
    expect(sweepHeadingDeg(COMMITTED, ETA, COMMITTED + REV / 4)).toBeCloseTo(90)
    expect(sweepHeadingDeg(COMMITTED, ETA, COMMITTED + REV)).toBeCloseTo(0)
  })

  it('completes exactly revolutionsPerScan whole turns at the window close', () => {
    expect(sweepHeadingDeg(COMMITTED, ETA, ETA)).toBeCloseTo(0)
  })

  it('stays in [0, 360) even when the clock reads before the window', () => {
    expect(sweepHeadingDeg(COMMITTED, ETA, COMMITTED - REV / 4)).toBeCloseTo(270)
  })

  it('holds still on a degenerate window instead of dividing by zero', () => {
    expect(sweepHeadingDeg(COMMITTED, COMMITTED, COMMITTED + 500)).toBe(0)
  })
})

describe('angularLagDeg', () => {
  it('measures how far behind the head an angle sits, wrapping the circle', () => {
    expect(angularLagDeg(90, 90)).toBe(0)
    expect(angularLagDeg(90, 30)).toBe(60)
    // Ahead of the head = almost a full turn behind.
    expect(angularLagDeg(90, 100)).toBe(350)
    // Wrap: head just past 0, cell at 350° was swept 10° ago.
    expect(angularLagDeg(0, -10)).toBe(10)
  })
})

describe('sweepTrail', () => {
  const origin = { q: 0, r: 0 }

  it('glows the cell at the beam head fully and fades with lag', () => {
    // Heading 0 = +x; the cell (1,0) sits due +x of the origin.
    const trail = sweepTrail(origin, 2, 0, new Set())
    const atHead = trail.find((t) => t.hex.q === 1 && t.hex.r === 0)
    expect(atHead).toBeDefined()
    expect(atHead!.glow).toBeCloseTo(1)

    // (1,-1) sits at −60° (i.e. 300°): swept 60° ago, glow decayed linearly.
    const behind = trail.find((t) => t.hex.q === 1 && t.hex.r === -1)
    expect(behind).toBeDefined()
    expect(behind!.glow).toBeCloseTo(1 - 60 / ARC_TUNING.trailDeg)
  })

  it('leaves cells outside the trailing window dark', () => {
    const trail = sweepTrail(origin, 2, 0, new Set())
    // (-1,0) sits at 180° — half a turn behind, far outside the window.
    expect(trail.find((t) => t.hex.q === -1 && t.hex.r === 0)).toBeUndefined()
  })

  it('never reads beyond the reach clamp', () => {
    const trail = sweepTrail(origin, 3, 0, new Set(), 1)
    expect(trail.find((t) => t.hex.q === 1 && t.hex.r === 0)).toBeDefined()
    expect(trail.find((t) => t.hex.q === 2 && t.hex.r === 0)).toBeUndefined()
  })

  it('never lights a shadowed cell or the antenna cell itself', () => {
    const shadowed = new Set([hexKey({ q: 1, r: 0 })])
    const trail = sweepTrail(origin, 2, 0, shadowed)
    expect(trail.find((t) => t.hex.q === 1 && t.hex.r === 0)).toBeUndefined()
    expect(trail.find((t) => t.hex.q === 0 && t.hex.r === 0)).toBeUndefined()
  })
})
