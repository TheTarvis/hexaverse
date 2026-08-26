import { describe, expect, it } from 'vitest'
import { isAdjacent, slotsForRing, validateSchedule } from '@/lib/polar'
import { INNER_SLOTS, distance, doubleAt, neighbors, ringCells, schedule } from './board'

describe('schedule', () => {
  it('pins the Isotropic production values', () => {
    expect(INNER_SLOTS).toBe(6)
    expect(doubleAt()).toEqual([2, 3, 5, 9, 17])
    const s = schedule(20)
    expect(validateSchedule(s)).toBeNull()
    const want: Record<number, number> = { 0: 1, 1: 6, 2: 12, 3: 24, 4: 24, 5: 48, 8: 48, 9: 96, 16: 96, 17: 192, 20: 192 }
    for (const [ring, slots] of Object.entries(want)) {
      expect(slotsForRing(Number(ring), s)).toBe(slots)
    }
  })
})

describe('ringCells', () => {
  const s = schedule(10)
  it('returns the single core cell for ring 0', () => {
    expect(ringCells(0, s)).toEqual([{ ring: 0, slot: 0 }])
  })
  it('enumerates a ring in slot order', () => {
    const cells = ringCells(2, s)
    expect(cells).toHaveLength(12)
    cells.forEach((c, i) => expect(c).toEqual({ ring: 2, slot: i }))
  })
})

describe('distance', () => {
  const s = schedule(10)
  it.each([
    ['identity', { ring: 5, slot: 3 }, { ring: 5, slot: 3 }, 0],
    ['adjacent same ring', { ring: 5, slot: 3 }, { ring: 5, slot: 4 }, 1],
    ['adjacent across rings', { ring: 4, slot: 0 }, { ring: 5, slot: 0 }, 1],
    ['corner step counts one', { ring: 6, slot: 0 }, { ring: 7, slot: 1 }, 1],
    ['the phantom pair is two steps', { ring: 4, slot: 0 }, { ring: 5, slot: 2 }, 2],
    ['core to ring 2', { ring: 0, slot: 0 }, { ring: 2, slot: 0 }, 2],
    // The core is adjacent to every ring-1 cell, so the graph metric cuts
    // through it — distance is a range measure, not a flight path.
    ['half the ring around ring 1 cuts through the core', { ring: 1, slot: 0 }, { ring: 1, slot: 3 }, 2],
    ['radial descent', { ring: 5, slot: 0 }, { ring: 1, slot: 0 }, 4],
  ])('%s', (_name, a, b, want) => {
    expect(distance(a, b, s)).toBe(want)
    expect(distance(b, a, s)).toBe(want)
  })

  it('is 1 exactly on adjacent pairs (rings ≤ 4)', () => {
    const s4 = schedule(6)
    for (let ar = 0; ar <= 4; ar++) {
      for (let as_ = 0; as_ < slotsForRing(ar, s4); as_++) {
        for (let br = 0; br <= 4; br++) {
          for (let bs = 0; bs < slotsForRing(br, s4); bs++) {
            const a = { ring: ar, slot: as_ }
            const b = { ring: br, slot: bs }
            const d = distance(a, b, s4)
            const adj = isAdjacent(a, b, s4) && !(ar === br && as_ === bs)
            if (adj !== (d === 1)) {
              throw new Error(`distance(${ar}:${as_}, ${br}:${bs}) = ${d}, adjacency ${adj}`)
            }
          }
        }
      }
    }
  })
})

describe('neighbors', () => {
  const s = schedule(10)
  it('agrees with the adjacency predicate cell-by-cell', () => {
    for (const c of [
      { ring: 0, slot: 0 },
      { ring: 1, slot: 3 },
      { ring: 4, slot: 20 },
      { ring: 5, slot: 0 },
      { ring: 10, slot: 90 },
    ]) {
      const got = new Set(neighbors(c, s).map((n) => `${n.ring}:${n.slot}`))
      const want = new Set<string>()
      for (let ring = 0; ring <= 10; ring++) {
        for (let slot = 0; slot < slotsForRing(ring, s); slot++) {
          if (ring === c.ring && slot === c.slot) continue
          if (isAdjacent(c, { ring, slot }, s)) want.add(`${ring}:${slot}`)
        }
      }
      expect([...got].sort()).toEqual([...want].sort())
    }
  })
})
