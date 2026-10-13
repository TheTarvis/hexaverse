import { describe, expect, it } from 'vitest'
import { newGuide, parseGuide, reconcileGuide, confirmGuideSale, confirmGuideRefuel } from './command-onboarding'
import type { Fleet } from './types/fleet'
import type { GameAction } from './types/action'

const fleet = { id: 'fleet', corporationId: 'corp', systemId: 'home', own: true, position: { X: 0, Y: 0, Z: 0 }, attachedTo: 'planet', worldTime: 200, state: { Mode: 1, Burn: null, Park: null, Drift: null }, roster: { cargo: { water: 3 }, ships: [], cargoCapacity: 10, freeHold: 7, miningRate: 1 } } as Fleet
const action = { id: 'mine', actor: 'fleet', type: 'mine', status: 'done' } as GameAction
const guide = { ...newGuide('corp', 'fleet', 'home'), phase: 'travel' as const, targetId: 'planet', acceptedAt: 100 }

describe('command onboarding evidence', () => {
  it('confirms arrival only from fresh parked attachment for the enrolled fleet', () => {
    expect(reconcileGuide(guide, fleet, null).phase).toBe('mine')
    for (const invalid of [{ ...fleet, id: 'other' }, { ...fleet, worldTime: 50 }, { ...fleet, attachedTo: 'elsewhere' }, { ...fleet, state: { Mode: 0 } } as Fleet]) {
      expect(reconcileGuide(guide, invalid, null).phase).toBe('travel')
    }
    expect(reconcileGuide(guide, null, null).phase).toBe('travel')
  })
  it('requires accepted mining action and increased cargo, not just elapsed time', () => {
    const mining = { ...guide, phase: 'extraction' as const, mineActionId: 'mine', resource: 'water' as const, cargoBefore: 2 }
    expect(reconcileGuide(mining, fleet, action).phase).toBe('return')
    expect(reconcileGuide(mining, fleet, { ...action, reasonCode: 'clean' }).phase).toBe('return')
    for (const invalid of [null, { ...action, id: 'other' }, { ...action, actor: 'other' }, { ...action, status: 'running' as const }]) {
      expect(reconcileGuide(mining, fleet, invalid).phase).toBe('extraction')
    }
    expect(reconcileGuide(mining, { ...fleet, roster: { ...fleet.roster!, cargo: { water: 2 } } }, action).phase).toBe('extraction')
    expect(reconcileGuide(mining, fleet, { ...action, status: 'cancelled' }).phase).toBe('mine')
    expect(reconcileGuide(mining, fleet, { ...action, reasonCode: 'leftSystem' }).phase).toBe('mine')
  })
  it('validates persisted scope and rejects malformed or incomplete evidence', () => {
    expect(parseGuide(JSON.stringify(guide), 'corp')).toEqual(guide)
    expect(parseGuide(JSON.stringify(guide), 'other')).toBeNull()
    expect(parseGuide('{', 'corp')).toBeNull()
    expect(parseGuide(JSON.stringify({ ...guide, acceptedAt: null }), 'corp')).toBeNull()
    expect(parseGuide(JSON.stringify({ ...guide, phase: 'extraction' }), 'corp')).toBeNull()
  })
})


it('resumes old completed lessons but preserves dismissal and validates station evidence', () => {
  const old = { ...guide, version: 1, phase: 'done', mineActionId: 'mine', resource: 'water' }
  expect(parseGuide(JSON.stringify(old), 'corp')?.phase).toBe('return')
  expect(parseGuide(JSON.stringify({ ...old, phase: 'dismissed' }), 'corp')?.phase).toBe('dismissed')
  expect(parseGuide(JSON.stringify({ ...old, version: 2, phase: 'sell' }), 'corp')).toBeNull()
})

it('confirms station arrival and matching instant receipts in order, surviving reload', () => {
  const returning = { ...guide, phase: 'returning' as const, stationId: 'station', mineActionId: 'mine', resource: 'water' as const }
  expect(reconcileGuide(returning, fleet, null).phase).toBe('returning')
  expect(reconcileGuide(returning, { ...fleet, attachedTo: 'station', worldTime: 10 }, null).phase).toBe('returning')
  const selling = reconcileGuide(returning, { ...fleet, attachedTo: 'station' }, null)
  expect(selling.phase).toBe('sell')
  const sale = { fleetId: 'fleet', featureId: 'station', kind: 'water', result: { fills: [{ source: 'floor' as const, tons: 1, unitPrice: 10, proceeds: 10 }], totalProceeds: 10, balance: 1010, cargo: { water: 2 }, worldTime: 201 } }
  for (const invalid of [{ ...sale, fleetId: 'other' }, { ...sale, featureId: 'other' }, { ...sale, kind: 'metals' }, { ...sale, result: { ...sale.result, totalProceeds: 0 } }]) expect(confirmGuideSale(selling, invalid)).toBe(selling)
  const refuelling = confirmGuideSale(selling, sale)
  expect(refuelling.phase).toBe('refuel')
  expect(parseGuide(JSON.stringify(refuelling), 'corp')).toEqual(refuelling)
  const purchase = { fleetId: 'fleet', featureId: 'station', fuelBefore: 5, result: { cost: 10, cargo: { fuel: 6 }, balance: 1000, worldTime: 202 } }
  expect(confirmGuideRefuel(selling, purchase)).toBe(selling)
  expect(confirmGuideRefuel(refuelling, { ...purchase, fleetId: 'other' })).toBe(refuelling)
  expect(confirmGuideRefuel(refuelling, { ...purchase, fuelBefore: 6 })).toBe(refuelling)
  const done = confirmGuideRefuel(refuelling, purchase)
  expect(done.phase).toBe('done')
  expect(parseGuide(JSON.stringify(done), 'corp')).toEqual(done)
})

it('requires the exact successful tutorial scan, preserves progress on failure, and survives reload', () => {
  const scanning = { ...newGuide('corp', 'fleet', 'home'), phase: 'scanning' as const, scanActionId: 'scan-1' }
  const report = { id: 'scan-1', type: 'scan', actor: 'fleet', scope: 'home', status: 'done' } as GameAction
  expect(parseGuide(JSON.stringify(scanning), 'corp')).toEqual(scanning)
  expect(reconcileGuide(scanning, fleet, report).phase).toBe('contacts')
  for (const invalid of [null, { ...report, id: 'old' }, { ...report, actor: 'other' }, { ...report, scope: 'other' }, { ...report, status: 'running' as const }]) expect(reconcileGuide(scanning, fleet, invalid).phase).toBe('scanning')
  expect(reconcileGuide(scanning, fleet, { ...report, reasonCode: 'occluded' }).phase).toBe('scan')
  expect(reconcileGuide(scanning, fleet, { ...report, status: 'cancelled' }).phase).toBe('scan')
})

it('migrates an unstarted legacy motor lesson into the station and scan flow', () => {
  expect(parseGuide(JSON.stringify({ ...guide, version: 2, phase: 'target' }), 'corp')?.phase).toBe('objects')
  expect(parseGuide(JSON.stringify({ ...guide, version: 2, phase: 'travel' }), 'corp')?.phase).toBe('travel')
})
