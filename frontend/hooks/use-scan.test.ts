// Unit test for `selectMostRecentlySettled` (openspec change
// `add-scan-and-sightings-surface`, tasks.md 6.10, `system-space-view`: *A
// Settled Sweep Reports Its Outcome, Including Each Fizzle Reason, in
// Player Copy*). The SDET's red suite exercises the WIRING (the
// type-filtered read is requested) but not this pure selection logic; a
// unit not reached by the shared suite gets its own test, per the
// project's TDD discipline.

import { describe, it, expect } from 'vitest'
import { selectMostRecentlySettled } from './use-scan'
import type { GameAction } from '@/lib/types/action'

function action(over: Partial<GameAction> = {}): GameAction {
  return {
    id: 'a',
    type: 'scan',
    actor: 'fleet_1',
    scope: 'sys-1',
    committedAt: 0,
    eta: 1000,
    status: 'done',
    worldTime: 2000,
    ...over,
  }
}

describe('selectMostRecentlySettled', () => {
  it('reports the scan with the greatest resolvedAt, whichever order the inbox listed them in', () => {
    const older = action({ id: 'older', resolvedAt: 100, eta: 100 })
    const newer = action({ id: 'newer', resolvedAt: 500, eta: 500 })
    expect(selectMostRecentlySettled([older, newer])?.id).toBe('newer')
    expect(selectMostRecentlySettled([newer, older])?.id).toBe('newer')
  })

  it('breaks an equal resolvedAt tie by the greater eta, deterministically', () => {
    const a = action({ id: 'a', resolvedAt: 100, eta: 200 })
    const b = action({ id: 'b', resolvedAt: 100, eta: 300 })
    expect(selectMostRecentlySettled([a, b])?.id).toBe('b')
    expect(selectMostRecentlySettled([b, a])?.id).toBe('b')
  })

  it('excludes acknowledged actions', () => {
    const acked = action({ id: 'acked', resolvedAt: 900, acknowledgedAt: 950 })
    const unacked = action({ id: 'unacked', resolvedAt: 100 })
    expect(selectMostRecentlySettled([acked, unacked])?.id).toBe('unacked')
  })

  it('returns null when every settled action is acknowledged, or the list is empty', () => {
    expect(selectMostRecentlySettled([])).toBeNull()
    expect(selectMostRecentlySettled([action({ acknowledgedAt: 1 })])).toBeNull()
  })
})
