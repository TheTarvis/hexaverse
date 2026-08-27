import { describe, it, expect } from 'vitest'
import { defaultOrbit, dist, generateSystem, resolveShip, shipPosition, v3 } from '../space-3d/sim'
import type { ShipState } from '../space-3d/sim'
import {
  BUBBLE_RADIUS,
  PATROL_DWELL,
  SCAN_MAX_RANGE,
  SCAN_SPEED,
  emitPulse,
  emptyKnowledge,
  fmtTime,
  inBubble,
  makePatrol,
  patrolPosition,
  patrolState,
  predictedPosition,
  stepKnowledge,
} from './intel'
import type { Sighting } from './intel'

const STOPS = ['p2', 'p4', 'p1']

const setup = (seed = 42) => {
  const system = generateSystem(seed)
  const patrol = makePatrol(system, STOPS)
  const orbit = defaultOrbit(system, 'p2')
  const you: ShipState =
    orbit.kind === 'orbit' ? { mode: 'idle', at: { ...orbit, phase: Math.PI } } : { mode: 'idle', at: orbit }
  return { system, patrol, you }
}

// The first parked window ends at PATROL_DWELL; the first burn's arrival is
// the next segment boundary. Extending far enough materializes both.
const firstArrival = (patrol: ReturnType<typeof makePatrol>) => {
  patrolState(patrol, PATROL_DWELL + 1)
  const burnSeg = patrol.segments.find((s) => s.state.mode === 'burn')!
  return burnSeg.until
}

describe('patrol', () => {
  it('is deterministic — two patrols over the same system agree far into the timeline', () => {
    const a = setup()
    const b = setup()
    const pa = patrolPosition(a.patrol, 500)
    const pb = patrolPosition(b.patrol, 500)
    expect(dist(pa, pb)).toBeLessThan(1e-9)
  })

  it('parks at the first stop, then burns to the next after the dwell', () => {
    const { patrol } = setup()
    expect(patrolState(patrol, 1).mode).toBe('idle')
    const after = patrolState(patrol, PATROL_DWELL + 0.5)
    expect(after.mode).toBe('burn')
    if (after.mode === 'burn') {
      expect(after.burn.target).toEqual({ kind: 'body', bodyId: 'p4' })
    }
  })

  it('is continuous across the park→burn boundary', () => {
    const { patrol } = setup()
    const before = patrolPosition(patrol, PATROL_DWELL - 1e-4)
    const after = patrolPosition(patrol, PATROL_DWELL + 1e-4)
    expect(dist(before, after)).toBeLessThan(0.1)
  })

  it('settles each burn into a parked dwell at the destination', () => {
    const { patrol } = setup()
    const arrive = firstArrival(patrol)
    const parked = patrolState(patrol, arrive + 1)
    expect(parked.mode).toBe('idle')
    if (parked.mode === 'idle' && parked.at.kind === 'orbit') {
      expect(parked.at.bodyId).toBe('p4')
    }
  })
})

describe('bubble and knowledge fold', () => {
  it('has live contact while the patrol dwells at your planet', () => {
    const { system, patrol, you } = setup()
    expect(inBubble(system, patrol, you, 1)).toBe(true)
  })

  it('has no contact for a ship parked in deep space', () => {
    const { system, patrol } = setup()
    const far: ShipState = { mode: 'idle', at: { kind: 'point', point: v3(1000, 0, 0) } }
    expect(inBubble(system, patrol, far, 1)).toBe(false)
  })

  it('flags entry with a contact record, then mints a departure glimpse on exit', () => {
    const { system, patrol, you } = setup()
    const start = stepKnowledge(system, patrol, you, emptyKnowledge(), 1)
    expect(start.events).toContain('contact')
    expect(start.knowledge.live).toBe(true)
    expect(start.knowledge.latest?.origin).toBe('contact')
    expect(start.knowledge.log).toHaveLength(1)

    // Mid-burn to another planet the patrol is far outside the bubble.
    const arrive = firstArrival(patrol)
    const tGone = (PATROL_DWELL + arrive) / 2
    const lost = stepKnowledge(system, patrol, you, start.knowledge, tGone)
    expect(lost.events).toContain('lost')
    expect(lost.knowledge.live).toBe(false)
    expect(lost.knowledge.latest?.quality).toBe('glimpse')
    expect(lost.knowledge.latest?.origin).toBe('departure')
    expect(lost.knowledge.latest?.asOf).toBe(tGone)
    expect(dist(lost.knowledge.latest!.pos, patrolPosition(patrol, tGone))).toBeLessThan(1e-9)
    expect(lost.knowledge.log).toHaveLength(2)
  })

  it('flags a silent transit that starts and finishes between two ticks', () => {
    const { system, patrol } = setup()
    // Park an observer directly on a mid-burn point of the patrol's path,
    // picking a leg long enough that the patrol is out of the bubble at both
    // tick times — the interval sweep must still mint contact AND departure.
    patrolState(patrol, 800)
    let found: { you: ShipState; prevT: number; t: number } | null = null
    for (let i = 1; i < patrol.segments.length && !found; i++) {
      const seg = patrol.segments[i]
      if (seg.state.mode !== 'burn') continue
      const depart = patrol.segments[i - 1].until
      const tMid = (depart + seg.until) / 2
      const you: ShipState = { mode: 'idle', at: { kind: 'point', point: patrolPosition(patrol, tMid) } }
      const prevT = depart - 0.5
      const t = seg.until + 0.5
      if (!inBubble(system, patrol, you, prevT) && !inBubble(system, patrol, you, t)) {
        found = { you, prevT, t }
      }
    }
    expect(found).not.toBeNull()
    const { you, prevT, t } = found!

    const swept = stepKnowledge(system, patrol, you, emptyKnowledge(), t, prevT)
    expect(swept.events).toContain('contact')
    expect(swept.events).toContain('lost')
    expect(swept.knowledge.live).toBe(false)
    expect(swept.knowledge.log).toHaveLength(2)
    expect(swept.knowledge.log[1].origin).toBe('contact')
    expect(swept.knowledge.latest?.origin).toBe('departure')
    // Both records date from inside the swept interval.
    for (const s of swept.knowledge.log) {
      expect(s.asOf).toBeGreaterThan(prevT)
      expect(s.asOf).toBeLessThanOrEqual(t)
    }
  })
})

describe('sighting prediction', () => {
  it('a glimpse holds its last-known position forever', () => {
    const s: Sighting = { quality: 'glimpse', origin: 'departure', asOf: 100, receivedAt: 100, pos: v3(5, 0, 5), state: null }
    const { system } = setup()
    expect(predictedPosition(system, s, 160)).toEqual(v3(5, 0, 5))
    expect(predictedPosition(system, s, 100000)).toEqual(v3(5, 0, 5))
  })

  it('a track predicts the rail exactly until the next burn breaks it', () => {
    const { system, patrol } = setup()
    const arrive = firstArrival(patrol)
    const asOf = arrive + 1 // parked at p4, dwelling
    const state = resolveShip(system, patrolState(patrol, asOf), asOf)
    const track: Sighting = {
      quality: 'track',
      origin: 'scan',
      asOf,
      receivedAt: asOf,
      pos: shipPosition(system, state, asOf),
      state,
    }
    // Inside the dwell window the prediction is the truth…
    const tParked = arrive + PATROL_DWELL - 1
    expect(dist(predictedPosition(system, track, tParked), patrolPosition(patrol, tParked))).toBeLessThan(1e-6)

    // …after the next departure the ghost rides the stale rail while the
    // real patrol burns away — the divorce.
    const nextArrive = patrol.segments.filter((s) => s.state.mode === 'burn')[1]?.until ?? arrive + PATROL_DWELL + 20
    const tBurning = (arrive + PATROL_DWELL + nextArrive) / 2
    expect(dist(predictedPosition(system, track, tBurning), patrolPosition(patrol, tBurning))).toBeGreaterThan(1)
  })
})

describe('scan pulse', () => {
  it('solves the echo at emission: hit time, position, and round-trip delivery', () => {
    const { system, patrol, you } = setup()
    const origin = shipPosition(system, you, 1)
    const pulse = emitPulse(system, patrol, origin, 1)
    expect(pulse.echo).not.toBeNull()
    const echo = pulse.echo!
    expect(echo.quality).toBe('track')
    expect(echo.origin).toBe('scan')
    expect(echo.asOf).toBeGreaterThan(1)
    expect(echo.receivedAt).toBeGreaterThan(echo.asOf)
    // The wavefront radius at the hit equals the range at the hit.
    const range = dist(origin, patrolPosition(patrol, echo.asOf))
    expect(Math.abs(SCAN_SPEED * (echo.asOf - 1) - range)).toBeLessThan(0.5)
    expect(echo.receivedAt).toBeCloseTo(echo.asOf + range / SCAN_SPEED, 3)
    expect(echo.state).not.toBeNull()
  })

  it('resolves a clean miss when nothing is in range', () => {
    const { system, patrol } = setup()
    const pulse = emitPulse(system, patrol, v3(2000, 0, 0), 5)
    expect(pulse.echo).toBeNull()
    expect(pulse.clearAt).toBeCloseTo(5 + SCAN_MAX_RANGE / SCAN_SPEED)
  })

  it('delivers the echo as the latest sighting through the fold', () => {
    const { system, patrol } = setup()
    // A deep-space observer: no bubble contact muddying the step.
    const far: ShipState = { mode: 'idle', at: { kind: 'point', point: v3(0, 0, 200) } }
    const origin = shipPosition(system, far, 1)
    const pulse = emitPulse(system, patrol, origin, 1)
    expect(pulse.echo).not.toBeNull()
    const pending = { ...emptyKnowledge(), pulse }
    const early = stepKnowledge(system, patrol, far, pending, pulse.echo!.receivedAt - 0.1)
    expect(early.knowledge.pulse).not.toBeNull()
    expect(early.knowledge.latest).toBeNull()
    const delivered = stepKnowledge(system, patrol, far, pending, pulse.echo!.receivedAt + 0.1)
    expect(delivered.events).toContain('echo')
    expect(delivered.knowledge.pulse).toBeNull()
    expect(delivered.knowledge.latest?.quality).toBe('track')
    expect(delivered.knowledge.log[0]).toBe(pulse.echo)
  })

  it('clears a missed pulse through the fold', () => {
    const { system, patrol } = setup()
    const far: ShipState = { mode: 'idle', at: { kind: 'point', point: v3(2000, 0, 0) } }
    const pulse = emitPulse(system, patrol, v3(2000, 0, 0), 5)
    const cleared = stepKnowledge(system, patrol, far, { ...emptyKnowledge(), pulse }, pulse.clearAt + 0.1)
    expect(cleared.events).toContain('scan-clear')
    expect(cleared.knowledge.pulse).toBeNull()
    expect(cleared.knowledge.latest).toBeNull()
  })
})

describe('fmtTime', () => {
  it('renders the gossip timestamp', () => {
    expect(fmtTime(0)).toBe('0:00:00')
    expect(fmtTime(151)).toBe('0:02:31')
    expect(fmtTime(3671)).toBe('1:01:11')
    expect(fmtTime(-5)).toBe('0:00:00')
  })
})

describe('scenario sanity', () => {
  it('the opening dwell keeps the patrol inside the bubble for any seed', () => {
    for (const seed of [42, 43, 44, 45, 46]) {
      const { system, patrol, you } = setup(seed)
      // Opposite phases on the same insertion orbit: separation is at most
      // the orbit's diameter, which must sit inside the bubble.
      expect(dist(shipPosition(system, you, 0), patrolPosition(patrol, 0))).toBeLessThan(BUBBLE_RADIUS)
    }
  })
})
