import { describe, it, expect } from 'vitest'
import { fleetStatus } from './fleet-status'
import type { Fleet } from '@/lib/types/fleet'

const nameOf = (id: string) => ({ 'sys-0': 'Axion', 'sys-1': 'Borealis' })[id] ?? id

const fleet = (state: Fleet['state'], systemId = 'sys-0'): Fleet => ({
  id: 'fl',
  corporationId: 'corp',
  systemId,
  state,
  position: { q: 0, r: 0 },
  own: true,
  worldTime: 0,
})

describe('fleetStatus', () => {
  // Spec: 0011/S1
  it('reads a coasting fleet as on station in its system', () => {
    const s = fleetStatus(fleet({ mode: 'coast', coast: { ring: 2, angle0: 0, period: 10, dir: 1 } }), 0, nameOf)
    expect(s).toMatchObject({ tone: 'idle', where: 'Axion', activity: 'On station', goToSystemId: 'sys-0' })
    expect(s.remainingMs).toBeUndefined()
  })

  it('counts down a burn', () => {
    const s = fleetStatus(
      fleet({
        mode: 'burn',
        burn: { path: [{ q: 0, r: 0 }], startTime: 0, arriveTime: 30_000, target: {} },
      }),
      10_000,
      nameOf,
    )
    expect(s).toMatchObject({ tone: 'moving', where: 'Axion', activity: 'Under way' })
    expect(s.remainingMs).toBe(20_000)
  })

  it('reads a trip as departing while it is still crossing its origin board', () => {
    const s = fleetStatus(
      fleet({
        mode: 'laneTransit',
        laneTransit: {
          boardLeg: { path: [{ q: 0, r: 0 }], startTime: 0, gateEta: 60_000 },
          route: ['sys-0', 'sys-1'],
          legEtas: [60_000, 600_000],
          departTime: 0,
          arriveTime: 600_000,
          entryGate: { q: 0, r: 0 },
        },
      }),
      30_000,
      nameOf,
    )
    // Still on the origin board, so the row opens that board — you can watch it
    // run for the gate.
    expect(s).toMatchObject({
      tone: 'transit',
      where: 'Axion → Borealis',
      activity: 'Departing',
      goToSystemId: 'sys-0',
      remainingMs: 570_000,
    })
  })

  // Spec: 0011/S2
  it('reads a trip past its gate as in transit, belonging to no board', () => {
    const s = fleetStatus(
      fleet({
        mode: 'laneTransit',
        laneTransit: {
          boardLeg: { path: [{ q: 0, r: 0 }], startTime: 0, gateEta: 60_000 },
          route: ['sys-0', 'sys-1'],
          legEtas: [60_000, 600_000],
          departTime: 0,
          arriveTime: 600_000,
          entryGate: { q: 0, r: 0 },
        },
      }),
      100_000,
      nameOf,
    )
    expect(s).toMatchObject({ tone: 'transit', activity: 'In transit', goToSystemId: null })
  })

  it('flags a fleet parked mid-lane', () => {
    const s = fleetStatus(
      fleet({ mode: 'laneHold', laneHold: { from: 'sys-0', to: 'sys-1', fraction: 0.4 } }),
      0,
      nameOf,
    )
    expect(s).toMatchObject({
      tone: 'held',
      where: 'Axion → Borealis',
      activity: 'Holding mid-lane',
      goToSystemId: null,
    })
  })

  it('falls back to the system id when the galaxy read has no name for it', () => {
    expect(fleetStatus(fleet({ mode: 'coast' }, 'sys-99'), 0, nameOf).where).toBe('sys-99')
  })
})
