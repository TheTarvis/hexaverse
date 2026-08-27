import { describe, it, expect } from 'vitest'
import { cellKey } from '@/lib/board'
import { echoFrontCells, echoReturns, PING_TUNING } from './scan-ping'
import { productionSchedule } from '@/lib/board'

const S = productionSchedule()

const COMMITTED = 1_000
const DURATION = 30_000
const ETA = COMMITTED + DURATION

describe('echoFrontCells', () => {
  it('crosses the board over exactly the scan window — ScanDuration is the rim round-trip', () => {
    expect(echoFrontCells(COMMITTED, ETA, COMMITTED, 16)).toBe(0)
    expect(echoFrontCells(COMMITTED, ETA, COMMITTED + DURATION / 2, 16)).toBeCloseTo(8)
    expect(echoFrontCells(COMMITTED, ETA, ETA, 16)).toBe(16)
  })

  it('re-paces itself off the window — retuning ScanDuration re-paces the front', () => {
    // A twice-as-long scan has a half-speed front at the same elapsed time.
    expect(echoFrontCells(COMMITTED, COMMITTED + 2 * DURATION, COMMITTED + DURATION / 2, 16)).toBeCloseTo(4)
  })

  it('clamps outside the window instead of overshooting', () => {
    expect(echoFrontCells(COMMITTED, ETA, COMMITTED - 5_000, 16)).toBe(0)
    expect(echoFrontCells(COMMITTED, ETA, ETA + 5_000, 16)).toBe(16)
  })
})

describe('echoReturns', () => {
  const origin = { ring: 0, slot: 0 }
  const bodies = [
    { ring: 4, slot: 0 },
    { ring: 8, slot: 0 },
  ]

  it('flashes a body at full strength the instant the front reaches it, fading as it passes', () => {
    // Front exactly at the near body.
    const atHit = echoReturns(origin, bodies, 4, new Set(), S)
    expect(atHit).toHaveLength(1)
    expect(atHit[0].cell).toEqual({ ring: 4, slot: 0 })
    expect(atHit[0].strength).toBeCloseTo(1)

    // One cell past it: decayed by 1/returnFadeCells.
    const past = echoReturns(origin, bodies, 5, new Set(), S)
    expect(past[0].strength).toBeCloseTo(1 - 1 / PING_TUNING.returnFadeCells)
  })

  it('never flashes a body the front has not reached, and drops one fully faded', () => {
    expect(echoReturns(origin, bodies, 3.5, new Set(), S)).toHaveLength(0)
    const gone = echoReturns(origin, bodies, 4 + PING_TUNING.returnFadeCells, new Set(), S)
    expect(gone.find((r) => r.cell.ring === 4)).toBeUndefined()
  })

  it('never flashes a shadowed body or the antenna cell itself', () => {
    const shadowed = new Set([cellKey({ ring: 4, slot: 0 })])
    expect(echoReturns(origin, bodies, 5, shadowed, S)).toHaveLength(0)
    expect(echoReturns(origin, [{ ring: 0, slot: 0 }], 5, new Set(), S)).toHaveLength(0)
  })
})
