import { describe, it, expect } from 'vitest'
import { ORBIT_BASE_PERIOD, orbitPeriod } from './tuning'

// The real cross-seam pin lives in fixtures.test.ts: the golden's stateAt cases
// record the folded coast's period, so a backend OrbitBasePeriod retune breaks
// there until ORBIT_BASE_PERIOD follows. These cases just pin the law's shape.

describe('orbitPeriod — the world orbital law (Go: GameTuning.OrbitPeriod)', () => {
  it('scales linearly with ring: one revolution on ring N takes base × N', () => {
    expect(orbitPeriod(1)).toBe(ORBIT_BASE_PERIOD)
    expect(orbitPeriod(6)).toBe(ORBIT_BASE_PERIOD * 6)
  })

  it('uniform apparent speed: a hex is crossed every base/6 on every ring', () => {
    // period / cells = (base × N) / (6 × N) — the ring factor cancels.
    for (const ring of [1, 4, 16]) {
      expect(orbitPeriod(ring) / (6 * ring)).toBe(ORBIT_BASE_PERIOD / 6)
    }
  })

  it('has no period at the star (ring 0) or inside it', () => {
    expect(orbitPeriod(0)).toBe(0)
    expect(orbitPeriod(-1)).toBe(0)
  })
})
