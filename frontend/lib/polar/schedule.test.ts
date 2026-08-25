import { describe, expect, it } from 'vitest'
import {
  bandedSchedule,
  canonCell,
  normalizeSlot,
  type Schedule,
  slotsForRing,
  validateSchedule,
} from './schedule'

// The spike's default banding — used as A schedule, never THE schedule
// (the slot-schedule value is Decision 2 of the handoff and stays open).
export const tight6 = bandedSchedule(6, [2, 3, 5, 9, 17], 20)

describe('schedule', () => {
  it('bandedSchedule matches the spike’s slotsForRing', () => {
    const want: Record<number, number> = { 0: 1, 1: 6, 2: 12, 3: 24, 4: 24, 5: 48, 8: 48, 9: 96, 16: 96, 17: 192, 20: 192 }
    for (const [ring, slots] of Object.entries(want)) {
      expect(slotsForRing(Number(ring), tight6)).toBe(slots)
    }
    expect(slotsForRing(-3, tight6)).toBe(1)
  })

  it.each<[string, Schedule, boolean]>([
    ['banded tight6', tight6, true],
    ['core-only board', { maxRing: 0, counts: [1] }, true],
    ['ring-1 slot count of three (core step exempt)', { maxRing: 1, counts: [1, 3] }, true],
    ['zero-slot ring', { maxRing: 1, counts: [1, 0] }, false],
    ['one-slot ring', { maxRing: 1, counts: [1, 1] }, false],
    ['ratio 4', { maxRing: 2, counts: [1, 6, 24] }, false],
    ['decreasing', { maxRing: 2, counts: [1, 12, 6] }, false],
    ['ring 0 not the single core', { maxRing: 1, counts: [6, 6] }, false],
    ['undefined ring within own bound', { maxRing: 2, counts: [1, 6] }, false],
    ['counts beyond the declared bound', { maxRing: 2, counts: [1, 6, 12, 24] }, false],
  ])('validateSchedule: %s', (_name, s, valid) => {
    expect(validateSchedule(s) === null).toBe(valid)
  })

  it('normalizeSlot wraps both directions', () => {
    expect(normalizeSlot(-1, 24)).toBe(23)
    expect(normalizeSlot(25, 24)).toBe(1)
    expect(normalizeSlot(24, 24)).toBe(0)
    expect(normalizeSlot(7, 1)).toBe(0) // the core: every index is the one cell
  })

  it('canonCell collapses the core and wraps slots', () => {
    expect(canonCell({ ring: 0, slot: 3 }, tight6)).toEqual({ ring: 0, slot: 0 })
    expect(canonCell({ ring: -2, slot: 5 }, tight6)).toEqual({ ring: 0, slot: 0 })
    expect(canonCell({ ring: 2, slot: 13 }, tight6)).toEqual({ ring: 2, slot: 1 })
    expect(canonCell({ ring: 2, slot: -1 }, tight6)).toEqual({ ring: 2, slot: 11 })
  })
})
