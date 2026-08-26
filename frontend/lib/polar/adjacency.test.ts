import { describe, expect, it } from 'vitest'
import { isAdjacent } from './adjacency'
import { tight6 } from './schedule.test'

describe('isAdjacent', () => {
  it.each([
    ['consecutive slots across the wrap', { ring: 5, slot: 47 }, { ring: 5, slot: 0 }, true],
    ['two slots apart on one ring', { ring: 5, slot: 3 }, { ring: 5, slot: 5 }, false],
    ['two rings apart', { ring: 3, slot: 0 }, { ring: 5, slot: 0 }, false],
    ['the core and any ring-1 cell', { ring: 0, slot: 0 }, { ring: 1, slot: 4 }, true],
    ['the core and a ring-2 cell', { ring: 0, slot: 0 }, { ring: 2, slot: 0 }, false],
    ['corner contact within a band', { ring: 6, slot: 0 }, { ring: 7, slot: 1 }, true],
    ['doubling boundary, faced fine cell', { ring: 4, slot: 0 }, { ring: 5, slot: 0 }, true],
    ['doubling boundary, adjacent under loose and true corner contact', { ring: 4, slot: 0 }, { ring: 5, slot: 1 }, true],
    ['doubling boundary, phantom neighbor rejected under true corner contact', { ring: 4, slot: 0 }, { ring: 5, slot: 2 }, false],
    ['doubling boundary, beyond one coarse cell width', { ring: 4, slot: 0 }, { ring: 5, slot: 3 }, false],
  ])('%s', (_name, a, b, want) => {
    expect(isAdjacent(a, b, tight6)).toBe(want)
    expect(isAdjacent(b, a, tight6)).toBe(want)
  })
})
