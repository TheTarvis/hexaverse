import { describe, it, expect } from 'vitest'
import { laneGateHex, gateRing } from './gate'
import { ringOf } from './hex'

// Determinism against the Go side is covered by fixtures.test.ts (the golden
// contract). These are focused unit checks of the projection's shape.
describe('laneGateHex', () => {
  it('places the gate on the gate ring (inner edge of the outer band)', () => {
    expect(gateRing(16)).toBe(13)
    for (const [nx, ny] of [
      [100, 0],
      [0, 100],
      [-100, 0],
      [0, -100],
      [70, 70],
    ]) {
      const gate = laneGateHex(0, 0, nx, ny, 16)
      expect(ringOf(gate)).toBe(gateRing(16))
    }
  })

  it('clamps the gate ring on small boards', () => {
    expect(gateRing(6)).toBe(3)
    expect(gateRing(4)).toBe(1)
    expect(gateRing(1)).toBe(1)
  })

  it('points a due-east neighbour at the +q side of the gate ring', () => {
    const gate = laneGateHex(0, 0, 100, 0, 16)
    // East ≈ the +q rim; the gate should be the far-east tile, q dominant.
    expect(gate.q).toBeGreaterThan(0)
    expect(Math.abs(gate.q)).toBeGreaterThanOrEqual(Math.abs(gate.r))
  })

  it('is translation-invariant (only the bearing matters)', () => {
    const a = laneGateHex(0, 0, 50, 20, 16)
    const b = laneGateHex(10, -5, 60, 15, 16) // same relative bearing
    expect(a).toEqual(b)
  })

  it('degenerates to the core for radius <= 0', () => {
    expect(laneGateHex(0, 0, 100, 0, 0)).toEqual({ q: 0, r: 0 })
  })
})
