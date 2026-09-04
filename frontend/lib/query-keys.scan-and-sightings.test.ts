// RED-phase tests for openspec change add-scan-and-sightings-surface,
// tasks.md 4.7 — the new query keys (link8b-impl-contract.md §1.8, pinned):
//
//   queryKeys.sightings.all             = ['sightings']
//   queryKeys.sightings.pile(systemId)  = [...all, 'pile', systemId ?? 'all']
//   queryKeys.fleets.scanTargets(fleetId) = [...fleets.all, 'scan-targets', fleetId]
//   queryKeys.actions.settled(actorId)  = [...actions.all, 'settled', actorId]
//
// The load-bearing property under test is task 4.7's own stated reason:
// the system-filtered ghost read and the unfiltered log read must NEVER
// share a cache entry — asserted here as "pile(systemId) !== pile(null)"
// for every systemId, not merely that the two happen to differ once.
//
// EXPECTED RED TODAY: `queryKeys.sightings`, `queryKeys.fleets.scanTargets`,
// and `queryKeys.actions.settled` are all `undefined` — calling them throws.

import { describe, it, expect } from 'vitest'
import { queryKeys } from './query-keys'

describe('queryKeys.sightings — the pile, keyed by its optional systemId filter', () => {
  it('the unfiltered (log) read and a system-filtered (ghost layer) read never share a key', () => {
    const unfiltered = queryKeys.sightings.pile(null)
    const filtered = queryKeys.sightings.pile('sys-7')
    expect(JSON.stringify(unfiltered)).not.toBe(JSON.stringify(filtered))
  })

  it('two DIFFERENT systemIds never share a key either', () => {
    const a = queryKeys.sightings.pile('sys-7')
    const b = queryKeys.sightings.pile('sys-9')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('is stable for the same systemId across calls (cache reuse within one filter)', () => {
    expect(queryKeys.sightings.pile('sys-7')).toEqual(queryKeys.sightings.pile('sys-7'))
    expect(queryKeys.sightings.pile(null)).toEqual(queryKeys.sightings.pile(null))
  })

  it('nests under queryKeys.sightings.all, for bulk invalidation', () => {
    const key = queryKeys.sightings.pile('sys-7')
    expect(key.slice(0, queryKeys.sightings.all.length)).toEqual(queryKeys.sightings.all)
  })
})

describe('queryKeys.fleets.scanTargets — per-fleet scan-target cache key', () => {
  it('is keyed by fleetId, distinct fleets never colliding', () => {
    const a = queryKeys.fleets.scanTargets('fleet_1')
    const b = queryKeys.fleets.scanTargets('fleet_2')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('queryKeys.actions.settled — per-actor settled-inbox cache key', () => {
  it('is keyed by actorId, distinct actors never colliding', () => {
    const a = queryKeys.actions.settled('fleet_1')
    const b = queryKeys.actions.settled('fleet_2')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  // SDET-added: the settled key must not collide with the existing
  // `running` key for the SAME actor — the whole point of 4.10's separate
  // running/settled inbox reads is that they cache independently.
  it('does not collide with queryKeys.actions.running for the same actor', () => {
    const settled = queryKeys.actions.settled('fleet_1')
    const running = queryKeys.actions.running('fleet_1')
    expect(JSON.stringify(settled)).not.toBe(JSON.stringify(running))
  })
})
