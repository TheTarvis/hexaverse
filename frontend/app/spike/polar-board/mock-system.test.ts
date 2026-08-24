import { describe, it, expect } from 'vitest'
import { DEFAULT_SCHEDULE, orbCellAt, slotsForRing } from './polar'
import { buildMockPolarSystem, periodForRing } from './mock-system'

describe('polar bench fixture', () => {
  it('is deterministic for a seed and varies with it', () => {
    expect(buildMockPolarSystem(7)).toEqual(buildMockPolarSystem(7))
    expect(buildMockPolarSystem(7)).not.toEqual(buildMockPolarSystem(8))
  })

  it('seats every body on a legal slot for its ring', () => {
    const sys = buildMockPolarSystem(0x51a2c0de, 16)
    for (const body of sys.bodies) {
      const cell = orbCellAt(body.orbit, 12_345, DEFAULT_SCHEDULE)
      expect(cell.ring).toBe(body.orbit.ring)
      expect(cell.slot).toBeGreaterThanOrEqual(0)
      expect(cell.slot).toBeLessThan(slotsForRing(body.orbit.ring, DEFAULT_SCHEDULE))
    }
  })

  it('puts exactly one star at the core and keeps everything else off it', () => {
    const sys = buildMockPolarSystem(0x51a2c0de, 16)
    const cores = sys.bodies.filter((b) => b.orbit.ring === 0)
    expect(cores).toHaveLength(1)
    expect(cores[0].kind).toBe('star')
  })

  it('stays inside the board radius', () => {
    const sys = buildMockPolarSystem(0x51a2c0de, 10)
    for (const body of sys.bodies) expect(body.orbit.ring).toBeLessThanOrEqual(10)
  })

  it('runs inner orbits faster than outer ones (Kepler, near enough)', () => {
    // The property a uniform cube ring walk cannot express: every hex ring
    // advances one cell per step regardless of radius.
    expect(periodForRing(2)).toBeLessThan(periodForRing(9))
    expect(periodForRing(0)).toBe(0)
  })

  it('lays a belt across one ring, which is the shape a belt always wanted', () => {
    const sys = buildMockPolarSystem(0x51a2c0de, 16)
    const belt = sys.bodies.filter((b) => b.kind === 'belt')
    expect(belt.length).toBeGreaterThan(8)
    expect(new Set(belt.map((b) => b.orbit.ring)).size).toBe(1)
    // Spread around the ring, not clumped.
    expect(new Set(belt.map((b) => b.orbit.angle0)).size).toBeGreaterThan(8)
  })
})
