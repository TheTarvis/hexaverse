import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'

/** Fictional wire-shaped data. Production never imports this module. */
export function fleetFixture(overrides: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet-peregrine', name: 'Peregrine Deep Space Expedition', corporationId: 'demo', own: true,
    systemId: 'solace', worldTime: 117000, position: { X: 0, Y: 0, Z: 0 }, attachedTo: 'station',
    state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
    roster: { ships: [{ class: 'seed' }, { class: 'seed' }, { class: 'seed' }], cargo: { fuel: 18, iron: 42, silicates: 12 }, cargoCapacity: 120, freeHold: 48, miningRate: 1 },
    ...overrides,
  }
}
export const fixtureBurn = { DepartMs: 0, ArriveMs: 180000, Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'station', Point: null }, Intercept: { X: 10, Y: 0, Z: 0 }, Curve: [], Length: 10, Accel: 1, InsertionPhase: 0 }
export const fixtureNameOf = (id: string) => id === 'solace' ? 'Nereid system' : 'Aurelia system'
export const fixtureResolveBody = () => ({ kind: 'feature' as const, type: 'station', id: 'station', name: 'Nereid Outer System Research Anchorage' })
export const statusScenarios = { ready: 'Ready', travelling: 'Travelling', mining: 'Mining + sensors', remote: 'Remote fleet', transit: 'Lane transit', confirming: 'Awaiting confirmation', unavailable: 'Unavailable reads', completed: 'Completed scan', failed: 'Failed scan' }
export type StatusScenario = keyof typeof statusScenarios
export function statusFixture(scenario: StatusScenario) {
  const fleet = fleetFixture()
  const worldTime = scenario === 'confirming' ? 180000 : 117000
  if (scenario === 'travelling' || scenario === 'confirming') {
    fleet.state = { Mode: 0, Burn: fixtureBurn, Park: null, Drift: null }
    fleet.attachedTo = undefined
  }
  if (scenario === 'remote') fleet.systemId = 'aurelia'
  if (scenario === 'transit') fleet.jump = { laneId: 'lane', destSystemId: 'aurelia', departMs: 0, arriveMs: 300000 }
  const action = (type: string, eta: number): GameAction => ({ id: `fixture-${type}`, type, actor: fleet.id, scope: 'solace', committedAt: 0, eta, status: 'running', worldTime })
  return { fleet, worldTime, scanReport: scenario === 'completed' || scenario === 'failed' ? { ...action('scan', 100000), status: 'done' as const, reasonCode: scenario === 'failed' ? 'outOfRange' : undefined } : null, mine: scenario === 'mining' ? action('mine', 280000) : null, scan: scenario === 'mining' ? action('scan', 155000) : null }
}
