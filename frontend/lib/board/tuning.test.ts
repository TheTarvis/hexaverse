import { describe, expect, it } from 'vitest'
import { ORBIT_BASE_PERIOD, orbitPeriod } from './tuning'

describe('orbitPeriod', () => {
  it('is the linear orbital law: base × ring, 0 at the core', () => {
    expect(orbitPeriod(0)).toBe(0)
    expect(orbitPeriod(-2)).toBe(0)
    expect(orbitPeriod(1)).toBe(ORBIT_BASE_PERIOD)
    expect(orbitPeriod(12)).toBe(ORBIT_BASE_PERIOD * 12)
  })
})
