import { describe, expect, it } from 'vitest'
import { isAdjacent } from './adjacency'
import { arcPath, floorDiv } from './path'
import { canonCell, slotsForRing } from './schedule'
import { tight6 } from './schedule.test'

describe('arcPath', () => {
  it.each([
    ['ring tie rounds toward the destination', { ring: 1, slot: 0 }, { ring: 2, slot: 0 }, [{ ring: 1, slot: 0 }, { ring: 2, slot: 0 }]],
    ['angular slot tie resolves in the sweep’s direction', { ring: 1, slot: 0 }, { ring: 2, slot: 1 }, [{ ring: 1, slot: 0 }, { ring: 2, slot: 1 }]],
    ['half-turn sweep goes increasing', { ring: 1, slot: 0 }, { ring: 1, slot: 3 }, [{ ring: 1, slot: 0 }, { ring: 1, slot: 1 }, { ring: 1, slot: 2 }, { ring: 1, slot: 3 }]],
    ['half-turn sweep goes increasing through the wrap', { ring: 1, slot: 4 }, { ring: 1, slot: 1 }, [{ ring: 1, slot: 4 }, { ring: 1, slot: 5 }, { ring: 1, slot: 0 }, { ring: 1, slot: 1 }]],
    ['zero-sweep tie resolves to the higher slot', { ring: 2, slot: 1 }, { ring: 0, slot: 0 }, [{ ring: 2, slot: 1 }, { ring: 1, slot: 1 }, { ring: 0, slot: 0 }]],
    ['zero-sweep tie at the wrap resolves to slot 0', { ring: 2, slot: 11 }, { ring: 0, slot: 0 }, [{ ring: 2, slot: 11 }, { ring: 1, slot: 0 }, { ring: 0, slot: 0 }]],
    ['core departure is purely radial', { ring: 0, slot: 0 }, { ring: 3, slot: 5 }, [{ ring: 0, slot: 0 }, { ring: 1, slot: 1 }, { ring: 2, slot: 3 }, { ring: 3, slot: 5 }]],
    ['coarse inner to fine outer, finest-ring sampled', { ring: 1, slot: 0 }, { ring: 3, slot: 7 }, [{ ring: 1, slot: 0 }, { ring: 2, slot: 1 }, { ring: 2, slot: 2 }, { ring: 2, slot: 3 }, { ring: 3, slot: 6 }, { ring: 3, slot: 7 }]],
    ['coincident endpoints yield the single cell', { ring: 4, slot: 7 }, { ring: 4, slot: 7 }, [{ ring: 4, slot: 7 }]],
  ])('%s', (_name, from, to, want) => {
    expect(arcPath(from, to, tight6)).toEqual(want)
  })

  it('floorDiv floors negative numerators exactly', () => {
    expect(floorDiv(7, 2)).toBe(3)
    expect(floorDiv(-7, 2)).toBe(-4)
    expect(floorDiv(-8, 2)).toBe(-4)
    expect(floorDiv(0, 5)).toBe(0)
  })

  // The property sweep the Go suite runs exhaustively at maxRing 10 (and the
  // fixture sweep pins cross-language at maxRing 10); a lighter pass here
  // guards the mirror's own logic without doubling the suite's runtime.
  it('every consecutive pair is adjacent; same-ring stays; core only at an endpoint (rings ≤ 6)', () => {
    const maxRing = 6
    for (let fr = 0; fr <= maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, tight6); fs++) {
        for (let tr = 0; tr <= maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, tight6); ts++) {
            const from = { ring: fr, slot: fs }
            const to = { ring: tr, slot: ts }
            const path = arcPath(from, to, tight6)
            expect(path[0]).toEqual(canonCell(from, tight6))
            expect(path[path.length - 1]).toEqual(canonCell(to, tight6))
            for (let i = 1; i < path.length; i++) {
              if (!isAdjacent(path[i - 1], path[i], tight6)) {
                throw new Error(`non-adjacent step in arcPath(${fr}:${fs}, ${tr}:${ts})`)
              }
              if (fr === tr && path[i].ring !== fr) {
                throw new Error(`same-ring transfer left its ring: arcPath(${fr}:${fs}, ${tr}:${ts})`)
              }
              if (path[i].ring === 0 && fr !== 0 && tr !== 0) {
                throw new Error(`crossed the core without a core endpoint: arcPath(${fr}:${fs}, ${tr}:${ts})`)
              }
            }
          }
        }
      }
    }
  })
})
