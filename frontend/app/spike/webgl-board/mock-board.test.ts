import { describe, expect, it } from 'vitest'
import { buildMockSystemBoard, DEMO_SENSOR_RINGS, ringDistance } from './mock-board'

describe('buildMockSystemBoard', () => {
  it('is deterministic for a seed', () => {
    const a = buildMockSystemBoard(1234, 'star_rich', 12)
    const b = buildMockSystemBoard(1234, 'star_rich', 12)
    expect(b.board.features.map((x) => x.id)).toEqual(a.board.features.map((x) => x.id))
    expect(b.board.features.map((x) => x.band)).toEqual(a.board.features.map((x) => x.band))
    expect(b.fleets).toEqual(a.fleets)
  })

  it('always keeps the star live — it is the scene light, never fogged out', () => {
    const { board } = buildMockSystemBoard(99, 'normal', 12)
    const star = board.features.find((x) => x.type === 'star')
    expect(star).toBeDefined()
    expect(star!.band).toBe('visible')
    expect(star!.fixed).toBe(true)
  })

  it('puts every body inside the demo sensor bubble on the live band', () => {
    const { board, fleets } = buildMockSystemBoard(7, 'star_rich', 14)
    const home = fleets[0]!.position
    let checked = 0
    for (const f of board.features) {
      if (!f.orbit) continue
      if (ringDistance({ ring: f.orbit.ring, slot: f.orbit.angle0 }, home) <= DEMO_SENSOR_RINGS) {
        expect(f.band).toBe('visible')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('shows all three fog bands at once, which is the point of the bench', () => {
    const bands = new Set(buildMockSystemBoard(0x51a2c0de, 'star_rich', 16).board.features.map((f) => f.band))
    expect(bands.has('visible')).toBe(true)
    expect(bands.has('remembered')).toBe(true)
    expect(bands.has('astronomical')).toBe(true)
  })

  it('gives outer bodies longer periods than inner ones (Kepler, near enough)', () => {
    const { board } = buildMockSystemBoard(42, 'star_rich', 16)
    const orbiting = board.features.filter((f) => !!f.orbit).sort((a, b) => a.orbit!.ring - b.orbit!.ring)
    for (let i = 1; i < orbiting.length; i++) {
      if (orbiting[i]!.orbit!.ring > orbiting[i - 1]!.orbit!.ring) {
        expect(orbiting[i]!.orbit!.period).toBeGreaterThan(orbiting[i - 1]!.orbit!.period)
      }
    }
  })

  it('ships the own/foreign demo cast: a burner, a flotilla, and a bare contact', () => {
    const { fleets } = buildMockSystemBoard()
    expect(fleets.map((f) => f.own)).toEqual([true, true, false])
    expect(fleets[0]!.roster?.ships.length).toBe(2)
    expect(fleets[1]!.roster?.ships.length).toBe(4)
    // Audience fog: the foreign read carries no roster at all.
    expect(fleets[2]!.roster).toBeUndefined()
  })

  it('never marks an astronomical body mineable', () => {
    const { board } = buildMockSystemBoard()
    for (const f of board.features) {
      if (f.band === 'astronomical') expect(f.resources).toBeUndefined()
    }
  })
})

describe('ringDistance', () => {
  it('is a cell\'s ring index when measured from the core', () => {
    for (const c of [
      { ring: 0, slot: 0 },
      { ring: 3, slot: 1 },
      { ring: 5, slot: 11 },
      { ring: 8, slot: 0 },
    ]) {
      expect(ringDistance(c, { ring: 0, slot: 0 })).toBe(c.ring)
    }
  })

  it('is symmetric', () => {
    const a = { ring: 2, slot: 3 }
    const b = { ring: 7, slot: 1 }
    expect(ringDistance(a, b)).toBe(ringDistance(b, a))
  })

  it('ignores the slot — it measures radial separation only', () => {
    expect(ringDistance({ ring: 4, slot: 0 }, { ring: 4, slot: 9 })).toBe(0)
  })
})
