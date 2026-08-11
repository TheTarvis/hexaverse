import { describe, expect, it } from 'vitest'
import { PATROL_CYCLE, patrolAt, patrolProgress } from './patrol'

// The patrol is the one piece of logic BOTH renderers depend on. If it drifts,
// the two boards show the ship in different places and the comparison the spike
// exists to make is worthless — so it is worth pinning properly.

const A = { x: 0, y: 0 }
const B = { x: 100, y: -50 }

describe('patrolProgress', () => {
  it('holds at A for the first tenth of the cycle', () => {
    expect(patrolProgress(0)).toEqual({ p: 0, moving: false })
    expect(patrolProgress(PATROL_CYCLE * 0.05)).toEqual({ p: 0, moving: false })
  })

  it('reaches B exactly at the half cycle and holds there', () => {
    expect(patrolProgress(PATROL_CYCLE * 0.5).p).toBeCloseTo(1, 6)
    expect(patrolProgress(PATROL_CYCLE * 0.55)).toEqual({ p: 1, moving: false })
  })

  it('returns to A by the end of the cycle', () => {
    expect(patrolProgress(PATROL_CYCLE * 0.9999).p).toBeCloseTo(0, 3)
  })

  it('is under thrust only while actually moving', () => {
    expect(patrolProgress(PATROL_CYCLE * 0.3).moving).toBe(true)
    expect(patrolProgress(PATROL_CYCLE * 0.8).moving).toBe(true)
    expect(patrolProgress(PATROL_CYCLE * 0.02).moving).toBe(false)
  })

  it('is periodic, so both renderers agree however long they have been running', () => {
    for (const t of [0.17, 0.4, 0.63, 0.91]) {
      const a = patrolProgress(PATROL_CYCLE * t)
      const b = patrolProgress(PATROL_CYCLE * (t + 5))
      expect(b.p).toBeCloseTo(a.p, 10)
      expect(b.moving).toBe(a.moving)
    }
  })

  it('handles negative time without flipping the leg', () => {
    expect(patrolProgress(-PATROL_CYCLE * 0.98).p).toBeCloseTo(patrolProgress(PATROL_CYCLE * 0.02).p, 10)
  })
})

describe('patrolAt', () => {
  it('interpolates between the two anchors', () => {
    expect(patrolAt(A, B, 0)).toMatchObject({ x: 0, y: 0 })
    const mid = patrolAt(A, B, PATROL_CYCLE * 0.5)
    expect(mid.x).toBeCloseTo(100, 6)
    expect(mid.y).toBeCloseTo(-50, 6)
  })

  it('reports a unit velocity that reverses on the return leg', () => {
    const out = patrolAt(A, B, PATROL_CYCLE * 0.3)
    const back = patrolAt(A, B, PATROL_CYCLE * 0.8)
    expect(Math.hypot(out.vx, out.vy)).toBeCloseTo(1, 6)
    expect(Math.hypot(back.vx, back.vy)).toBeCloseTo(1, 6)
    expect(back.vx).toBeCloseTo(-out.vx, 6)
    expect(back.vy).toBeCloseTo(-out.vy, 6)
  })

  it('never leaves the segment between the anchors', () => {
    for (let i = 0; i < 60; i++) {
      const s = patrolAt(A, B, (PATROL_CYCLE * i) / 60)
      expect(s.x).toBeGreaterThanOrEqual(-1e-9)
      expect(s.x).toBeLessThanOrEqual(100 + 1e-9)
    }
  })
})
