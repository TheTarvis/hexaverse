import { describe, expect, it } from 'vitest'
import { ringHexes, ringOf } from '@/lib/hex'
import { axialDistance, bodyPoint, buildSpikeBoard } from './mock-board'

describe('buildSpikeBoard', () => {
  it('is deterministic for a seed, so both renderers get identical content', () => {
    const a = buildSpikeBoard(1234, 'star_rich', 12)
    const b = buildSpikeBoard(1234, 'star_rich', 12)
    expect(b.bodies.map((x) => x.id)).toEqual(a.bodies.map((x) => x.id))
    expect(b.bodies.map((x) => x.band)).toEqual(a.bodies.map((x) => x.band))
    expect(b.fleet).toEqual(a.fleet)
  })

  it('always keeps the star live — it is the scene light, never fogged out', () => {
    const board = buildSpikeBoard(99, 'normal', 12)
    const star = board.bodies.find((x) => x.type === 'star')
    expect(star).toBeDefined()
    expect(star!.band).toBe('visible')
    expect(star!.ring).toBe(0)
  })

  it('puts every body inside the sensor bubble on the live band', () => {
    const board = buildSpikeBoard(7, 'star_rich', 14)
    let checked = 0
    for (const b of board.bodies) {
      // angle0 is the body's index on its own ring at the epoch, so this
      // recovers the hex the generator actually placed it on.
      const hex = ringHexes(b.ring)[b.angle0]!
      if (axialDistance(hex, board.fleet.hex) <= board.sensorRadius) {
        expect(b.band).toBe('visible')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('shows all three fog bands at once, which is the point of the demo', () => {
    const bands = new Set(buildSpikeBoard(0x51a2c0de, 'star_rich', 16).bodies.map((b) => b.band))
    expect(bands.has('visible')).toBe(true)
    expect(bands.has('remembered')).toBe(true)
    expect(bands.has('astronomical')).toBe(true)
  })

  it('gives outer bodies longer periods than inner ones (Kepler, near enough)', () => {
    const board = buildSpikeBoard(42, 'star_rich', 16)
    const orbiting = board.bodies.filter((b) => b.ring > 0).sort((a, b) => a.ring - b.ring)
    for (let i = 1; i < orbiting.length; i++) {
      if (orbiting[i]!.ring > orbiting[i - 1]!.ring) {
        expect(orbiting[i]!.period).toBeGreaterThan(orbiting[i - 1]!.period)
      }
    }
  })
})

describe('bodyPoint', () => {
  const board = buildSpikeBoard(5, 'star_rich', 12)

  it('pins a ring-0 body at the origin for all time', () => {
    const star = board.bodies.find((b) => b.ring === 0)!
    expect(bodyPoint(star, 0)).toEqual({ x: 0, y: 0 })
    expect(bodyPoint(star, 987_654)).toEqual({ x: 0, y: 0 })
  })

  it('keeps an orbiting body on its own ring as it travels', () => {
    const body = board.bodies.find((b) => b.ring >= 3 && b.type !== 'belt')!
    // A ring's hexes are not equidistant from the centre (it is a hexagon, not a
    // circle), so assert the radius stays within the ring's own min/max band.
    const inner = body.ring * 1.5 * 34 - 1
    const outer = body.ring * Math.sqrt(3) * 34 + 1
    for (let i = 0; i < 40; i++) {
      const p = bodyPoint(body, (body.period * i) / 40)
      const r = Math.hypot(p.x, p.y)
      expect(r).toBeGreaterThanOrEqual(inner)
      expect(r).toBeLessThanOrEqual(outer)
    }
  })

  it('returns to its starting point after exactly one period', () => {
    const body = board.bodies.find((b) => b.ring >= 2 && b.type !== 'belt')!
    const start = bodyPoint(body, 0)
    const round = bodyPoint(body, body.period)
    expect(round.x).toBeCloseTo(start.x, 6)
    expect(round.y).toBeCloseTo(start.y, 6)
  })
})

describe('axialDistance', () => {
  it('agrees with lib/hex ringOf when measured from the centre', () => {
    for (const h of [
      { q: 0, r: 0 },
      { q: 3, r: -1 },
      { q: -2, r: 5 },
      { q: 4, r: 4 },
    ]) {
      expect(axialDistance(h, { q: 0, r: 0 })).toBe(ringOf(h))
    }
  })

  it('is symmetric', () => {
    const a = { q: 2, r: -3 }
    const b = { q: -1, r: 4 }
    expect(axialDistance(a, b)).toBe(axialDistance(b, a))
  })
})
